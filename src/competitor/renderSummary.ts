import { competitorAssetUrl } from "../lib/competitorApi";
import type {
  DateKind,
  GroupBy,
  PackageBrief,
  PackageDetail,
  SummaryCompetitor,
  SummaryGroup,
} from "../../shared/competitorTypes";
import type { StatusFilter } from "./format";

export type ExceptionReason = "miss" | "pending";

export type ExceptionEntry = PackageBrief & {
  reason: ExceptionReason;
  groupKey: string;
};

export function competitorKey(competitor: SummaryCompetitor): string {
  return competitor.appleId !== null ? `apple:${competitor.appleId}` : `pkg:${competitor.packages[0]?.packageCode ?? ""}`;
}

export function packageCompetitorKey(packageCode: string): string {
  return `pkg:${packageCode}`;
}

function createRowIcon(
  displayName: string,
  localPath: string | null | undefined,
  missed = false,
): HTMLElement {
  if (missed) {
    const placeholder = document.createElement("span");
    placeholder.className = "wx-row-icon wx-row-icon-empty";
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }
  const src = competitorAssetUrl(localPath);
  if (!src) return createFallbackIcon(displayName);

  const image = document.createElement("img");
  image.className = "wx-row-icon";
  image.src = src;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => image.replaceWith(createFallbackIcon(displayName)));
  return image;
}

function createFallbackIcon(displayName: string): HTMLElement {
  const fallback = document.createElement("span");
  fallback.className = "wx-row-icon wx-row-icon-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = displayName.slice(0, 1).toUpperCase() || "?";
  return fallback;
}

function appendText(host: HTMLElement, tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  host.append(element);
  return element;
}

function metaLine(
  brief: PackageBrief,
  facts: PackageDetail | undefined,
  groupBy: GroupBy,
  dateKind: DateKind,
  rangeDays: number,
): string {
  const bits: string[] = [];
  if (groupBy !== "team") bits.push(facts?.team ?? brief.team);
  if (facts?.category) bits.push(facts.category);
  if (facts?.minimumOsVersion) bits.push(`iOS ${facts.minimumOsVersion}`);
  if (facts?.appVersion ?? brief.appVersion) bits.push(`v${facts?.appVersion ?? brief.appVersion}`);
  if (rangeDays === 1) bits.push(facts?.screenshotLocalPaths.length ? `${facts.screenshotLocalPaths.length} 张截图` : "");
  if (dateKind === "listing" && facts?.listingDate) bits.push(`上架 ${facts.listingDate.slice(5)}`);
  return bits.filter(Boolean).join(" · ");
}

function createHitRow(
  competitor: SummaryCompetitor,
  facts: PackageDetail | undefined,
  groupBy: GroupBy,
  dateKind: DateKind,
  rangeDays: number,
  href: string,
): HTMLAnchorElement {
  const brief = competitor.packages[0] ?? {
    packageCode: "",
    displayName: competitor.name,
    team: "",
    appVersion: null,
    iconLocalPath: null,
    hasIap: false,
    versionCount: 0,
    earliestReleasedAt: null,
    latestReleasedAt: null,
  };
  const firstPackage = competitor.packages[0];
  const row = document.createElement("a");
  row.className = "wx-row";
  row.dataset.role = "competitor-row";
  row.dataset.competitor = competitorKey(competitor);
  row.dataset.package = firstPackage?.packageCode ?? "";
  row.href = href;
  row.setAttribute(
    "aria-label",
    `查看 ${competitor.name} 的竞品详情，${competitor.packageCount} 个包`,
  );

  row.append(createRowIcon(competitor.name, facts?.iconLocalPath ?? firstPackage?.iconLocalPath));

  const nameCell = document.createElement("span");
  nameCell.className = "wx-row-name";
  const nameLine = document.createElement("span");
  nameLine.className = "wx-row-title";
  const name = document.createElement("strong");
  name.textContent = competitor.name;
  nameLine.append(name);
  if (competitor.packageCount > 1) {
    const pill = document.createElement("span");
    pill.className = "wx-count-pill";
    pill.dataset.role = "package-count";
    pill.textContent = `${competitor.packageCount} 个包`;
    nameLine.append(pill);
  }
  nameCell.append(nameLine);
  if (competitor.appleId !== null) appendText(nameCell, "span", "wx-row-pkg", String(competitor.appleId));
  row.append(nameCell);

  const codeCell = document.createElement("span");
  codeCell.className = "wx-row-code";
  appendText(
    codeCell,
    "span",
    "wx-row-code-line",
    competitor.packageCount > 1
      ? `${firstPackage?.packageCode ?? ""} 等 ${competitor.packageCount} 个`
      : firstPackage?.packageCode ?? "",
  );
  const { earliestReleasedAt, latestReleasedAt } = brief;
  if (earliestReleasedAt || latestReleasedAt) {
    const dates = [earliestReleasedAt && `最早 ${earliestReleasedAt}`, latestReleasedAt && `最新 ${latestReleasedAt}`];
    appendText(codeCell, "span", "wx-row-dates", dates.filter(Boolean).join(" · "));
  }
  row.append(codeCell);
  appendText(row, "span", "wx-row-meta", metaLine(
    brief,
    facts,
    groupBy,
    dateKind,
    rangeDays,
  ));

  const side = document.createElement("span");
  side.className = "wx-row-side";
  if (brief.hasIap) appendText(side, "span", "wx-iap-pill", "内购");
  appendText(side, "span", "wx-row-versions", `${brief.versionCount}个版本`);
  row.append(side);
  return row;
}

