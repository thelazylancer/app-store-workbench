import { mkdtemp, readdir, rename, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIpaDownloadManager, type DownloadRunner } from "../../server/lib/ipaDownload";

const dirs: string[] = [];

async function tempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "ipa-download-"));
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

describe("IPA download manager", () => {
  it("runs a queued job through progress to a downloadable file", async () => {
    const dir = await tempDir();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: DownloadRunner = async (_bundleId, outPath, onOutput) => {
      onOutput("Downloading 42%\n");
      await gate;
      await writeFile(outPath, "fake-ipa-bytes");
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.app");
    expect(job.status).toBe("queued");
    expect(job.fileUrl).toBeNull();

    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("running"));
    await vi.waitFor(() => expect(manager.getJob(job.id)?.progress).toBe(42));
    release();
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));

    const done = manager.getJob(job.id)!;
    expect(done.progress).toBe(100);
    expect(done.fileUrl).toBe(`/api/ipa-download/${job.id}/file`);
    expect(done.sizeBytes).toBe("fake-ipa-bytes".length);
    expect(done.fileName).toContain("com.example.app-");
    expect(await readdir(dir)).toEqual([done.fileName]);
    expect(manager.getFilePath(job.id)).toBe(path.join(dir, done.fileName!));
  });

  it("classifies App Store terms failures even when ipatool exits zero", async () => {
    const dir = await tempDir();
    const runner: DownloadRunner = async () => ({
      exitCode: 0,
      output: "ERR unsupported import dyld_lazy_load AMSOpenURL success=false",
    });
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.blocked");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("failed"));

    const failed = manager.getJob(job.id)!;
    expect(failed.errorCode).toBe("terms_required");
    expect(failed.fileUrl).toBeNull();
    expect(manager.getFilePath(job.id)).toBeNull();
  });

  it("parks purchases that need a 2FA code and resumes with the submitted code", async () => {
    const dir = await tempDir();
    const seenCodes: Array<string | undefined> = [];
    const runner: DownloadRunner = async (_bundleId, outPath, _onOutput, _signal, authCode) => {
      seenCodes.push(authCode);
      if (!authCode) return { exitCode: 0, output: 'ERR error="auth code is required" success=false' };
      await writeFile(outPath, "unowned-ipa");
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.unowned");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("awaiting_auth_code"));
    expect(manager.getJob(job.id)?.errorCode).toBe("purchase_auth_required");
    expect(manager.getFilePath(job.id)).toBeNull();

    const resumed = manager.submitAuthCode(job.id, "123456");
    expect(resumed?.status).toBe("queued");

    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
    expect(seenCodes).toEqual([undefined, "123456"]);
    expect(manager.getFilePath(job.id)).not.toBeNull();
  });

  it("asks for a fresh code when Apple rejects the submitted one", async () => {
    const dir = await tempDir();
    const runner: DownloadRunner = async (_bundleId, outPath, _onOutput, _signal, authCode) => {
      if (!authCode) return { exitCode: 0, output: 'ERR error="auth code is required" success=false' };
      if (authCode === "000000") {
        return { exitCode: 0, output: "ERR error=\"apple did not complete verification; try a fresh 2FA code\" success=false" };
      }
      await writeFile(outPath, "ipa");
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.unowned");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("awaiting_auth_code"));

    manager.submitAuthCode(job.id, "000000");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("awaiting_auth_code"));
    expect(manager.getJob(job.id)?.errorCode).toBe("auth_code_invalid");

    manager.submitAuthCode(job.id, "654321");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
  });

  it("ignores auth codes for jobs that are not waiting for one", async () => {
    const dir = await tempDir();
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner: successRunner });

    expect(manager.submitAuthCode("missing", "123456")).toBeNull();
    const job = manager.createJob("com.example.app");
    expect(manager.submitAuthCode(job.id, "123456")).toBeNull();
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
    expect(manager.submitAuthCode(job.id, "123456")).toBeNull();
  });

  it("reports how many bytes have been written while the download runs", async () => {
    const dir = await tempDir();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner: DownloadRunner = async (_bundleId, outPath) => {
      await writeFile(`${outPath}.tmp`, "0123456789");
      await gate;
      await rename(`${outPath}.tmp`, outPath);
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.progress");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.bytesDownloaded).toBe(10), { timeout: 3000 });
    release();
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
    expect(manager.getJob(job.id)?.bytesDownloaded).toBe(10);
  });

  it("retries once after a storefront resolution failure", async () => {
    const dir = await tempDir();
    let calls = 0;
    const runner: DownloadRunner = async (_bundleId, outPath) => {
      calls += 1;
      if (calls === 1) {
        return { exitCode: 1, output: "failed to resolve the country code: available storefronts request failed success=false" };
      }
      await writeFile(outPath, "retried");
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.retry");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
    expect(calls).toBe(2);
  });

  it("keeps the submitted auth code across a storefront retry", async () => {
    const dir = await tempDir();
    const seenCodes: Array<string | undefined> = [];
    const runner: DownloadRunner = async (_bundleId, outPath, _onOutput, _signal, authCode) => {
      seenCodes.push(authCode);
      if (!authCode) return { exitCode: 0, output: 'ERR error="auth code is required" success=false' };
      if (seenCodes.length === 2) {
        return { exitCode: 1, output: "available storefronts request failed success=false" };
      }
      await writeFile(outPath, "unowned-ipa");
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const job = manager.createJob("com.example.unowned");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("awaiting_auth_code"));

    manager.submitAuthCode(job.id, "123456");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("done"));
    expect(seenCodes).toEqual([undefined, "123456", "123456"]);
  });

  it("fails with a timeout when the runner stalls past the deadline", async () => {
    const dir = await tempDir();
    const runner: DownloadRunner = (_bundleId, _outPath, _onOutput, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner, timeoutMs: 30 });

    const job = manager.createJob("com.example.slow");
    await vi.waitFor(() => expect(manager.getJob(job.id)?.status).toBe("failed"));
    expect(manager.getJob(job.id)?.errorCode).toBe("timeout");
  });

  it("runs one job at a time and keeps later jobs queued", async () => {
    const dir = await tempDir();
    const gates: Array<() => void> = [];
    const started: string[] = [];
    const runner: DownloadRunner = async (bundleId, outPath) => {
      started.push(bundleId);
      await new Promise<void>((resolve) => gates.push(resolve));
      await writeFile(outPath, bundleId);
      return { exitCode: 0, output: "success=true" };
    };
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, runner });

    const first = manager.createJob("com.example.one");
    const second = manager.createJob("com.example.two");
    expect(second.status).toBe("queued");
    expect(second.queuePosition).toBe(1);
    expect(second.activeJob).toBeNull();

    await vi.waitFor(() => expect(started).toEqual(["com.example.one"]));
    const queuedView = manager.getJob(second.id)!;
    expect(queuedView.status).toBe("queued");
    expect(queuedView.queuePosition).toBe(1);
    expect(queuedView.activeJob).toMatchObject({ bundleId: "com.example.one", status: "running" });
    expect(manager.getJob(first.id)?.queuePosition).toBeNull();
    expect(manager.getJob(first.id)?.activeJob).toBeNull();

    gates.shift()!();
    await vi.waitFor(() => expect(started).toEqual(["com.example.one", "com.example.two"]));
    gates.shift()!();

    await vi.waitFor(() => expect(manager.getJob(second.id)?.status).toBe("done"));
    expect(manager.getJob(first.id)?.status).toBe("done");
  });

  it("removes only IPA files older than the retention window", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, "old.ipa"), "old");
    await writeFile(path.join(dir, "stale.ipa.tmp"), "stale");
    await writeFile(path.join(dir, "fresh.ipa"), "fresh");
    await writeFile(path.join(dir, "notes.txt"), "other");
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(path.join(dir, "old.ipa"), eightDaysAgo, eightDaysAgo);
    await utimes(path.join(dir, "stale.ipa.tmp"), eightDaysAgo, eightDaysAgo);
    const manager = createIpaDownloadManager({ ipatoolBin: "ipatool", downloadsDir: dir, retentionDays: 7, runner: successRunner });

    expect((await manager.cleanupExpired()).sort()).toEqual(["old.ipa", "stale.ipa.tmp"]);
    expect((await readdir(dir)).sort()).toEqual(["fresh.ipa", "notes.txt"]);
  });
});
