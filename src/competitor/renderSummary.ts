import { competitorAssetUrl } from "../lib/competitorApi";
import type {
  DateKind,
  GroupBy,
  PackageBrief,
  PackageDetail,
  SummaryCompetitor,
  SummaryGroup,
  TimelinePoint,
} from "../../shared/competitorTypes";
import {
  DATE_KIND_SHORT,
  GROUP_BY_LABEL,
  formatGroupName,
  formatShortDate,
  type StatusFilter,
} from "./format";

export function competitorKey(competitor: SummaryCompetitor): string {
  return competitor.appleId !== null ? `apple:${competitor.appleId}` : `pkg:${competitor.packages[0]?.packageCode ?? ""}`;
}

export function packageCompetitorKey(packageCode: string): string {
  return `pkg:${packageCode}`;
}

function createBadge(kind: "hit" | "miss"): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `status-badge ${kind === "hit" ? "status-hit" : "status-bundle_not_found"}`;
  badge.textContent = kind === "hit" ? "命中" : "App Store 未命中";
  return badge;
}

function createRowIcon(displayName: string, localPath: string | null | undefined): HTMLElement {
  const src = competitorAssetUrl(localPath);
  if (!src) return createFallbackIcon(displayName);

  const image = document.createElement("img");
  image.className = "competitor-row-icon";
  image.src = src;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => image.replaceWith(createFallbackIcon(displayName)));
  return image;
}

function createFallbackIcon(displayName: string): HTMLElement {
  const fallback = document.createElement("span");
  fallback.className = "competitor-row-icon competitor-row-icon-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = displayName.slice(0, 1).toUpperCase() || "?";
  const dot = document.createElement("span");
  dot.className = "competitor-row-icon-dot";
  fallback.append(dot);
  return fallback;
}

function createMissedIcon(): HTMLElement {
  const placeholder = document.createElement("span");
  placeholder.className = "competitor-row-icon competitor-row-icon-missed";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = "?";
  return placeholder;
}

function createMainCopy(
  name: string,
  packageCode: string,
  packageCount: number,
  facts: PackageDetail | undefined,
  groupBy: GroupBy,
): HTMLElement {
  const copy = document.createElement("span");
  copy.className = "competitor-row-copy";

  const title = document.createElement("span");
  title.className = "competitor-row-title";
  const label = document.createElement("strong");
  label.textContent = name;
  title.append(label);
  if (packageCount > 1) {
    const pill = document.createElement("span");
    pill.className = "package-count-pill";
    pill.dataset.role = "package-count";
    pill.textContent = `${packageCount} 个包`;
    title.append(pill);
  }
  copy.append(title);

  const bundle = document.createElement("span");
  bundle.className = "competitor-row-bundle";
  bundle.textContent = packageCount > 1 ? `${packageCode} 等 ${packageCount} 个包` : packageCode;
  copy.append(bundle);

  const bits: string[] = [];
  if (groupBy !== "team") bits.push(facts?.team ?? "");
  bits.push(facts?.category ?? "未分类");
  bits.push(facts?.minimumOsVersion ? `iOS ${facts.minimumOsVersion}` : "未知 iOS 版本");
  if (facts) bits.push(`${facts.screenshotLocalPaths.length} 张截图`);
  const meta = document.createElement("span");
  meta.className = "competitor-row-meta";
  meta.textContent = bits.filter(Boolean).join(" · ");
  copy.append(meta);

  return copy;
}

function createSide(badge: HTMLSpanElement, date: string, dateKind: DateKind): HTMLElement {
  const side = document.createElement("span");
  side.className = "competitor-row-side";
  side.append(badge);
  const dateLabel = document.createElement("span");
  dateLabel.className = "competitor-row-date";
  dateLabel.textContent = `${DATE_KIND_SHORT[dateKind]} ${formatShortDate(date)}`;
  side.append(dateLabel);
  const arrow = document.createElement("span");
  arrow.className = "competitor-row-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "›";
  side.append(arrow);
  return side;
}

