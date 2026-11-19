import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "competitor-static-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

function appFor(root: string) {
  return createApp({
    lookupAppById: async () => null,
    lookupAppStore: async () => [],
    lookupAppByBundleId: async () => null,
    fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
    buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
    competitorAssetsDir: root,
  });
}

describe("GET /competitor-assets", () => {
  it("serves locally downloaded files and rejects path traversal", async () => {
    const root = await tempDir();
    const dir = path.join(root, "2026-11-18", "com.example.app");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "icon.png"), "icon-bytes");
    const app = appFor(root);

    const icon = await request(app).get("/competitor-assets/2026-11-18/com.example.app/icon.png");
    expect(icon.status).toBe(200);
    expect(icon.body.toString()).toBe("icon-bytes");

    expect((await request(app).get("/competitor-assets/2026-11-18/com.example.app/missing.png")).status).toBe(404);
    expect((await request(app).get("/competitor-assets/%2e%2e/%2e%2e/package.json")).status).toBe(404);
  });
});
