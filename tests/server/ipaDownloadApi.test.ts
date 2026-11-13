import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { createIpaDownloadManager, type DownloadRunner } from "../../server/lib/ipaDownload";
import type { IapHints } from "../../shared/types";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "ipa-api-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

const successRunner: DownloadRunner = async (_bundleId, outPath) => {
  await writeFile(outPath, "fake-ipa-bytes");
  return { exitCode: 0, output: "success=true" };
};

const awaitingRunner: DownloadRunner = async (_bundleId, outPath, _onOutput, _signal, authCode) => {
  if (!authCode) return { exitCode: 0, output: 'ERR error="auth code is required" success=false' };
  await writeFile(outPath, "unowned-ipa-bytes");
  return { exitCode: 0, output: "success=true" };
};

function buildApp(ipaDownload?: ReturnType<typeof createIpaDownloadManager>) {
  return createApp({
    lookupAppById: async () => null,
    lookupAppStore: async () => [],
    fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
    buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as IapHints),
    ...(ipaDownload ? { ipaDownload } : {}),
  });
}

describe("IPA download API", () => {
  it("reports unavailability when no manager is configured", async () => {
    const app = buildApp();
    expect((await request(app).post("/api/ipa-download").send({ bundleId: "com.example.app" })).status).toBe(503);
    expect((await request(app).get("/api/ipa-download/abc")).status).toBe(503);
    expect((await request(app).get("/api/ipa-download/abc/file")).status).toBe(503);
    expect((await request(app).post("/api/ipa-download/abc/auth-code").send({ code: "123456" })).status).toBe(503);
  });

  it("accepts a 6-digit verification code only for jobs that are waiting for one", async () => {
    const dir = await tempDir();
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner: awaitingRunner });
    const app = buildApp(manager);

    const created = await request(app).post("/api/ipa-download").send({ bundleId: "com.example.unowned" });
    const id = created.body.id;
    await vi.waitFor(() => expect(manager.getJob(id)?.status).toBe("awaiting_auth_code"));

    for (const body of [{}, { code: "" }, { code: "12345" }, { code: "1234567" }, { code: "abcdef" }]) {
      expect((await request(app).post(`/api/ipa-download/${id}/auth-code`).send(body)).status).toBe(400);
    }
    expect((await request(app).post("/api/ipa-download/unknown/auth-code").send({ code: "123456" })).status).toBe(404);

    const accepted = await request(app).post(`/api/ipa-download/${id}/auth-code`).send({ code: "123456" });
    expect(accepted.status).toBe(202);
    expect(accepted.body).toMatchObject({ status: "queued", errorCode: null });

    await vi.waitFor(() => expect(manager.getJob(id)?.status).toBe("done"));
    expect((await request(app).post(`/api/ipa-download/${id}/auth-code`).send({ code: "123456" })).status).toBe(409);
  });

  it("validates Bundle IDs and unknown jobs", async () => {
    const dir = await tempDir();
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner: successRunner });
    const app = buildApp(manager);

    for (const bundleId of ["", " ", "bad id", "-leading", "a".repeat(256)]) {
      expect((await request(app).post("/api/ipa-download").send({ bundleId })).status).toBe(400);
    }
    expect((await request(app).post("/api/ipa-download").send({})).status).toBe(400);
    expect((await request(app).get("/api/ipa-download/unknown")).status).toBe(404);

    const created = await request(app).post("/api/ipa-download").send({ bundleId: "com.example.app" });
    expect(created.status).toBe(202);
    expect(created.body).toMatchObject({ bundleId: "com.example.app", status: "queued" });

    const status = await request(app).get(`/api/ipa-download/${created.body.id}`);
    expect(status.status).toBe(200);
    expect(status.body.bundleId).toBe("com.example.app");
  });

  it("serves the finished IPA as an attachment and 404s before it is ready", async () => {
    const dir = await tempDir();
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner: successRunner });
    const app = buildApp(manager);

    const created = await request(app).post("/api/ipa-download").send({ bundleId: "com.example.app" });
    const id = created.body.id;

    expect((await request(app).get(`/api/ipa-download/${id}/file`)).status).toBe(404);

    await vi.waitFor(() => expect(manager.getJob(id)?.status).toBe("done"));
    const file = await request(app).get(`/api/ipa-download/${id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toContain('attachment; filename="com.example.app.ipa"');
    expect(file.body.toString()).toBe("fake-ipa-bytes");
  });
});