function createCompetitorRow(
  competitor: SummaryCompetitor,
  facts: PackageDetail | undefined,
  date: string,
  dateKind: DateKind,
  groupBy: GroupBy,
  href: string,
): HTMLAnchorElement {
  const key = competitorKey(competitor);
  const firstPackage = competitor.packages[0];
  const row = document.createElement("a");
  row.className = "competitor-row";
  row.dataset.role = "competitor-row";
  row.dataset.competitor = key;
  row.dataset.package = firstPackage?.packageCode ?? "";
  row.href = href;
  row.setAttribute("aria-label", `查看 ${competitor.name} 的竞品详情，${competitor.packageCount} 个包`);

  row.append(createRowIcon(competitor.name, facts?.iconLocalPath ?? firstPackage?.iconLocalPath));
  row.append(createMainCopy(
    competitor.name,
    firstPackage?.packageCode ?? "",
    competitor.packageCount,
    facts,
    groupBy,
  ));
  row.append(createSide(createBadge("hit"), date, dateKind));
  return row;
}

function createMissedRow(
  missed: PackageBrief,
  date: string,
  dateKind: DateKind,
  href: string,
): HTMLAnchorElement {
  const row = document.createElement("a");
  row.className = "competitor-row competitor-row-missed";
  row.dataset.role = "missed-row";
  row.dataset.competitor = packageCompetitorKey(missed.packageCode);
  row.dataset.package = missed.packageCode;
  row.href = href;
  row.setAttribute("aria-label", `查看 ${missed.displayName}，App Store 未命中`);

  row.append(createMissedIcon());

  const copy = document.createElement("span");
  copy.className = "competitor-row-copy";
  const title = document.createElement("span");
  title.className = "competitor-row-title";
  const name = document.createElement("strong");
  name.textContent = missed.displayName;
  title.append(name);
  copy.append(title);

  const bundle = document.createElement("span");
  bundle.className = "competitor-row-bundle";
  bundle.textContent = missed.packageCode;
  copy.append(bundle);

  const meta = document.createElement("span");
  meta.className = "competitor-row-meta";
  meta.textContent = "源名 · 8 区域无匹配";
  copy.append(meta);
  row.append(copy);

  row.append(createSide(createBadge("miss"), date, dateKind));
  return row;
}

function groupCounts(group: SummaryGroup, status: StatusFilter) {
  const packageCount = status === "hit"
    ? group.hitCount
    : status === "miss"
      ? group.missCount
      : group.packageCount;
  const hitCount = status === "miss" ? 0 : group.hitCount;
  const missCount = status === "hit" ? 0 : group.missCount;
  const visibleCompetitors = status === "miss" ? 0 : group.competitors.length;
  const visibleMissed = status === "hit" ? 0 : group.missedPackages.length;
  // UX counts each unmatched package as its own competitor line.
  const competitorCount = visibleCompetitors + visibleMissed;
  return { packageCount, hitCount, missCount, competitorCount };
}

function createTimeline(points: TimelinePoint[], selectedDate: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "group-timeline";
  const label = document.createElement("span");
  label.className = "timeline-label";
  label.textContent = "近 7 天";
  const cells = document.createElement("span");
  cells.className = "timeline-cells";

  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(1, ...ordered.map((point) => point.packageCount));

  for (const point of ordered) {
    // Listing-date timelines can have packages on days without a batch row.
    const hasData = point.batchStatus !== null || point.packageCount > 0;
    const current = point.date === selectedDate;
    const description = `${formatShortDate(point.date)} · ${hasData ? `${point.packageCount} 包` : "无快照"}${current ? " · 当前日期" : ""}`;
    let cell: HTMLElement;
    if (hasData) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.role = "timeline-date";
      button.dataset.date = point.date;
      button.setAttribute("aria-label", `${description}，点击查看`);
      cell = button;
    } else {
      cell = document.createElement("span");
      cell.setAttribute("aria-label", description);
    }
    cell.className = `timeline-cell${hasData ? "" : " is-empty"}${current ? " is-current" : ""}`;
    cell.title = description;
    const bar = document.createElement("span");
    bar.className = "timeline-bar";
    if (hasData) {
      bar.style.height = `${4 + 20 * Math.sqrt(point.packageCount / max)}px`;
    }
    cell.append(bar);
    cells.append(cell);
  }

  wrapper.append(label, cells);
  return wrapper;
}

