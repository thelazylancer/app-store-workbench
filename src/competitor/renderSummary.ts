import { competitorAssetUrl } from "../lib/competitorApi";
import type {
  DateKind,
  GroupBy,
  PackageBrief,
  PackageDetail,
  SummaryCompetitor,
  SummaryGroup,
} from "../../shared/competitorTypes";
import {
  GROUP_BY_LABEL,
  formatGroupName,
  type StatusFilter,
} from "./format";

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

function svgIcon(paths: string, viewBox = "0 0 16 16"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

function createChevron(): SVGSVGElement {
  return svgIcon('<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>');
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
  const name = document.createElement("strong");
  name.textContent = competitor.name;
  nameCell.append(name);
  if (competitor.packageCount > 1) {
    const pill = document.createElement("span");
    pill.className = "wx-count-pill";
    pill.dataset.role = "package-count";
    pill.textContent = `${competitor.packageCount} 个包`;
    nameCell.append(pill);
  }
  row.append(nameCell);

  appendText(
    row,
    "span",
    "wx-row-code",
    competitor.packageCount > 1
      ? `${firstPackage?.packageCode ?? ""} 等 ${competitor.packageCount} 个`
      : firstPackage?.packageCode ?? "",
  );
  appendText(row, "span", "wx-row-meta", metaLine(
    firstPackage ?? { packageCode: "", displayName: competitor.name, team: "", appVersion: null, iconLocalPath: null },
    facts,
    groupBy,
    dateKind,
    rangeDays,
  ));

  const side = document.createElement("span");
  side.className = "wx-row-side";
  appendText(side, "span", "wx-badge wx-badge-hit", "命中");
  row.append(side);
  return row;
}

function createExceptionRow(
  entry: ExceptionEntry,
  groupBy: GroupBy,
  href: string,
): HTMLAnchorElement {
  const row = document.createElement("a");
  row.className = "wx-exception-row";
  row.dataset.role = "exception-row";
  row.dataset.reason = entry.reason;
  row.dataset.package = entry.packageCode;
  row.dataset.competitor = packageCompetitorKey(entry.packageCode);
  row.href = href;
  row.setAttribute(
    "aria-label",
    `查看 ${entry.displayName}，${entry.reason === "miss" ? "未命中 App Store" : "详情待补全"}`,
  );

  row.append(createRowIcon(entry.displayName, entry.iconLocalPath, entry.reason === "miss"));
  appendText(row, "span", "wx-row-name", entry.displayName);
  appendText(row, "span", "wx-row-code", entry.packageCode);
  appendText(
    row,
    "span",
    "wx-exception-reason",
    entry.reason === "miss" ? "未命中 App Store" : "详情待补全",
  );
  appendText(row, "span", "wx-row-group", formatGroupName(entry.groupKey, groupBy));
  return row;
}

function createGroup(
  group: SummaryGroup,
  packages: Map<string, PackageDetail>,
  groupBy: GroupBy,
  dateKind: DateKind,
  rangeDays: number,
  collapsed: boolean,
  buildDetailHref: (key: string, packageCode: string) => string,
): HTMLElement {
  const competitors = [...group.competitors].sort((a, b) => a.name.localeCompare(b.name));
  const exceptionCount = group.missCount + group.pendingCount;

  const section = document.createElement("section");
  section.className = "wx-group";
  section.dataset.group = group.groupKey;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "wx-group-head";
  head.dataset.role = "group-toggle";
  head.dataset.group = group.groupKey;
  head.setAttribute("aria-expanded", String(!collapsed));

  const chevron = document.createElement("span");
  chevron.className = `wx-chevron${collapsed ? " is-collapsed" : ""}`;
  chevron.append(createChevron());
  head.append(chevron);

  appendText(head, "span", "wx-group-name", formatGroupName(group.groupKey, groupBy));

  const counts = document.createElement("span");
  counts.className = "wx-group-counts";
  counts.dataset.role = "group-counts";
  const count = (value: number, label: string, className?: string) => {
    const part = document.createElement("span");
    if (className) part.className = className;
    const strong = document.createElement("b");
    strong.textContent = String(value);
    part.append(strong, ` ${label}`);
    return part;
  };
  counts.append(
    count(group.packageCount, "包"),
    count(group.hitCount, "命中", "is-hit"),
    count(exceptionCount, "异常", exceptionCount > 0 ? "is-exception" : undefined),
  );
  head.append(counts);

  appendText(head, "span", "wx-group-comps", `${group.competitorCount} 个竞品`);
  section.append(head);

  const body = document.createElement("div");
  body.className = "wx-rows";
  body.hidden = collapsed;

  for (const competitor of competitors) {
    const firstPackage = competitor.packages[0]?.packageCode ?? "";
    const facts = competitor.packages
      .map((brief) => packages.get(brief.packageCode))
      .find((detail) => Boolean(detail));
    body.append(createHitRow(
      competitor,
      facts,
      groupBy,
      dateKind,
      rangeDays,
      buildDetailHref(competitorKey(competitor), firstPackage),
    ));
  }

  if (competitors.length === 0) {
    appendText(body, "p", "wx-group-empty", "该分组没有命中竞品。");
  }
  section.append(body);
  return section;
}

export type SummaryRenderOptions = {
  groups: SummaryGroup[];
  packages: Map<string, PackageDetail>;
  dateKind: DateKind;
  groupBy: GroupBy;
  status: StatusFilter;
  rangeDays: number;
  collapsedGroups: Set<string>;
  exceptions: ExceptionEntry[];
  buildDetailHref: (key: string, packageCode: string) => string;
};

export function renderSummary(host: HTMLElement, options: SummaryRenderOptions): void {
  host.replaceChildren();
  const {
    groups,
    packages,
    dateKind,
    groupBy,
    status,
    rangeDays,
    collapsedGroups,
    exceptions,
    buildDetailHref,
  } = options;

  if (status !== "exception") {
    const ordered = [...groups].sort(
      (a, b) => b.packageCount - a.packageCount || a.groupKey.localeCompare(b.groupKey),
    );

    const listHead = document.createElement("div");
    listHead.className = "wx-list-head";
    appendText(listHead, "span", "wx-list-caption", `${GROUP_BY_LABEL[groupBy]} · 按包数排序`);

    const actions = document.createElement("span");
    actions.className = "wx-list-actions";
    const controls: Array<[string, string]> = [["expand-all", "全部展开"], ["collapse-all", "全部收起"]];
    for (const [role, label] of controls) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wx-text-action";
      button.dataset.role = role;
      button.textContent = label;
      actions.append(button);
    }
    listHead.append(actions);
    host.append(listHead);

    for (const group of ordered) {
      host.append(createGroup(
        group,
        packages,
        groupBy,
        dateKind,
        rangeDays,
        collapsedGroups.has(group.groupKey),
        buildDetailHref,
      ));
    }
  }

  if (status !== "hit" && exceptions.length > 0) {
    const section = document.createElement("section");
    section.className = "wx-exceptions";
    section.dataset.role = "exceptions";

    const head = document.createElement("div");
    head.className = "wx-exceptions-head";
    appendText(head, "h2", "wx-exceptions-title", "异常");
    appendText(
      head,
      "span",
      "wx-exceptions-count",
      `${exceptions.length} 个包 · 未命中 ${exceptions.filter((entry) => entry.reason === "miss").length} · 待补全 ${exceptions.filter((entry) => entry.reason === "pending").length}`,
    );
    section.append(head);

    for (const entry of exceptions) {
      section.append(createExceptionRow(
        entry,
        groupBy,
        buildDetailHref(packageCompetitorKey(entry.packageCode), entry.packageCode),
      ));
    }
    host.append(section);
  }
}