function createExceptionRow(
  entry: ExceptionEntry,
  href: string,
): HTMLAnchorElement {
  const row = document.createElement("a");
  row.className = "wx-row wx-exception-row";
  row.dataset.role = "exception-row";
  row.dataset.reason = entry.reason;
  row.dataset.package = entry.packageCode;
  row.dataset.competitor = packageCompetitorKey(entry.packageCode);
  row.href = href;
  row.setAttribute(
    "aria-label",
    `查看 ${entry.displayName}，${entry.reason === "miss" ? "未命中 App Store" : "详情待补全"}`,
  );

  row.append(createRowIcon(entry.displayName, entry.iconLocalPath, true));
  appendText(row, "span", "wx-row-name", entry.displayName);
  appendText(row, "span", "wx-row-code", entry.packageCode);
  appendText(row, "span", "wx-row-meta", entry.appVersion ? `v${entry.appVersion}` : "—");

  const side = document.createElement("span");
  side.className = "wx-row-side";
  if (entry.reason === "pending") {
    const strip = document.createElement("span");
    strip.className = "wx-strip";
    strip.setAttribute("aria-hidden", "true");
    side.append(strip);
  }
  appendText(
    side,
    "span",
    entry.reason === "miss" ? "wx-badge wx-badge-miss" : "wx-badge wx-badge-pend",
    entry.reason === "miss" ? "App Store 未命中" : "待补全",
  );
  row.append(side);
  return row;
}

export function createTeamBlock(
  group: SummaryGroup,
  packages: Map<string, PackageDetail>,
  status: StatusFilter,
  rangeDays: number,
  buildDetailHref: (key: string, packageCode: string) => string,
): HTMLElement | null {
  const hits = status === "exception"
    ? []
    : [...group.competitors].sort((a, b) => a.name.localeCompare(b.name, "zh"));
  const exceptions: ExceptionEntry[] = status === "hit" ? [] : [
    ...group.missedPackages.map((brief) => ({ ...brief, reason: "miss" as const, groupKey: group.groupKey })),
    ...group.pendingPackages.map((brief) => ({ ...brief, reason: "pending" as const, groupKey: group.groupKey })),
  ].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
  const shown = hits.reduce((sum, competitor) => sum + competitor.packageCount, 0) + exceptions.length;
  if (shown === 0) return null;

  const section = document.createElement("section");
  section.className = "wx-team-block";
  section.dataset.team = group.groupKey;
  section.dataset.packages = String(shown);

  const line = document.createElement("div");
  line.className = "wx-team-line";
  appendText(line, "span", "wx-team-name", group.groupKey);
  appendText(line, "span", "wx-team-n", `${shown} 包`);
  section.append(line);

  const body = document.createElement("div");
  body.className = "wx-rows";
  for (const competitor of hits) {
    const firstPackage = competitor.packages[0]?.packageCode ?? "";
    const facts = competitor.packages
      .map((brief) => packages.get(brief.packageCode))
      .find((detail) => detail !== undefined);
    body.append(createHitRow(
      competitor,
      facts,
      "team",
      "first_ad",
      rangeDays,
      buildDetailHref(competitorKey(competitor), firstPackage),
    ));
  }
  for (const entry of exceptions) {
    body.append(createExceptionRow(
      entry,
      buildDetailHref(packageCompetitorKey(entry.packageCode), entry.packageCode),
    ));
  }
  section.append(body);
  return section;
}
