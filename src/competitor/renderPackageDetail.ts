import { competitorAssetUrl } from "../lib/competitorApi";
import { createScreenshotLightbox } from "../lib/renderResults";
import type {
  AssetStatus,
  PackageDetail,
  SummaryCompetitor,
} from "../../shared/competitorTypes";

type IapEntry = { name: string; price: string };

function svgIcon(paths: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

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

function dateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

function iapEntries(json: Record<string, unknown>): IapEntry[] {
  if (!Array.isArray(json.iapItems)) return [];
  return (json.iapItems as Array<{ name?: unknown; price?: unknown }>)
    .filter((item) => typeof item?.name === "string" && item.name.trim())
    .map((item) => ({
      name: String(item.name).trim(),
      price: typeof item.price === "string" ? item.price.trim() : "",
    }));
}

function formatSize(bytes: unknown): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  return `${(bytes / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} MB`;
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
  copy.append(titleRow);

  const developer = document.createElement("p");
  developer.className = "identity-developer";
  developer.textContent = jsonString(packageDetail.appStoreJson, ["developer"]) ?? "—";
  copy.append(developer);

  if (!isMissed) {
    const links = document.createElement("div");
    links.className = "identity-links";
    if (appStoreUrl) {
      const link = document.createElement("a");
      link.className = "wx-button identity-link";
      link.href = appStoreUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.append("App Store 查看", svgIcon('<path d="M5 11L11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>'));
      links.append(link);
    }
    if (packageDetail.appleId !== null) {
      const qimai = document.createElement("a");
      qimai.className = "wx-button identity-link";
      qimai.href = `https://www.qimai.cn/app/baseinfo/appid/${packageDetail.appleId}/country/us`;
      qimai.target = "_blank";
      qimai.rel = "noreferrer";
      qimai.append("七麦查看", svgIcon('<path d="M5 11L11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>'));
      links.append(qimai);
    }
    if (links.childElementCount > 0) copy.append(links);
  }

  surface.append(copy);
  return surface;
}

function createMetricBar(packageDetail: PackageDetail, json: Record<string, unknown>): HTMLElement {
  const versions = packageDetail.versions;
  const latest = versions[0];
  const earliest = versions[versions.length - 1];
  const iapCount = iapEntries(json).length;
  const metrics: Array<[string, string | HTMLElement]> = [
    ["APP ID", packageDetail.appleId !== null
      ? createCopyValue(String(packageDetail.appleId), "APP ID", "app-id-copy")
      : "—"],
    ["分类", packageDetail.category ?? "—"],
    ["价格", jsonString(json, ["formattedPrice"]) ?? "—"],
    ["内购", iapCount > 0 ? `${iapCount} 项` : "无"],
    ["最近更新", latest ? dateOnly(latest.releasedAt) : "—"],
    ["最早发布", earliest ? dateOnly(earliest.releasedAt) : dateOnly(packageDetail.listingDate)],
  ];

  const bar = document.createElement("div");
  bar.className = "detail-metrics";
  for (const [label, value] of metrics) {
    const item = document.createElement("div");
    item.className = "detail-metric";
    item.dataset.role = "metric";
    const key = document.createElement("span");
    key.className = "detail-metric-label";
    key.textContent = label;
    const text = document.createElement("span");
    text.className = "detail-metric-value";
    if (value instanceof HTMLElement) text.append(value);
    else text.textContent = value;
    item.append(key, text);
    bar.append(item);
  }
  return bar;
}

function createIapSection(json: Record<string, unknown>): HTMLElement | null {
  const items = iapEntries(json);
  if (items.length === 0) return null;

  const section = document.createElement("section");
  section.className = "detail-section iap-section";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = `内购（${items.length}）`;
  section.append(title);

  const list = document.createElement("div");
  list.className = "iap-list";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "iap-row";
    const name = document.createElement("span");
    name.className = "iap-name";
    name.textContent = item.name;
    const price = document.createElement("span");
    price.className = "iap-price";
    price.textContent = item.price || "—";
    row.append(name, price);
    list.append(row);
  }
  section.append(list);
  return section;
}

