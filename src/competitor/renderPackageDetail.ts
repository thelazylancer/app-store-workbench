import { competitorAssetUrl } from "../lib/competitorApi";
import { createScreenshotLightbox } from "../lib/renderResults";
import type {
  AssetStatus,
  DateKind,
  LookupStatus,
  PackageDetail,
  SnapshotEntry,
  SummaryCompetitor,
} from "../../shared/competitorTypes";
import {
  DATE_KIND_LABEL,
  formatShortDate,
  formatDateTime,
} from "./format";

function createBadge(kind: "hit" | "miss" | "neutral" | "warn", text: string): HTMLSpanElement {
  const badge = document.createElement("span");
  const className = kind === "hit"
    ? "status-hit"
    : kind === "miss"
      ? "status-bundle_not_found"
      : kind === "warn"
        ? "status-detail-incomplete"
        : "status-neutral";
  badge.className = `status-badge ${className}`;
  badge.textContent = text;
  return badge;
}

function createInfoRow(label: string, value: string | HTMLElement): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "info-row";
  const name = document.createElement("span");
  name.className = "info-row-label";
  name.textContent = label;
  const content = document.createElement("span");
  content.className = "info-row-value";
  content.append(value);
  row.append(name, content);
  return row;
}

function createInfoList(rows: Array<[string, string | HTMLElement]>): HTMLElement {
  const list = document.createElement("div");
  list.className = "info-list";
  for (const [label, value] of rows) list.append(createInfoRow(label, value));
  return list;
}

function assetStatusLabel(status: AssetStatus): string {
  switch (status) {
    case "ok": return "完整";
    case "partial": return "图片部分缺失";
    case "failed": return "图片缺失";
    case "pending": return "待下载";
    case "skipped": return "无需下载";
    default: return "未知";
  }
}

function statusText(status: LookupStatus): { kind: "hit" | "miss" | "neutral"; text: string } {
  switch (status) {
    case "hit": return { kind: "hit", text: "App Store 已命中" };
    case "bundle_not_found": return { kind: "miss", text: "App Store 未命中" };
    default: return { kind: "neutral", text: "待补全" };
  }
}

