import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { PermissionUpdate } from "../../server/lib/competitorRepo";

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

const repo = {
  listDays: async () => [],
  getDay: async () => null,
  getPackage: async () => null,
  getPackageHistory: async () => [],
  getSummary: async () => [],
  getBatch: async () => null,
  getCountryHits: async () => [],
};

async function post(app: Awaited<ReturnType<typeof createTestApp>>, body: unknown) {
  return request(app.server).post("/api/competitor/permissions").send(body as object);
}

function appWith(writer: { updateAttribution?: unknown; updatePermissions: unknown }) {
  return createTestApp({
    ...baseDeps,
    competitorRepo: repo,
    competitorWriter: { updateAttribution: async () => [], ...writer } as never,
  });
}

describe("POST /api/competitor/permissions", () => {
  it("deduplicates, sorts and reports updated and missing packages", async () => {
    const updatePermissions = vi.fn(async (entries: PermissionUpdate[]) =>
      entries.filter((entry) => entry.packageCode !== "com.example.missing").map((entry) => entry.packageCode));
    const app = await appWith({ updatePermissions });

    const response = await post(app, {
      updates: [
        { packageCode: "com.example.one", permissions: ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription", "NSCameraUsageDescription"] },
        { packageCode: "com.example.two", permissions: null },
        { packageCode: "com.example.missing", permissions: ["NSPhotoLibraryUsageDescription"] },
      ],
    });

    expect(response.status).toBe(200);
    expect(updatePermissions).toHaveBeenCalledWith([
      { packageCode: "com.example.one", permissions: ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription"] },
      { packageCode: "com.example.two", permissions: null },
      { packageCode: "com.example.missing", permissions: ["NSPhotoLibraryUsageDescription"] },
    ]);
    expect(response.body).toEqual({
      updated: ["com.example.one", "com.example.two"],
      missing: ["com.example.missing"],
    });
  });

  it("keeps the last duplicate entry", async () => {
    const updatePermissions = vi.fn(async (entries: PermissionUpdate[]) => entries.map((entry) => entry.packageCode));
    const app = await appWith({ updatePermissions });

    await post(app, {
      updates: [
        { packageCode: "com.example.one", permissions: ["NSCameraUsageDescription"] },
        { packageCode: "com.example.one", permissions: [] },
      ],
    });
    expect(updatePermissions).toHaveBeenCalledWith([{ packageCode: "com.example.one", permissions: [] }]);
  });

  it("rejects malformed updates before touching the writer", async () => {
    const updatePermissions = vi.fn(async () => []);
    const app = await appWith({ updatePermissions });

    for (const body of [
      {},
      { updates: [] },
      { updates: [{ packageCode: "com.example.one" }] },
      { updates: [{ packageCode: "not a code!", permissions: [] }] },
      { updates: [{ packageCode: "com.example.one", permissions: "NSCameraUsageDescription" }] },
      { updates: [{ packageCode: "com.example.one", permissions: ["camera"] }] },
      { updates: [{ packageCode: "com.example.one", permissions: ["NSCameraUsageDescription", 42] }] },
      { updates: [{ packageCode: "com.example.one", permissions: Array.from({ length: 101 }, () => "NSCameraUsageDescription") }] },
      { updates: Array.from({ length: 501 }, () => ({ packageCode: "com.example.one", permissions: [] })) },
    ]) {
      expect((await post(app, body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(updatePermissions).not.toHaveBeenCalled();
  });

  it("returns 503 without a writer and 500 when the write fails", async () => {
    const readOnly = await createTestApp({ ...baseDeps, competitorRepo: repo });
    expect((await post(readOnly, { updates: [{ packageCode: "com.example.one", permissions: [] }] })).status)
      .toBe(503);

    const throwing = {
      updateAttribution: async () => [],
      updatePermissions: vi.fn(async () => { throw new Error("boom"); }),
    };
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo, competitorWriter: throwing });
    expect((await post(app, { updates: [{ packageCode: "com.example.one", permissions: [] }] })).status)
      .toBe(500);
  });
});
