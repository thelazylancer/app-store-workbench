import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadAppAssets } from "../../server/lib/assetStore";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "competitor-assets-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("downloadAppAssets", () => {
  it("stores icon and screenshots locally and reports partial when one image fails", async () => {
    const dir = await tempDir();
    vi.stubEnv("COMPETITOR_DATA_DIR", dir);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("shot-1.jpg")) return new Response("missing", { status: 404 });
      return new Response(url.endsWith("icon.png") ? "icon-bytes" : "shot-bytes");
    });

    const result = await downloadAppAssets("2026-11-18", "com.example.app", "https://cdn.example/icon.png", [
      "https://cdn.example/shot-1.jpg",
      "https://cdn.example/shot-2.jpg",
    ]);

    expect(result.status).toBe("partial");
    expect(result.assets.map((asset) => asset.type)).toEqual(["icon", "screenshot"]);
    expect(result.assets.every((asset) => asset.localPath.startsWith("2026-11-18/com.example.app/"))).toBe(true);
    expect(await readFile(path.join(dir, result.assets[0]!.localPath), "utf8")).toBe("icon-bytes");
    expect(await readFile(path.join(dir, result.assets[1]!.localPath), "utf8")).toBe("shot-bytes");
  });

  it("reports ok only when every requested image is saved", async () => {
    const dir = await tempDir();
    vi.stubEnv("COMPETITOR_DATA_DIR", dir);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("bytes"));

    const result = await downloadAppAssets("2026-11-18", "com.example.app", "https://cdn.example/icon.png", [
      "https://cdn.example/shot-1.jpg",
    ]);

    expect(result.status).toBe("ok");
    expect(result.assets).toHaveLength(2);
  });

  it("reports skipped when the app has no image urls", async () => {
    const dir = await tempDir();
    vi.stubEnv("COMPETITOR_DATA_DIR", dir);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await downloadAppAssets("2026-11-18", "com.example.app", "", []);

    expect(result).toEqual({ assets: [], status: "skipped" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports failed when no image can be downloaded", async () => {
    const dir = await tempDir();
    vi.stubEnv("COMPETITOR_DATA_DIR", dir);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("gone", { status: 404 }));

    const result = await downloadAppAssets("2026-11-18", "com.example.app", "https://cdn.example/icon.png", []);

    expect(result).toEqual({ assets: [], status: "failed" });
  });
});