function createGroup(
  group: SummaryGroup,
  packages: Map<string, PackageDetail>,
  date: string,
  dateKind: DateKind,
  groupBy: GroupBy,
  status: StatusFilter,
  collapsed: boolean,
  buildDetailHref: (key: string, packageCode: string) => string,
): HTMLElement | null {
  const competitors = status === "miss" ? [] : [...group.competitors].sort((a, b) => a.name.localeCompare(b.name));
  const missed = status === "hit" ? [] : [...group.missedPackages].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
  if (status !== "all" && competitors.length === 0 && missed.length === 0) {
    return null;
  }

  const counts = groupCounts(group, status);
  const section = document.createElement("section");
  section.className = "summary-group";
  section.dataset.group = group.groupKey;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "group-head";
  head.dataset.role = "group-toggle";
  head.dataset.group = group.groupKey;
  head.setAttribute("aria-expanded", String(!collapsed));

  const chevron = document.createElement("span");
  chevron.className = "group-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾";
  head.append(chevron);

  const headCopy = document.createElement("span");
  headCopy.className = "group-head-copy";
  const name = document.createElement("span");
  name.className = "group-name";
  name.textContent = formatGroupName(group.groupKey, groupBy);
  headCopy.append(name);

  const countLine = document.createElement("span");
  countLine.className = "group-counts";
  countLine.dataset.role = "group-counts";
  const countPart = (value: number, label: string, className?: string) => {
    const part = document.createElement("span");
    if (className) part.className = className;
    part.textContent = `${value} ${label}`;
    return part;
  };
  countLine.append(
    countPart(counts.packageCount, "包"),
    " · ",
    countPart(counts.hitCount, "命中", "is-hit"),
    " · ",
    countPart(counts.missCount, "未命中", "is-miss"),
  );
  headCopy.append(countLine);

  const secondary = document.createElement("span");
  secondary.className = "group-competitors";
  secondary.textContent = `${counts.competitorCount} 个竞品`;
  headCopy.append(secondary);
  head.append(headCopy);
  if (group.timeline && group.timeline.length > 0) {
    head.append(createTimeline(group.timeline, date));
  }
  section.append(head);

  const body = document.createElement("div");
  body.className = "group-body";
  body.hidden = collapsed;

  for (const competitor of competitors) {
    const firstPackage = competitor.packages[0]?.packageCode ?? "";
    const facts = competitor.packages
      .map((brief) => packages.get(brief.packageCode))
      .find((detail) => Boolean(detail));
    body.append(createCompetitorRow(
      competitor,
      facts,
      date,
      dateKind,
      groupBy,
      buildDetailHref(competitorKey(competitor), firstPackage),
    ));
  }

  if (missed.length > 0) {
    const missedHead = document.createElement("div");
    missedHead.className = "missed-subhead";
    missedHead.textContent = `App Store 未命中 · ${missed.length} 个包`;
    body.append(missedHead);
    for (const missedPackage of missed) {
      body.append(createMissedRow(
        missedPackage,
        date,
        dateKind,
        buildDetailHref(packageCompetitorKey(missedPackage.packageCode), missedPackage.packageCode),
      ));
    }
  }

  section.append(body);
  return section;
}

export type SummaryRenderOptions = {
  groups: SummaryGroup[];
  packages: Map<string, PackageDetail>;
  date: string;
  dateKind: DateKind;
  groupBy: GroupBy;
  status: StatusFilter;
  collapsedGroups: Set<string>;
  buildDetailHref: (key: string, packageCode: string) => string;
};

export function renderSummary(host: HTMLElement, options: SummaryRenderOptions): void {
  host.replaceChildren();

  const { groups, packages, date, dateKind, groupBy, status, collapsedGroups, buildDetailHref } = options;
  const ordered = [...groups].sort(
    (a, b) => b.packageCount - a.packageCount || a.groupKey.localeCompare(b.groupKey),
  );

  const listHead = document.createElement("div");
  listHead.className = "report-list-head";
  const caption = document.createElement("span");
  caption.className = "report-list-caption";
  caption.textContent = `${GROUP_BY_LABEL[groupBy]} · 按包数排序`;
  listHead.append(caption);

  const actions = document.createElement("span");
  actions.className = "report-list-actions";
  const expand = document.createElement("button");
  expand.type = "button";
  expand.className = "text-action";
  expand.dataset.role = "expand-all";
  expand.textContent = "全部展开";
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "text-action";
  collapse.dataset.role = "collapse-all";
  collapse.textContent = "全部收起";
  actions.append(expand, collapse);
  listHead.append(actions);
  host.append(listHead);

  for (const group of ordered) {
    const element = createGroup(
      group,
      packages,
      date,
      dateKind,
      groupBy,
      status,
      collapsedGroups.has(group.groupKey),
      buildDetailHref,
    );
    if (element) host.append(element);
  }
}
