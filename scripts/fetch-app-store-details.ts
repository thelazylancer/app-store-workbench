import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const US_STOREFRONT = "143441-1,29";
const DEFAULT_DELAY_MS = 300;
const REQUEST_RETRIES = 3;

type InputRow = {
  team: string;
  firstLaunchDate: string;
  packageName: string;
  searchName: string;
  pkgName: string;
  listingDate: string;
  hundredFirstDay: string;
  delistingDate: string;
};

type MatchStatus = "matched" | "needs_review" | "not_found_us" | "fetch_failed";

type NameCandidate = {
  name: string | null;
  bundleId: string | null;
  sellerName: string | null;
  trackId: number | null;
  url: string | null;
  minimumOsVersion: string | null;
};

type RawCache = {
  fetchedAt: string;
  source: InputRow;
  lookupUrl: string;
  lookup: any | null;
  nameSearchUrl: string | null;
  nameSearch: any | null;
  detailUrl: string | null;
  detail: any | null;
  error: string | null;
};

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function readInputRows(path: string): InputRow[] {
  const [headerRow, ...dataRows] = parseCsv(readFileSync(path, "utf8"));
  const headers = (headerRow ?? []).map((header) => header.trim());
  const required = [
    "App团队",
    "首投日期",
    "包名",
    "搜索名",
    "pkg_name",
    "上架日期",
    "100+首日",
    "下架日期",
  ];

  for (const name of required) {
    if (!headers.includes(name)) {
      throw new Error(`Input CSV is missing required column: ${name}`);
    }
  }

  const valueAt = (row: string[], name: string) => row[headers.indexOf(name)] ?? "";

  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => ({
      team: valueAt(row, "App团队"),
      firstLaunchDate: valueAt(row, "首投日期"),
      packageName: valueAt(row, "包名"),
      searchName: valueAt(row, "搜索名"),
      pkgName: valueAt(row, "pkg_name"),
      listingDate: valueAt(row, "上架日期"),
      hundredFirstDay: valueAt(row, "100+首日"),
      delistingDate: valueAt(row, "下架日期"),
    }));
}

let lastRequestAt = 0;

