import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { cacheFileName, csvCell, readInputRows } from "./lib/appStoreFetch/csv";
import { extractAppDetails } from "./lib/appStoreFetch/extract";
import { USER_AGENT, requestJson } from "./lib/appStoreFetch/itunes";
import { candidatesFromSearch, hasProductDetail, lookupFoundFor, namesMatch } from "./lib/appStoreFetch/nameMatch";
import type { MatchStatus, NameCandidate, RawCache } from "./lib/appStoreFetch/types";

const US_STOREFRONT = "143441-1,29";
const DEFAULT_DELAY_MS = 300;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
