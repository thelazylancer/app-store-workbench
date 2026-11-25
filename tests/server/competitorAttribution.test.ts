import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { AttributionUpdate } from "../../server/lib/competitorRepo";

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
  return request(app.server).post("/api/competitor/attribution").send(body as object);
}

describe("POST /api/competitor/attribution", () => {
  it("normalizes values and reports updated and missing packages", async () => {
    const updateAttribution = vi.fn(async (entries: AttributionUpdate[]) =>
      entries.filter((entry) => entry.packageCode !== "com.example.missing").map((entry) => entry.packageCode));
    const app = await createTestApp({
      ...baseDeps, competitorRepo: repo, competitorWriter: { updateAttribution },
    });

    const response = await post(app, {
      updates: [
        { packageCode: "com.example.one", attribution: "  AppsFlyer " },
        { packageCode: "com.example.two", attribution: null },
        { packageCode: "com.example.missing", attribution: "adjust" },
      ],
    });

    expect(response.status).toBe(200);
    expect(updateAttribution).toHaveBeenCalledWith([
      { packageCode: "com.example.one", attribution: "appsflyer" },
      { packageCode: "com.example.two", attribution: null },
      { packageCode: "com.example.missing", attribution: "adjust" },
    ]);
    expect(response.body).toEqual({
      updated: ["com.example.one", "com.example.two"],
      missing: ["com.example.missing"],
    });
  });

  it("keeps the last duplicate entry", async () => {
    const updateAttribution = vi.fn(async (entries: AttributionUpdate[]) => entries.map((entry) => entry.packageCode));
    const app = await createTestApp({
      ...baseDeps, competitorRepo: repo, competitorWriter: { updateAttribution },
    });

    await post(app, {
      updates: [
        { packageCode: "com.example.one", attribution: "adjust" },
        { packageCode: "com.example.one", attribution: "branch" },
      ],
    });
    expect(updateAttribution).toHaveBeenCalledWith([{ packageCode: "com.example.one", attribution: "branch" }]);
  });

  it("rejects malformed updates before touching the writer", async () => {
    const updateAttribution = vi.fn(async () => []);
    const app = await createTestApp({
      ...baseDeps, competitorRepo: repo, competitorWriter: { updateAttribution },
    });

    for (const body of [
      {},
      { updates: [] },
      { updates: [{ packageCode: "com.example.one" }] },
      { updates: [{ packageCode: "not a code!", attribution: "adjust" }] },
      { updates: [{ packageCode: "com.example.one", attribution: "" }] },
      { updates: [{ packageCode: "com.example.one", attribution: "x".repeat(65) }] },
      { updates: Array.from({ length: 501 }, () => ({ packageCode: "com.example.one", attribution: "adjust" })) },
    ]) {
      expect((await post(app, body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(updateAttribution).not.toHaveBeenCalled();
  });

  it("returns 503 without a writer and 500 when the write fails", async () => {
    const readOnly = await createTestApp({ ...baseDeps, competitorRepo: repo });
    expect((await post(readOnly, { updates: [{ packageCode: "com.example.one", attribution: "adjust" }] })).status)
      .toBe(503);

    const throwing = { updateAttribution: vi.fn(async () => { throw new Error("boom"); }) };
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo, competitorWriter: throwing });
    expect((await post(app, { updates: [{ packageCode: "com.example.one", attribution: "adjust" }] })).status)
      .toBe(500);
  });
});