async function requestJson(
  url: string,
  headers: Record<string, string>,
  delayMs: number,
): Promise<any> {
  let lastError: unknown = new Error("request failed");

  for (let attempt = 0; attempt < REQUEST_RETRIES; attempt += 1) {
    const waitMs = delayMs - (Date.now() - lastRequestAt);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const text = await response.text();
      return JSON.parse(text);
    } catch (error) {
      lastError = error;

      if (attempt < REQUEST_RETRIES - 1) {
        await sleep(5000 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = temp;
    }
  }

  return previous[b.length];
}

function namesMatch(expectedName: string, storeName: string | null): boolean {
  if (!storeName) {
    return false;
  }

  const expected = normalizeName(expectedName);
  const actual = normalizeName(storeName);

  if (!expected || !actual) {
    return false;
  }

  if (expected === actual || actual.includes(expected) || expected.includes(actual)) {
    return true;
  }

  const actualTokens = actual.split(" ");
  const expectedLength = Array.from(expected).length;

  return [actual, ...actualTokens].some((candidate) => {
    const candidateLength = Array.from(candidate).length;

    if (Math.abs(candidateLength - expectedLength) > 2) {
      return false;
    }

    return levenshtein(expected, candidate) <= 2;
  });
}

function materializeMediaUrl(item: any): string {
  const rawUrl = typeof item?.url === "string" ? item.url : "";

  if (!rawUrl || !rawUrl.includes("{")) {
    return rawUrl;
  }

  const width = item?.width;
  const height = item?.height;

  if (typeof width !== "number" || typeof height !== "number") {
    return "";
  }

  return rawUrl
    .replace("{w}", String(width))
    .replace("{h}", String(height))
    .replace("{c}", "bb")
    .replace("{f}", "jpg");
}

function collectMediaByType(mediaByType: any): Record<string, Array<{ url: string; width: number | null; height: number | null }>> {
  const collected: Record<string, Array<{ url: string; width: number | null; height: number | null }>> = {};

  if (!mediaByType || typeof mediaByType !== "object") {
    return collected;
  }

  for (const [type, items] of Object.entries(mediaByType)) {
    if (!Array.isArray(items)) {
      continue;
    }

    const urls = items
      .map((item: any) => ({
        url: materializeMediaUrl(item),
        width: typeof item?.width === "number" ? item.width : null,
        height: typeof item?.height === "number" ? item.height : null,
      }))
      .filter((item) => item.url);

    if (urls.length > 0) {
      collected[type] = urls;
    }
  }

  return collected;
}

function flattenMediaByPrefix(
  mediaByType: Record<string, Array<{ url: string }>>,
  prefix: string,
): string[] {
  const urls: string[] = [];

  for (const [type, items] of Object.entries(mediaByType)) {
    if (type.toLowerCase().startsWith(prefix)) {
      urls.push(...items.map((item) => item.url));
    }
  }

  return [...new Set(urls)];
}

function extractAppDetails(lookupResult: any, detailBody: any): Record<string, any> | null {
  if (!lookupResult && !detailBody) {
    return null;
  }

  const results = detailBody?.storePlatformData?.["product-dv"]?.results;
  const detailApp: any =
    results && typeof results === "object" ? Object.values(results)[0] ?? null : null;
  const pageData = detailBody?.pageData ?? null;
  const softwareInfo = detailApp?.softwareInfo ?? {};
  const offers = Array.isArray(detailApp?.offers) ? detailApp.offers : [];
  const firstOffer = offers[0] ?? null;
  const addOns = Array.isArray(pageData?.addOns) ? pageData.addOns : [];
  const versionEntries = Array.isArray(pageData?.versionHistory) ? pageData.versionHistory : [];
  const screenshotsByType = collectMediaByType(detailApp?.screenshotsByType);
  const previewVideosByType = collectMediaByType(detailApp?.videoPreviewByType);
  const iphoneScreenshotsFromDetail = flattenMediaByPrefix(screenshotsByType, "iphone");
  const ipadScreenshots = flattenMediaByPrefix(screenshotsByType, "ipad");
  const lookupScreenshotUrls = Array.isArray(lookupResult?.screenshotUrls)
    ? lookupResult.screenshotUrls
    : [];
  const iphoneScreenshots =
    iphoneScreenshotsFromDetail.length > 0 ? iphoneScreenshotsFromDetail : lookupScreenshotUrls;  const otherScreenshots = [...new Set(
    Object.entries(screenshotsByType)
      .filter(([type]) => !type.toLowerCase().startsWith("iphone") && !type.toLowerCase().startsWith("ipad"))
      .flatMap(([, items]) => items.map((item) => item.url)),
  )];
  const previewVideos = [...new Set(
    Object.values(previewVideosByType).flatMap((items) => items.map((item) => item.url)),
  )];
  const languages =
    typeof softwareInfo.languagesDisplayString === "string"
      ? softwareInfo.languagesDisplayString.split(/,\s*/).filter(Boolean)
      : Array.isArray(lookupResult?.languageCodesISO2A)
        ? lookupResult.languageCodesISO2A
        : [];

  return {
    trackId: lookupResult?.trackId ?? null,
    bundleId: lookupResult?.bundleId ?? detailApp?.bundleId ?? null,
    name: detailApp?.name ?? lookupResult?.trackName ?? null,
    subtitle: detailApp?.subtitle ?? null,
    description: detailApp?.description?.standard ?? lookupResult?.description ?? "",
    url: detailApp?.url ?? lookupResult?.trackViewUrl ?? null,
    shortUrl: detailApp?.shortUrl ?? null,
    trackViewUrl: lookupResult?.trackViewUrl ?? null,
    iconUrl: lookupResult?.artworkUrl512 ?? lookupResult?.artworkUrl100 ?? null,
    developer: detailApp?.artistName ?? lookupResult?.sellerName ?? null,
    seller: softwareInfo.seller ?? lookupResult?.sellerName ?? null,
    developerId: detailApp?.artistId ?? lookupResult?.artistId ?? null,
    developerUrl: detailApp?.artistUrl ?? lookupResult?.artistViewUrl ?? null,
    supportUrl: softwareInfo.supportUrl ?? null,
    websiteUrl: softwareInfo.websiteUrl ?? null,
    eulaUrl: softwareInfo.eulaUrl ?? null,
    privacyPolicyUrl: softwareInfo.privacyPolicyUrl ?? null,
    privacyPolicyTextUrl: softwareInfo.privacyPolicyTextUrl ?? null,
    primaryGenre: lookupResult?.primaryGenreName ?? detailApp?.genreNames?.[0] ?? null,
    genres: Array.isArray(lookupResult?.genres)
      ? lookupResult.genres
      : Array.isArray(detailApp?.genreNames)
        ? detailApp.genreNames
        : [],
    contentRating:
      detailApp?.contentRatingsBySystem?.appsApple?.name ??
      lookupResult?.contentAdvisoryRating ??
      null,
    rating: lookupResult?.averageUserRating ?? detailApp?.userRating?.value ?? null,
    ratingCount: lookupResult?.userRatingCount ?? detailApp?.userRating?.ratingCount ?? null,
    price: lookupResult?.price ?? firstOffer?.price ?? null,
    formattedPrice: lookupResult?.formattedPrice ?? firstOffer?.priceFormatted ?? null,
    currency: lookupResult?.currency ?? null,
    hasInAppPurchases: detailApp?.hasInAppPurchases === true || addOns.length > 0,
    iapItems: addOns.map((item: any) => ({ name: item?.name ?? null, price: item?.price ?? null })),
    languages,
    fileSizeBytes:
      Number(lookupResult?.fileSizeBytes) ||
      firstOffer?.assets?.[0]?.size ||
      null,
    contentAdvisoryRating: lookupResult?.contentAdvisoryRating ?? null,
    advisories: lookupResult?.advisories ?? [],
    minimumOsVersion: lookupResult?.minimumOsVersion ?? detailApp?.minimumOSVersion ?? null,
    requirementsString:
      softwareInfo.requirementsString ??
      (lookupResult?.minimumOsVersion
        ? `Requires iOS ${lookupResult.minimumOsVersion} or later.`
        : null),
    releaseDate: lookupResult?.releaseDate ?? detailApp?.releaseDate ?? null,
    currentVersion: lookupResult?.version ?? firstOffer?.version?.display ?? null,
    currentVersionReleaseDate: lookupResult?.currentVersionReleaseDate ?? null,
    releaseNotes: lookupResult?.releaseNotes ?? versionEntries[0]?.releaseNotes ?? null,
    versionHistory: versionEntries.map((entry: any) => ({
      version: entry?.versionString ?? null,
      releasedAt: entry?.releaseDate ?? null,
      notes: entry?.releaseNotes ?? "",
    })),
    screenshotsByType,
    iphoneScreenshots,
    ipadScreenshots,
    otherScreenshots,
    lookupScreenshotUrls,
    previewVideosByType,
    previewVideos,
    deviceFamilies: detailApp?.deviceFamilies ?? [],
    requiredCapabilities: detailApp?.requiredCapabilities ?? null,
    supportedDevices: lookupResult?.supportedDevices ?? [],
    isGameCenterEnabled: lookupResult?.isGameCenterEnabled ?? null,
    copyright: detailApp?.copyright ?? null,
  };
}

function cacheFileName(row: InputRow, index: number, usedNames: Set<string>): string {
  const base =
    row.pkgName
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100) || "app";
  let name = `${base}.json`;

  if (usedNames.has(name)) {
    name = `${base}-${index + 1}.json`;
  }

  usedNames.add(name);
  return name;
}