function jsonString(json: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = json[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function createIdentity(
  name: string,
  packageDetail: PackageDetail,
  isMissed: boolean,
  appStoreUrl: string | null,
): HTMLElement {
  const surface = document.createElement("section");
  surface.className = "identity-surface";

  if (isMissed) {
    const placeholder = document.createElement("span");
    placeholder.className = "identity-icon identity-icon-missed";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "?";
    surface.append(placeholder);
  } else {
    const src = competitorAssetUrl(packageDetail.iconLocalPath);
    if (src) {
      const icon = document.createElement("img");
      icon.className = "app-icon";
      icon.src = src;
      icon.alt = `${name} 图标`;
      icon.decoding = "async";
      surface.append(icon);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "app-icon identity-icon-fallback";
      placeholder.textContent = name.slice(0, 1).toUpperCase() || "?";
      surface.append(placeholder);
    }
  }

  const copy = document.createElement("div");
  copy.className = "identity-copy";

  const titleRow = document.createElement("div");
  titleRow.className = "identity-title-row";
  const heading = document.createElement("h2");
  heading.textContent = name;
  titleRow.append(heading);
  const status = statusText(packageDetail.lookupStatus);
  titleRow.append(createBadge(status.kind, status.text));
  copy.append(titleRow);

  const identityLine = document.createElement("p");
  identityLine.className = "identity-line";
  identityLine.textContent = `${packageDetail.packageCode} · ${packageDetail.team}`;
  copy.append(identityLine);

  const facts = document.createElement("p");
  facts.className = "identity-line identity-facts";
  facts.textContent = [
    packageDetail.category ?? "未分类",
    packageDetail.minimumOsVersion ? `最低 iOS ${packageDetail.minimumOsVersion}` : "未知 iOS 版本",
    packageDetail.appVersion ? `当前版本 ${packageDetail.appVersion}` : "版本未知",
  ].join(" · ");
  copy.append(facts);

  if (!isMissed && appStoreUrl) {
    const link = document.createElement("a");
    link.className = "secondary-button identity-link";
    link.href = appStoreUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "在 App Store 查看 ↗";
    copy.append(link);
  }

  surface.append(copy);
  return surface;
}

function createPackageSwitcher(
  competitor: SummaryCompetitor,
  selected: string,
  packageStatus: Map<string, LookupStatus>,
  onSelectPackage: (code: string) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "package-switcher";
  const label = document.createElement("span");
  label.className = "package-switcher-label";
  label.textContent = `包（${competitor.packageCount}）`;
  wrapper.append(label);

  const group = document.createElement("div");
  group.className = "filter-segment package-switcher-segment";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "切换包");

  for (const brief of competitor.packages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip package-chip${brief.packageCode === selected ? " is-active" : ""}`;
    button.dataset.role = "package-switch";
    button.dataset.package = brief.packageCode;
    button.setAttribute("aria-pressed", String(brief.packageCode === selected));
    button.title = brief.packageCode;

    const dot = document.createElement("span");
    dot.className = `status-dot ${packageStatus.get(brief.packageCode) === "bundle_not_found" ? "status-dot-miss" : "status-dot-hit"}`;
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "package-chip-code";
    text.textContent = brief.packageCode;
    button.append(dot, text);
    button.addEventListener("click", () => onSelectPackage(brief.packageCode));
    group.append(button);
  }

  wrapper.append(group);
  return wrapper;
}

function createVersionHistory(versions: PackageDetail["versions"]): HTMLElement {
  const details = document.createElement("details");
  details.className = "version-history";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "版本历史（当日可见）";
  details.append(summary);

  const list = document.createElement("div");
  list.className = "version-history-list";
  if (versions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "entry-empty";
    empty.textContent = "当日快照未记录版本历史";
    list.append(empty);
  }

  versions.forEach((version, index) => {
    const item = document.createElement("article");
    item.className = `version-history-item${index === 0 ? " is-current" : ""}`;
    const header = document.createElement("div");
    header.className = "version-history-header";
    const strong = document.createElement("strong");
    strong.textContent = version.version;
    if (index === 0) {
      const current = document.createElement("span");
      current.className = "current-pill";
      current.textContent = "当前";
      strong.append(current);
    }
    const time = document.createElement("time");
    time.dateTime = version.releasedAt;
    time.textContent = formatShortDate(version.releasedAt);
    header.append(strong, time);
    item.append(header);
    if (version.notes) {
      const notes = document.createElement("p");
      notes.className = "version-history-notes";
      notes.textContent = version.notes;
      item.append(notes);
    }
    list.append(item);
  });

  details.append(list);
  return details;
}

function createScreenshotSection(name: string, paths: string[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = `截图（${paths.length}）`;
  section.append(title);

  const urls = paths.map((path) => competitorAssetUrl(path)).filter((url): url is string => Boolean(url));
  if (urls.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-placeholder";
    empty.textContent = "该包当日没有可展示的截图";
    section.append(empty);
    return section;
  }

  const grid = document.createElement("div");
  grid.className = "competitor-screenshot-grid";
  const lightbox = createScreenshotLightbox(urls, name);

  urls.forEach((url, index) => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "screenshot-trigger";
    trigger.setAttribute("aria-label", `放大查看${name} 截图 ${index + 1}`);
    trigger.addEventListener("click", () => lightbox.open(index, trigger));
    const image = document.createElement("img");
    image.className = "screenshot";
    image.src = url;
    image.alt = `${name} 商店截图 ${index + 1}`;
    image.loading = index < 3 ? "eager" : "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      trigger.classList.add("is-error");
      const label = document.createElement("span");
      label.className = "screenshot-error-label";
      label.textContent = "截图加载失败";
      trigger.replaceChildren(label);
    });
    trigger.append(image);
    grid.append(trigger);
  });

  section.append(grid);
  const note = document.createElement("p");
  note.className = "detail-note";
  note.textContent = "点击任意截图放大浏览；图片来自本地快照。";
  section.append(note);
  document.body.append(lightbox.element);
  return section;
}

function createHistorySection(
  history: SnapshotEntry[] | null,
  historyError: string | null,
  dates: string[],
): HTMLElement {
  const details = document.createElement("details");
  details.className = "version-history history-section";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "跨日历史（近 7 天）";
  details.append(summary);

  const list = document.createElement("div");
  list.className = "version-history-list history-list";
  if (historyError) {
    const error = document.createElement("p");
    error.className = "history-missing";
    error.textContent = `跨日历史加载失败：${historyError}`;
    list.append(error);
  } else if (history === null) {
    const loading = document.createElement("p");
    loading.className = "entry-empty";
    loading.textContent = "正在加载跨日历史…";
    list.append(loading);
  } else {
    const byDate = new Map(history.map((entry) => [entry.targetDate, entry]));
    for (const date of dates) {
      const entry = byDate.get(date);
      const row = document.createElement("div");
      row.className = `history-row${entry ? "" : " is-missing"}`;
      row.dataset.date = date;
      const dateLabel = document.createElement("span");
      dateLabel.className = "history-date";
      dateLabel.textContent = date;
      row.append(dateLabel);

      if (entry) {
        const status = statusText(entry.lookupStatus);
        row.append(createBadge(status.kind, status.kind === "hit" ? "命中" : status.kind === "miss" ? "未命中" : "待补全"));
        const version = document.createElement("span");
        version.className = "history-value";
        version.textContent = entry.appVersion ? `v${entry.appVersion}` : "版本 —";
        const category = document.createElement("span");
        category.className = "history-value";
        category.textContent = entry.category ?? "未分类";
        row.append(version, category);
      } else {
        const missing = document.createElement("span");
        missing.className = "history-missing";
        missing.textContent = "当天未入库";
        row.append(missing);
      }
      list.append(row);
    }
  }

  details.append(list);
  return details;
}

function createMetadata(packageDetail: PackageDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = "源数据 / App Store";
  section.append(title);

  const grid = document.createElement("div");
  grid.className = "detail-meta-grid";

  const source = createInfoList([
    ["源展示名", packageDetail.displayName],
    ["Bundle ID", packageDetail.packageCode],
    ["抓取时间", formatDateTime(packageDetail.fetchedAt)],
  ]);

  const json = packageDetail.appStoreJson;
  const price = jsonString(json, ["formattedPrice", "price"]);
  const rating = jsonString(json, ["averageUserRating"]);
  const storeUrl = safeExternalUrl(jsonString(json, ["trackViewUrl", "appStoreUrl"]))
    ?? (packageDetail.appleId !== null ? `https://apps.apple.com/app/id${packageDetail.appleId}` : null);

  const storeRows: Array<[string, string | HTMLElement]> = [
    ["appleId", packageDetail.appleId !== null ? String(packageDetail.appleId) : "—"],
    ["价格 / 评分", [price ?? "—", rating ? `${rating} / 5` : null].filter(Boolean).join(" · ")],
  ];
  if (storeUrl) {
    const link = document.createElement("a");
    link.className = "primary-link";
    link.href = storeUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "apps.apple.com ↗";
    storeRows.push(["App Store", link]);
  }
  const store = createInfoList(storeRows);

  grid.append(source, store);
  section.append(grid);
  return section;
}

export type DetailRenderOptions = {
  competitor: SummaryCompetitor;
  packageCode: string;
  packageDetail: PackageDetail | null;
  date: string;
  dateKind: DateKind;
  groupName: string;
  loading: boolean;
  error: string | null;
  history: SnapshotEntry[] | null;
  historyError: string | null;
  historyDates: string[];
  packageStatus: Map<string, LookupStatus>;
  onSelectPackage: (packageCode: string) => void;
  onRetry: () => void;
  onBack: () => void;
};

export function renderPackageDetail(host: HTMLElement, options: DetailRenderOptions): void {
  document.querySelectorAll(".screenshot-lightbox").forEach((lightbox) => lightbox.remove());
  document.body.classList.remove("is-lightbox-open");
  host.replaceChildren();

  const {
    competitor,
    packageCode,
    packageDetail,
    date,
    dateKind,
    groupName,
    loading,
    error,
    history,
    historyError,
    historyDates,
    packageStatus,
    onSelectPackage,
  } = options;

  const wrapper = document.createElement("div");
  wrapper.className = "detail-view";

  const top = document.createElement("div");
  top.className = "detail-top";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "detail-back";
  back.dataset.role = "detail-back";
  back.textContent = "← 返回竞品日报";
  back.addEventListener("click", options.onBack);
  top.append(back);

  const breadcrumb = document.createElement("p");
  breadcrumb.className = "breadcrumb";
  const name = packageDetail?.displayName && packageDetail.lookupStatus === "bundle_not_found"
    ? packageDetail.displayName
    : competitor.name;
  for (const [index, part] of ["竞品日报", groupName, name].filter(Boolean).entries()) {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = "/";
      breadcrumb.append(separator);
    }
    const item = document.createElement("span");
    item.textContent = part;
    if (index === 2) item.className = "is-current";
    breadcrumb.append(item);
  }
  top.append(breadcrumb);
  wrapper.append(top);

  if (error) {
    const card = document.createElement("section");
    card.className = "detail-error";
    card.dataset.role = "detail-error";
    const heading = document.createElement("h2");
    heading.textContent = "无法加载该竞品详情";
    const reason = document.createElement("p");
    reason.textContent = `${packageCode} 在 ${date} 的快照请求失败：${error}`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary-button";
    retry.dataset.role = "detail-retry";
    retry.textContent = "重试";
    retry.addEventListener("click", options.onRetry);
    card.append(heading, reason, retry);
    wrapper.append(card);
    host.append(wrapper);
    return;
  }

  if (loading || !packageDetail) {
    const surface = document.createElement("section");
    surface.className = "identity-surface";
    const missedStatus = packageStatus.get(packageCode) === "bundle_not_found";
    const placeholder = document.createElement("span");
    placeholder.className = `identity-icon${missedStatus ? " identity-icon-missed" : " identity-icon-fallback"}`;
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = missedStatus ? "?" : (competitor.name || "?").slice(0, 1).toUpperCase();
    surface.append(placeholder);

    const copy = document.createElement("div");
    copy.className = "identity-copy";
    const titleRow = document.createElement("div");
    titleRow.className = "identity-title-row";
    const heading = document.createElement("h2");
    heading.textContent = competitor.name || packageCode;
    titleRow.append(heading, createBadge("neutral", "加载中"));
    const line = document.createElement("p");
    line.className = "identity-line";
    line.textContent = packageCode;
    copy.append(titleRow, line);
    surface.append(copy);
    wrapper.append(surface);

    const context = document.createElement("section");
    context.className = "context-strip";
    const contextTitle = document.createElement("p");
    contextTitle.className = "context-title";
    contextTitle.textContent = `快照 ${date} · ${DATE_KIND_LABEL[dateKind]}口径`;
    const contextReason = document.createElement("p");
    contextReason.className = "context-reason";
    contextReason.textContent = `因${DATE_KIND_LABEL[dateKind]} = ${date} 出现在当日列表。`;
    const contextPackage = document.createElement("p");
    contextPackage.className = "context-package";
    contextPackage.textContent = `包：${packageCode}`;
    context.append(contextTitle, contextReason, contextPackage);
    if (competitor.packageCount > 1) {
      context.append(createPackageSwitcher(competitor, packageCode, packageStatus, onSelectPackage));
    }
    wrapper.append(context);

    const skeleton = document.createElement("div");
    skeleton.className = "detail-skeleton";
    skeleton.dataset.role = "detail-loading";
    const loadingLabel = document.createElement("p");
    loadingLabel.className = "skeleton-label";
    loadingLabel.textContent = `正在加载 ${packageCode}…`;
    const loadingBlock = document.createElement("div");
    loadingBlock.className = "skeleton-block skeleton-body";
    skeleton.append(loadingLabel, loadingBlock);
    wrapper.append(skeleton);
    host.append(wrapper);
    return;
  }

  const isMissed = packageDetail.lookupStatus === "bundle_not_found";
  const json = packageDetail.appStoreJson;
  const appStoreUrl = !isMissed
    ? safeExternalUrl(jsonString(json, ["trackViewUrl", "appStoreUrl"]))
      ?? (packageDetail.appleId !== null ? `https://apps.apple.com/app/id${packageDetail.appleId}` : null)
    : null;

  wrapper.append(createIdentity(name, packageDetail, isMissed, appStoreUrl));

  const context = document.createElement("section");
  context.className = "context-strip";
  const contextTitle = document.createElement("p");
  contextTitle.className = "context-title";
  contextTitle.textContent = `快照 ${date} · ${DATE_KIND_LABEL[dateKind]}口径`;
  const contextReason = document.createElement("p");
  contextReason.className = "context-reason";
  contextReason.textContent = `因${DATE_KIND_LABEL[dateKind]} = ${date} 出现在当日列表。`;
  context.append(contextTitle, contextReason);
  const contextPackage = document.createElement("p");
  contextPackage.className = "context-package";
  contextPackage.textContent = `包：${packageDetail.packageCode}`;
  context.append(contextPackage);
  if (competitor.packageCount > 1) {
    context.append(createPackageSwitcher(competitor, packageCode, packageStatus, onSelectPackage));
  }
  wrapper.append(context);

  if (packageDetail.fetchedAt.slice(0, 10) !== date) {
    const warning = document.createElement("p");
    warning.className = "snapshot-warning";
    warning.dataset.role = "snapshot-warning";
    warning.textContent = `该包主记录更新于 ${formatDateTime(packageDetail.fetchedAt)}，可能不是 ${date} 的原始快照。`;
    wrapper.append(warning);
  }

  if (isMissed) {
    const facts = createInfoList([
      ["投放日期", packageDetail.firstAdDate],
      ["上架日期", packageDetail.listingDate ?? "—"],
      ["首百日期", packageDetail.first100Date ?? "—"],
      ["下架日期", packageDetail.offlineDate ?? "—"],
      ["团队", packageDetail.team],
      ["类目", packageDetail.category ?? "—"],
      ["最低 iOS", packageDetail.minimumOsVersion ?? "—"],
      ["图片状态", "—"],
    ]);
    wrapper.append(facts);

    const why = document.createElement("section");
    why.className = "why-missed";
    const whyTitle = document.createElement("h3");
    whyTitle.textContent = "为什么未命中";
    const whyBody = document.createElement("p");
    whyBody.textContent = "系统已把 package_code 当作 Bundle ID，在 8 个抓取区域做了精确查找，没有找到 bundleId 完全一致的结果。这不代表包不存在：可能尚未上架、已下架，或其他区域未覆盖。";
    why.append(whyTitle, whyBody);
    wrapper.append(why);

    const noDetails = document.createElement("section");
    noDetails.className = "detail-placeholder detail-placeholder-block";
    const noDetailsText = document.createElement("p");
    noDetailsText.textContent = "未命中，无 App Store 详情可展示。";
    const searchLink = document.createElement("a");
    searchLink.className = "secondary-button";
    searchLink.href = `${import.meta.env.BASE_URL}index.html?bundle=${encodeURIComponent(packageDetail.packageCode)}`;
    searchLink.textContent = "到 App Store 搜索中查询此 Bundle ID";
    noDetails.append(noDetailsText, searchLink);
    wrapper.append(noDetails);
  } else {
    const columns = document.createElement("div");
    columns.className = "detail-columns";

    const factsSection = document.createElement("section");
    factsSection.className = "detail-section";
    const factsTitle = document.createElement("h3");
    factsTitle.className = "detail-section-title";
    factsTitle.textContent = "当日快照";
    const factRows: Array<[string, string | HTMLElement]> = [
      ["投放日期", packageDetail.firstAdDate],
      ["上架日期", packageDetail.listingDate ?? "—"],
      ["首百日期", packageDetail.first100Date ?? "—"],
      ["下架日期", packageDetail.offlineDate ?? "—"],
      ["团队", packageDetail.team],
      ["类目", packageDetail.category ?? "—"],
      ["最低 iOS", packageDetail.minimumOsVersion ?? "—"],
      ["当前版本", packageDetail.appVersion ?? "—"],
      ["图片状态", assetStatusLabel(packageDetail.assetStatus)],
    ];
    if (packageDetail.enrichStatus !== "ok") {
      factRows.push(["详情状态", createBadge("warn", "详情不完整")]);
    }
    factsSection.append(factsTitle, createInfoList(factRows));
    columns.append(factsSection);

    const versionsSection = document.createElement("section");
    versionsSection.className = "detail-section";
    versionsSection.append(createVersionHistory(packageDetail.versions));
    columns.append(versionsSection);
    wrapper.append(columns);

    wrapper.append(createScreenshotSection(name, packageDetail.screenshotLocalPaths));
  }

  wrapper.append(createHistorySection(history, historyError, historyDates));
  wrapper.append(createMetadata(packageDetail));

  host.append(wrapper);
}