function createDescriptionSection(json: Record<string, unknown>): HTMLElement | null {
  const description = jsonString(json, ["description"]);
  if (!description) return null;

  const section = document.createElement("section");
  section.className = "detail-section description-section";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = "应用描述";

  const copy = document.createElement("div");
  copy.className = "app-description-copy is-collapsed";
  copy.textContent = description;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "detail-toggle";
  toggle.dataset.role = "description-toggle";
  toggle.textContent = "展开";
  toggle.setAttribute("aria-expanded", "false");
  toggle.hidden = true;
  toggle.addEventListener("click", () => {
    const collapsed = copy.classList.toggle("is-collapsed");
    toggle.textContent = collapsed ? "展开" : "收起";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });

  section.append(title, copy, toggle);
  return section;
}

function createVersionHistory(versions: PackageDetail["versions"]): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section version-history-section";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = "更新日志";
  section.append(title);

  const list = document.createElement("div");
  list.className = "version-history-list";
  if (versions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "entry-empty";
    empty.textContent = "暂无版本记录";
    list.append(empty);
  }

  versions.forEach((version, index) => {
    const item = document.createElement("article");
    item.className = "version-history-item";
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
    time.textContent = dateOnly(version.releasedAt);
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

  section.append(list);
  return section;
}

function createScreenshotSection(name: string, paths: string[]): HTMLElement | null {
  const urls = paths.map((path) => competitorAssetUrl(path)).filter((url): url is string => Boolean(url));
  if (urls.length === 0) return null;

  const section = document.createElement("section");
  section.className = "detail-section";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = `截图（${urls.length}）`;
  section.append(title);

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
  document.body.append(lightbox.element);
  return section;
}

function createCopyValue(value: string, label: string, role: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "copy-value";
  const text = document.createElement("span");
  text.className = "copy-value-text";
  text.textContent = value;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "detail-copy";
  button.dataset.role = role;
  button.textContent = "复制";
  button.setAttribute("aria-label", `复制 ${label}`);
  button.addEventListener("click", () => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return;
    void clipboard.writeText(value).then(() => {
      button.textContent = "已复制";
      window.setTimeout(() => {
        button.textContent = "复制";
      }, 1200);
    }).catch(() => undefined);
  });

  wrap.append(text, button);
  return wrap;
}

function createPackageInfo(packageDetail: PackageDetail, json: Record<string, unknown>): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section package-info";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = "应用包信息";

  const bundleId = jsonString(json, ["bundleId"]) ?? packageDetail.packageCode;
  const latest = packageDetail.versions[0];
  const rows: Array<[string, string | HTMLElement]> = [
    ["开发者", jsonString(json, ["developer"]) ?? "—"],
    ["发布日期", dateOnly(packageDetail.listingDate)],
    ["更新日期", latest ? dateOnly(latest.releasedAt) : "—"],
    ["Bundle ID", createCopyValue(bundleId, "Bundle ID", "bundle-copy")],
    ["版本", packageDetail.appVersion ?? "—"],
    ["大小", formatSize(json.fileSizeBytes)],
    ["团队", packageDetail.team || "—"],
    ["类目", packageDetail.category ?? "—"],
    ["最低 iOS", packageDetail.minimumOsVersion ?? "—"],
    ["源展示名", packageDetail.displayName || "—"],
    ["图片状态", assetStatusLabel(packageDetail.assetStatus)],
  ];

  section.append(title, createInfoList(rows));
  return section;
}

function createMissedPanel(packageDetail: PackageDetail): HTMLElement {
  const section = document.createElement("section");
  section.className = "detail-section package-info";
  const title = document.createElement("h3");
  title.className = "detail-section-title";
  title.textContent = "源数据";
  section.append(title, createInfoList([
    ["团队", packageDetail.team || "—"],
    ["类目", packageDetail.category ?? "—"],
    ["最低 iOS", packageDetail.minimumOsVersion ?? "—"],
    ["上架日期", packageDetail.listingDate ?? "—"],
    ["下架日期", packageDetail.offlineDate ?? "—"],
    ["图片状态", assetStatusLabel(packageDetail.assetStatus)],
  ]));

  const placeholder = document.createElement("div");
  placeholder.className = "detail-placeholder-block";
  const text = document.createElement("p");
  text.textContent = "未命中，无 App Store 详情可展示。";
  const link = document.createElement("a");
  link.className = "wx-button";
  link.href = `${import.meta.env.BASE_URL}search.html?bundle=${encodeURIComponent(packageDetail.packageCode)}`;
  link.textContent = "到 App Store 搜索中查询此 Bundle ID";
  placeholder.append(text, link);
  section.append(placeholder);
  return section;
}