function candidatesFromSearch(body: any): NameCandidate[] {
  const results = Array.isArray(body?.results) ? body.results : [];

  return results.map((result: any) => ({
    name: result?.trackName ?? null,
    bundleId: result?.bundleId ?? null,
    sellerName: result?.sellerName ?? null,
    trackId: typeof result?.trackId === "number" ? result.trackId : null,
    url: result?.trackViewUrl ?? null,
    minimumOsVersion: result?.minimumOsVersion ?? null,
  }));
}

function hasProductDetail(body: any): boolean {
  const results = body?.storePlatformData?.["product-dv"]?.results;

  return Boolean(results && typeof results === "object" && Object.keys(results).length > 0);
}

async function main(): Promise<void> {
  const inputPath = argValue("--input");

  if (!inputPath) {
    console.error("Usage: tsx scripts/fetch-app-store-details.ts --input <csv> [--out <dir>] [--delay 300] [--refresh]");
    process.exit(1);
  }

  const outDir = resolve(
    argValue("--out") ??
      join(homedir(), "Downloads", `app-store-details-${new Date().toISOString().slice(0, 10)}`),
  );
  const rawDir = join(outDir, "raw");
  const delayMs = Number(argValue("--delay") ?? DEFAULT_DELAY_MS);
  const refresh = process.argv.includes("--refresh");
  const rows = readInputRows(inputPath);

  mkdirSync(rawDir, { recursive: true });

  const usedCacheNames = new Set<string>();
  const records: Array<Record<string, any>> = [];
  const statusCounts: Record<MatchStatus, number> = {
    matched: 0,
    needs_review: 0,
    not_found_us: 0,
    fetch_failed: 0,
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const cachePath = join(rawDir, cacheFileName(row, index, usedCacheNames));
    let cache: RawCache | null = null;

    if (!refresh && existsSync(cachePath)) {
      try {
        cache = JSON.parse(readFileSync(cachePath, "utf8")) as RawCache;
      } catch {
        cache = null;
      }
    }

    const lookupUrl = `https://itunes.apple.com/lookup?${new URLSearchParams({
      bundleId: row.pkgName,
      country: "us",
      entity: "software",
    }).toString()}`;
    const searchUrl = `https://itunes.apple.com/search?${new URLSearchParams({
      term: row.searchName,
      country: "us",
      entity: "software",
      limit: "10",
    }).toString()}`;

    let lookupBody = cache?.lookup ?? null;
    let lookupError: string | null = null;

    if (!lookupBody) {
      try {
        lookupBody = await requestJson(lookupUrl, { "User-Agent": USER_AGENT }, delayMs);
      } catch (error) {
        lookupError = error instanceof Error ? error.message : String(error);
      }
    }

    const lookupResults = Array.isArray(lookupBody?.results) ? lookupBody.results : [];
    const lookupResult = lookupResults[0] ?? null;
    const lookupFound = Boolean(lookupResult);
    let nameSearchBody = cache?.nameSearch ?? null;

    if (!lookupFound && !nameSearchBody && !lookupError) {
      try {
        nameSearchBody = await requestJson(searchUrl, { "User-Agent": USER_AGENT }, delayMs);
      } catch {
        nameSearchBody = null;
      }
    }

    let storeName: string | null = lookupResult?.trackName ?? null;
    let nameMatches = lookupFound ? namesMatch(row.searchName, storeName) : false;
    let status: MatchStatus = lookupError
      ? "fetch_failed"
      : !lookupFound
        ? "not_found_us"
        : nameMatches
          ? "matched"
          : "needs_review";

    if (status === "needs_review" && !nameSearchBody) {
      try {
        nameSearchBody = await requestJson(searchUrl, { "User-Agent": USER_AGENT }, delayMs);
      } catch {
        nameSearchBody = null;
      }
    }

    let detailBody = hasProductDetail(cache?.detail) ? cache?.detail : null;
    let detailUrl: string | null = cache?.detailUrl ?? null;
    let detailError: string | null = null;

    if (lookupFound && !detailBody) {
      const targetUrl: string =
        lookupResult.trackViewUrl ?? `https://apps.apple.com/us/app/id${lookupResult.trackId}`;
      detailUrl = targetUrl;

      try {
        detailBody = await requestJson(
          targetUrl,
          {
            "User-Agent": USER_AGENT,
            "X-Apple-Store-Front": US_STOREFRONT,
            "Accept-Language": "en-US,en;q=0.9",
          },
          delayMs,
        );
      } catch (error) {
        detailError = error instanceof Error ? error.message : String(error);
      }
    }

    if (detailBody) {
      const results = detailBody?.storePlatformData?.["product-dv"]?.results;
      const detailApp =
        results && typeof results === "object" ? Object.values(results)[0] as any : null;

      if (detailApp?.name) {
        storeName = detailApp.name;
        nameMatches = namesMatch(row.searchName, storeName);
      }
    }

    if (lookupFound && !lookupError) {
      status = nameMatches ? "matched" : "needs_review";
    }

    const app = lookupFound ? extractAppDetails(lookupResult, detailBody) : null;
    const candidates =
      !lookupFound || status === "needs_review" ? candidatesFromSearch(nameSearchBody) : [];

    const record = {
      source: row,
      match: {
        status,
        method: lookupFound ? "bundleId" : "none",
        expectedName: row.searchName,
        storeName,
        nameMatches,
        candidates,
      },
      app,
      error: lookupError ?? detailError ?? null,
      fetchedAt: new Date().toISOString(),
    };

    records.push(record);
    statusCounts[status] += 1;

    cache = {
      fetchedAt: record.fetchedAt,
      source: row,
      lookupUrl,
      lookup: lookupBody,
      nameSearchUrl: nameSearchBody ? searchUrl : null,
      nameSearch: nameSearchBody,
      detailUrl,
      detail: detailBody,
      error: record.error,
    };
    writeFileSync(cachePath, JSON.stringify(cache, null, 1), "utf8");

    console.log(
      `[${index + 1}/${rows.length}] ${row.team} ${row.packageName} -> ${status}` +
        (storeName ? ` (${storeName})` : ""),
    );
  }

  const generatedAt = new Date().toISOString();
  const jsonOutput = {
    generatedAt,
    input: inputPath,
    total: records.length,
    statusCounts,
    apps: records,
  };

  const csvHeaders = [
    "App团队",
    "首投日期",
    "包名",
    "搜索名",
    "pkg_name",
    "上架日期",
    "匹配状态",
    "匹配方式",
    "名称是否一致",
    "商店名称",
    "候选App",
    "App Store链接",
    "trackId",
    "bundleId",
    "副标题",
    "开发者",
    "卖方",
    "开发者主页",
    "支持URL",
    "官网URL",
    "隐私政策URL",
    "隐私政策文本URL",
    "主分类",
    "全部分类",
    "内容分级",
    "评分",
    "评分数",
    "价格",
    "是否有内购",
    "内购列表",
    "语言",
    "大小(Bytes)",
    "最低iOS版本",
    "兼容性要求",
    "当前版本",
    "当前版本日期",
    "首次上架日期",
    "更新说明",
    "版本历史数",
    "iPhone截图",
    "iPad截图",
    "其他截图",
    "预览视频",
    "图标URL",
    "介绍",
    "抓取时间",
  ];

  const csvRows = records.map((record) => {
    const app = record.app;
    const match = record.match;

    return [
      record.source.team,
      record.source.firstLaunchDate,
      record.source.packageName,
      record.source.searchName,
      record.source.pkgName,
      record.source.listingDate,
      match.status,
      match.method,
      lookupFoundFor(record) ? (match.nameMatches ? "是" : "否") : "",
      match.storeName ?? "",
      match.candidates
        .map((candidate: NameCandidate) =>
          [candidate.name, candidate.bundleId, candidate.sellerName].filter(Boolean).join(" / "),
        )
        .join(" | "),
      app?.url ?? "",
      app?.trackId ?? "",
      app?.bundleId ?? "",
      app?.subtitle ?? "",
      app?.developer ?? "",
      app?.seller ?? "",
      app?.developerUrl ?? "",
      app?.supportUrl ?? "",
      app?.websiteUrl ?? "",
      app?.privacyPolicyUrl ?? "",
      app?.privacyPolicyTextUrl ?? "",
      app?.primaryGenre ?? "",
      (app?.genres ?? []).join(", "),
      app?.contentRating ?? "",
      app?.rating ?? "",
      app?.ratingCount ?? "",
      app?.formattedPrice ?? "",
      app ? (app.hasInAppPurchases ? "是" : "否") : "",
      (app?.iapItems ?? [])
        .map((item: any) => [item.name, item.price].filter(Boolean).join(" / "))
        .join("; "),
      (app?.languages ?? []).join(", "),
      app?.fileSizeBytes ?? "",
      app?.minimumOsVersion ?? "",
      app?.requirementsString ?? "",
      app?.currentVersion ?? "",
      app?.currentVersionReleaseDate ?? "",
      app?.releaseDate ?? "",
      app?.releaseNotes ?? "",
      app?.versionHistory?.length ?? "",
      (app?.iphoneScreenshots ?? []).join("; "),
      (app?.ipadScreenshots ?? []).join("; "),
      (app?.otherScreenshots ?? []).join("; "),
      (app?.previewVideos ?? []).join("; "),
      app?.iconUrl ?? "",
      app?.description ?? "",
      record.fetchedAt,
    ];
  });

  const csv = "﻿" +
    [csvHeaders, ...csvRows]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n";

  writeFileSync(join(outDir, "apps.json"), JSON.stringify(jsonOutput, null, 2), "utf8");
  writeFileSync(join(outDir, "apps.csv"), csv, "utf8");

  console.log("");
  console.log(`Wrote ${join(outDir, "apps.csv")}`);
  console.log(`Wrote ${join(outDir, "apps.json")}`);
  console.log(`Raw responses: ${rawDir}`);
  console.log(
    `Status: matched=${statusCounts.matched}, needs_review=${statusCounts.needs_review}, ` +
      `not_found_us=${statusCounts.not_found_us}, fetch_failed=${statusCounts.fetch_failed}`,
  );
}

function lookupFoundFor(record: Record<string, any>): boolean {
  return record.match?.method === "bundleId";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
