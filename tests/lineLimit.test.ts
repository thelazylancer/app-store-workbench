import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MAX_LINES = 500;

// Legacy over-limit files (ARCH §7). Entries may be removed, never added.
const LEGACY_EXEMPT: string[] = [];

function lineCount(path: string): number {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "");
  return text === "" ? 0 : text.split("\n").length;
}

function sourceFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "-c", "-o", "--exclude-standard", "-z", "--", "*.ts", "*.tsx", "*.css"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    // A tracked file deleted in the worktree is still listed until it is committed.
    .filter((file) => existsSync(file));
}

describe("500-line discipline", () => {
  it("has no legacy exemptions", () => {
    expect(LEGACY_EXEMPT).toEqual([]);
  });

  it("rejects source files over 500 lines unless legacy-exempt", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const exempt = new Set(LEGACY_EXEMPT);
    const overLimit = files.filter((file) => !exempt.has(file) && lineCount(file) > MAX_LINES);

    expect(overLimit, `Files over ${MAX_LINES} lines:\n${overLimit.join("\n")}`).toEqual([]);
  });
});