export type DetailRenderOptions = {
  competitor: SummaryCompetitor;
  packageCode: string;
  packageDetail: PackageDetail | null;
  groupName: string;
  loading: boolean;
  error: string | null;
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
    groupName,
    loading,
    error,
  } = options;

  const wrapper = document.createElement("div");
  wrapper.className = "detail-view";

  const top = document.createElement("div");
  top.className = "detail-top";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "detail-back";
  back.dataset.role = "detail-back";
  back.append(svgIcon('<path d="M9 4L5 8l4 4M5 8h7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>'), "返回时间线");
  back.addEventListener("click", options.onBack);
  top.append(back);

  const breadcrumb = document.createElement("p");
  breadcrumb.className = "breadcrumb";
  const name = packageDetail?.displayName && packageDetail.lookupStatus === "bundle_not_found"
    ? packageDetail.displayName
    : competitor.name;
  for (const [index, part] of ["时间线", groupName, name].filter(Boolean).entries()) {
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
    reason.textContent = `${packageCode} 详情请求失败：${error}`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "wx-button";
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
    const placeholder = document.createElement("span");
    placeholder.className = "identity-icon identity-icon-fallback";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = (competitor.name || packageCode || "?").slice(0, 1).toUpperCase();
    surface.append(placeholder);

    const copy = document.createElement("div");
    copy.className = "identity-copy";
    const titleRow = document.createElement("div");
    titleRow.className = "identity-title-row";
    const heading = document.createElement("h2");
    heading.textContent = competitor.name || packageCode;
    titleRow.append(heading, createBadge("neutral", "加载中"));
    copy.append(titleRow);
    surface.append(copy);
    wrapper.append(surface);

    const skeleton = document.createElement("div");
    skeleton.className = "detail-skeleton";
    skeleton.dataset.role = "detail-loading";
    const loadingLabel = document.createElement("p");
    loadingLabel.className = "wx-skeleton-label";
    loadingLabel.textContent = `正在加载 ${packageCode}…`;
    const loadingBlock = document.createElement("div");
    loadingBlock.className = "wx-skeleton-row detail-skeleton-block";
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

  if (isMissed) {
    wrapper.append(createMissedPanel(packageDetail));
    host.append(wrapper);
    return;
  }

  wrapper.append(createMetricBar(packageDetail, json));

  const columns = document.createElement("div");
  columns.className = "detail-columns";
  const main = document.createElement("div");
  main.className = "detail-main";
  const aside = document.createElement("div");
  aside.className = "detail-aside";

  const screenshots = createScreenshotSection(name, packageDetail.screenshotLocalPaths);
  if (screenshots) main.append(screenshots);
  const iap = createIapSection(json);
  if (iap) main.append(iap);
  const description = createDescriptionSection(json);
  if (description) main.append(description);
  main.append(createVersionHistory(packageDetail.versions));
  aside.append(createPackageInfo(packageDetail, json));
  columns.append(main, aside);
  wrapper.append(columns);

  host.append(wrapper);

  // Measure after mount so the 12-line clamp can reveal the toggle only when needed.
  host.querySelectorAll<HTMLElement>(".app-description-copy").forEach((copy) => {
    const toggle = copy.parentElement?.querySelector<HTMLButtonElement>('[data-role="description-toggle"]');
    if (!toggle) return;
    const text = copy.textContent ?? "";
    // shortcut: character count approximates 12 lines when layout is not measurable (jsdom).
    if (text.length > 600 || text.split("\n").length > 12 || copy.scrollHeight > copy.clientHeight + 1) {
      toggle.hidden = false;
    }
  });
}
