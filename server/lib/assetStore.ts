import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type DownloadedAsset = {
  type: "icon" | "screenshot";
  sourceUrl: string;
  localPath: string;
};

export type AssetDownloadResult = {
  assets: DownloadedAsset[];
  status: "ok" | "partial" | "failed" | "skipped";
};

const REQUEST_TIMEOUT_MS = 30_000;

function sanitize(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "asset";
}

function fileNameFor(url: string, prefix: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "asset";
    return `${prefix}-${sanitize(decodeURIComponent(last))}`;
  } catch {
    return `${prefix}-asset`;
  }
}

function dataDir(): string {
  return process.env.COMPETITOR_DATA_DIR ?? path.resolve("data/competitor");
}

/**
 * Downloads one app's icon and screenshots into
 * `data/competitor/<target_date>/<package_code>/`. Network or per-image errors
 * are reported through the status; only filesystem failures throw.
 */
export async function downloadAppAssets(
  targetDate: string,
  packageCode: string,
  iconUrl: string,
  screenshotUrls: string[],
): Promise<AssetDownloadResult> {
  const dateDir = sanitize(targetDate);
  const packageDir = sanitize(packageCode);
  const targetDir = path.join(dataDir(), dateDir, packageDir);
  await mkdir(targetDir, { recursive: true });

  const sources: Array<{ type: DownloadedAsset["type"]; url: string }> = [];
  if (iconUrl.trim()) sources.push({ type: "icon", url: iconUrl.trim() });
  for (const url of [...new Set(screenshotUrls.map((item) => item.trim()).filter(Boolean))]) {
    sources.push({ type: "screenshot", url });
  }

  const assets: DownloadedAsset[] = [];
  for (const [index, source] of sources.entries()) {
    let bytes: Buffer;
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) continue;
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      continue;
    }

    const fileName = fileNameFor(
      source.url,
      source.type === "icon" ? "icon" : `shot-${index}`,
    );
    // Filesystem failures (disk full, permissions) intentionally propagate.
    await writeFile(path.join(targetDir, fileName), bytes);
    assets.push({
      type: source.type,
      sourceUrl: source.url,
      localPath: [dateDir, packageDir, fileName].join("/"),
    });
  }

  const status = sources.length === 0
    ? "skipped"
    : assets.length === sources.length ? "ok" : assets.length > 0 ? "partial" : "failed";
  return { assets, status };
}
