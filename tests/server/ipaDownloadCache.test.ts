import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIpaDownloadManager,
  type DownloadRunner,
} from "../../server/lib/ipaDownload";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "ipa-cache-"));
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

describe("IPA download cache and naming", () => {
  it("reuses a completed download instead of running ipatool again", async () => {
    const dir = await tempDir();
    const runner = vi.fn(successRunner);
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const first = manager.createJob("com.example.cached");
    await vi.waitFor(() => expect(manager.getJob(first.id)?.status).toBe("done"));

    const second = manager.createJob("com.example.cached");
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("done");
    expect(second.fileUrl).toBe(`/api/ipa-download/${first.id}/file`);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh download when the cached file was cleaned up", async () => {
    const dir = await tempDir();
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner: successRunner });

    const first = manager.createJob("com.example.recleaned");
    await vi.waitFor(() => expect(manager.getJob(first.id)?.status).toBe("done"));
    await rm(path.join(dir, manager.getJob(first.id)!.fileName!));

    const second = manager.createJob("com.example.recleaned");
    expect(second.id).not.toBe(first.id);
    await vi.waitFor(() => expect(manager.getJob(second.id)?.status).toBe("done"));
  });

  it("names downloads by team, app name and the Shanghai date", async () => {
    const dir = await tempDir();
    const manager = createIpaDownloadManager({
      ipatoolBin: "ipatool",
      downloadsDir: dir,
      runner: successRunner,
      // 2026-11-22 17:00 UTC is 2026-11-23 in Asia/Shanghai.
      now: () => Date.UTC(2026, 10, 22, 17),
    });

    const job = manager.createJob("com.example.named", { team: "LC", appName: "Misate / Pro" });
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
    expect(manager.getJob(job.id)?.fileName).toBe("2026-11-23_LC_Misate-Pro.ipa");
  });

  it("reuses a job already in flight for the same bundle", async () => {
    const dir = await tempDir();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = vi.fn(async (_bundleId: string, outPath: string) => {
      await gate;
      await writeFile(outPath, "fake-ipa-bytes");
      return { exitCode: 0, output: "success=true" };
    });
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const first = manager.createJob("com.example.once");
    const second = manager.createJob("com.example.once");
    expect(second.id).toBe(first.id);

    release();
    await vi.waitFor(() => expect(manager.getJob(first.id)?.status).toBe("done"));
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("re-dates a cache hit to the current download day", async () => {
    const dir = await tempDir();
    let clock = Date.UTC(2026, 10, 20, 4);
    const manager = createIpaDownloadManager({
      ipatoolBin: "ipatool",
      downloadsDir: dir,
      runner: successRunner,
      now: () => clock,
    });

    const first = manager.createJob("com.example.redate", { team: "LC", appName: "Misate" });
    await vi.waitFor(() => expect(manager.getJob(first.id)?.status).toBe("done"));
    expect(manager.getJob(first.id)?.fileName).toBe("2026-11-20_LC_Misate.ipa");

    clock = Date.UTC(2026, 10, 23, 4);
    const second = manager.createJob("com.example.redate", { team: "LC", appName: "Misate" });
    expect(second.id).toBe(first.id);
    expect(second.fileName).toBe("2026-11-23_LC_Misate.ipa");
    await expect(stat(path.join(dir, "2026-11-23_LC_Misate.ipa"))).resolves.toBeTruthy();
    await expect(stat(path.join(dir, "2026-11-20_LC_Misate.ipa"))).rejects.toThrow();
  });

  it("keeps the team prefix when a cache hit has no team metadata", async () => {
    const dir = await tempDir();
    let clock = Date.UTC(2026, 10, 20, 4);
    const manager = createIpaDownloadManager({
      ipatoolBin: "ipatool",
      downloadsDir: dir,
      runner: successRunner,
      now: () => clock,
    });

    const first = manager.createJob("com.example.keep", { team: "LC", appName: "Misate" });
    await vi.waitFor(() => expect(manager.getJob(first.id)?.status).toBe("done"));

    clock = Date.UTC(2026, 10, 23, 4);
    const second = manager.createJob("com.example.keep", { appName: "Misate" });
    expect(second.id).toBe(first.id);
    expect(second.fileName).toBe("2026-11-20_LC_Misate.ipa");
  });

  it("fails a verification prompt left unanswered for a day", async () => {
    const dir = await tempDir();
    let clock = Date.UTC(2026, 10, 20, 4);
    const runner: DownloadRunner = async () => ({
      exitCode: 0,
      output: 'ERR error="auth code is required" success=false',
    });
    const manager = createIpaDownloadManager({
      ipatoolBin: "ipatool",
      downloadsDir: dir,
      runner,
      now: () => clock,
    });

    const job = manager.createJob("com.example.stale");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("awaiting_auth_code"));

    clock += 25 * 60 * 60 * 1000;
    await manager.cleanupExpired(clock);
    expect(manager.getJob(job.id)).toMatchObject({ status: "failed", errorCode: "timeout" });
  });
});
