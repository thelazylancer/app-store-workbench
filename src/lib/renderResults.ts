import { getAppDetails } from "./api";
import type {
  AlternateApp,
  AppVersionHistoryItem,
  IapHints,
  IapHintState,
  IapItem,
  LookupCandidate,
  MatchedApp,
  SearchResult,
  StoreCountry,
} from "../../shared/types";

const MAX_VISIBLE_VERSION_HISTORY = 5;
const renderInstances = new WeakMap<HTMLElement, symbol>();
const renderCleanups = new WeakMap<HTMLElement, () => void>();
let nextWorkbenchId = 0;

type CanvasView = "candidates" | "detail";

type CandidateInspection = {
  app: MatchedApp;
  iapHints: IapHints | null;
  state: "loading" | "ready" | "failed" | "baseline";
};

function translateMessage(message: string | null | undefined) {
  if (!message) {
    return null;
  }

  switch (message) {
    case "Search failed":
      return "搜索失败";
    case "No App Store match found in US store":
      return "未在美国区 App Store 找到结果";
    case "Possible match found; review alternates":
      return "可能匹配，请检查备选结果";
    default: {
      const store = message.match(/^No App Store match found in ([A-Z]{2}) store$/);
      return store ? `未在 ${store[1]} 区 App Store 找到结果` : message;
    }
  }
}

function createStatusBadge(status: SearchResult["status"], candidateCount = 0) {
  const badge = document.createElement("span");
  badge.className = `status-badge status-${status}`;

  switch (status) {
    case "matched":
      badge.textContent = "已匹配";
      break;
    case "uncertain_match":
      badge.textContent = "待确认";
      break;
    case "no_match":
      badge.textContent = candidateCount > 0 ? "未自动匹配" : "未找到";
      break;
    case "search_failed":
      badge.textContent = "失败";
      break;
  }

  return badge;
}

function formatIapHint(state: IapHintState) {
  return state === "found" ? "命中" : state === "not_found" ? "未命中" : "未获取";
}

function formatIapItemCount(items: IapItem[]) {
  return items.length > 0 ? `${items.length} 个内购` : "未提取到内购价格";
}

function createFactPill(label: string) {
  const pill = document.createElement("span");
  pill.className = "fact-pill";
  pill.textContent = label;
  return pill;
}

function formatReleaseDate(value: string | null) {
  if (!value) {
    return "日期未知";
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value.split("T")[0] ?? "日期未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function getHighResolutionScreenshotUrl(src: string) {
  try {
    const url = new URL(src);
    const sizeSuffix = /\/\d+x\d+bb(?:-\d+)?(?=\.[^/]+$)/;

    if (!sizeSuffix.test(url.pathname)) {
      return src;
    }

    url.pathname = url.pathname.replace(sizeSuffix, "/1290x2796bb");
    return url.toString();
  } catch {
    return src;
  }
}

type ScreenshotLightbox = {
  element: HTMLDivElement;
  open: (index: number, trigger: HTMLButtonElement) => void;
};

function createScreenshotLightbox(
  urls: string[],
  appName: string,
): ScreenshotLightbox {
  const overlay = document.createElement("div");
  overlay.className = "screenshot-lightbox";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `${appName} 截图预览`);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "lightbox-close";
  closeButton.dataset.role = "lightbox-close";
  closeButton.setAttribute("aria-label", "关闭截图预览");
  closeButton.textContent = "关闭";

  const frame = document.createElement("div");
  frame.className = "lightbox-frame";

  const gallery = document.createElement("div");
  gallery.className = "screenshot-lightbox-strip";
  frame.append(gallery);

  const caption = document.createElement("p");
  caption.className = "lightbox-caption";
  caption.textContent = appName;

  const counter = document.createElement("span");
  counter.className = "lightbox-counter";

  const footer = document.createElement("div");
  footer.className = "lightbox-footer";
  footer.append(caption, counter);

  overlay.append(closeButton, frame, footer);

  let activeTrigger: HTMLButtonElement | null = null;

  function renderGallery() {
    gallery.replaceChildren();

    for (const [index, url] of urls.entries()) {
      const slide = document.createElement("figure");
      slide.className = "screenshot-lightbox-slide";
      slide.setAttribute("aria-busy", "true");

      const placeholder = document.createElement("div");
      placeholder.className = "screenshot-lightbox-placeholder";
      placeholder.setAttribute("role", "status");

      const indicator = document.createElement("span");
      indicator.className = "screenshot-lightbox-placeholder-indicator";
      indicator.setAttribute("aria-hidden", "true");

      const placeholderLabel = document.createElement("span");
      placeholderLabel.className = "screenshot-lightbox-placeholder-label";
      placeholderLabel.textContent = "正在加载高清截图";
      placeholder.append(indicator, placeholderLabel);

      const image = document.createElement("img");
      image.className = "screenshot-lightbox-image";
      image.alt = `${appName} 商店截图 ${index + 1}`;
      image.loading = "eager";
      image.decoding = "async";

      image.addEventListener("load", () => {
        slide.classList.add("is-loaded");
        slide.classList.remove("is-error");
        slide.removeAttribute("aria-busy");
      });
      image.addEventListener("error", () => {
        slide.classList.add("is-error");
        slide.classList.remove("is-loaded");
        slide.removeAttribute("aria-busy");
        indicator.classList.add("is-error");
        placeholderLabel.textContent = "截图加载失败";
      });

      image.src = getHighResolutionScreenshotUrl(url);
      slide.append(placeholder, image);
      gallery.append(slide);

      if (image.complete && image.naturalWidth > 0) {
        slide.classList.add("is-loaded");
        slide.removeAttribute("aria-busy");
      }
    }

    counter.textContent = `${urls.length} 张截图`;
  }

  function close() {
    overlay.hidden = true;
    document.body?.classList.remove("is-lightbox-open");
    document.removeEventListener("keydown", handleKeyDown);
    activeTrigger?.focus();
    activeTrigger = null;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (overlay.hidden) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function open(index: number, trigger: HTMLButtonElement) {
    activeTrigger = trigger;
    renderGallery();
    overlay.hidden = false;
    document.body?.classList.add("is-lightbox-open");
    const target = gallery.querySelectorAll<HTMLImageElement>(
      ".screenshot-lightbox-image",
    )[index];

    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "nearest", inline: "center" });
    }

    document.addEventListener("keydown", handleKeyDown);
    closeButton.focus();
  }

  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target === frame || event.target === gallery) {
      close();
    }
  });
  overlay.addEventListener("lightbox-dispose", close);

  return { element: overlay, open };
}

function createScreenshot(
  src: string,
  alt: string,
  index: number,
  openLightbox: ScreenshotLightbox["open"],
) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "screenshot-trigger";
  trigger.setAttribute("aria-label", `放大查看${alt}`);
  trigger.addEventListener("click", () => openLightbox(index, trigger));

  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.className = "screenshot";
  image.loading = "lazy";
  image.decoding = "async";
  trigger.append(image);

  return trigger;
}

function createIapRow(item: IapItem) {
  const row = document.createElement("div");
  row.className = "iap-row";

  const name = document.createElement("span");
  name.className = "iap-name";
  name.textContent = item.name;
  row.append(name);

  const price = document.createElement("span");
  price.className = "iap-price";
  price.textContent = item.price;
  row.append(price);

  return row;
}

function createDescriptionBlock(text: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "description-block";

  const description = document.createElement("p");
  description.className = "description is-clamped";
  description.textContent = text;
  wrapper.append(description);

  if (text.length > 360) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "text-toggle";
    toggle.textContent = "展开";
    toggle.addEventListener("click", () => {
      const expanded = description.classList.toggle("is-clamped");
      toggle.textContent = expanded ? "展开" : "收起";
    });
    wrapper.append(toggle);
  }

  return wrapper;
}

function createIdentifier(label: string, value: string | undefined) {
  const identifier = document.createElement("span");
  identifier.className = "identifier-value";

  const text = document.createElement("span");
  text.className = "identifier-text";
  text.textContent = value?.trim() ? value : "未提供";
  identifier.append(text);

  if (value === undefined || !value.trim()) {
    return identifier;
  }

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "identifier-copy";
  copyButton.textContent = "复制";
  copyButton.setAttribute("aria-label", `复制 ${label}：${value}`);

  const status = document.createElement("span");
  status.className = "identifier-status";
  status.setAttribute("role", "status");

  let copying = false;
  copyButton.addEventListener("click", async () => {
    if (copying) {
      return;
    }
    copying = true;
    copyButton.setAttribute("aria-disabled", "true");
    status.textContent = "";
    try {
      await navigator.clipboard.writeText(value);
      status.textContent = "已复制";
    } catch {
      status.textContent = "复制失败，请手动选择标识";
    } finally {
      copying = false;
      copyButton.setAttribute("aria-disabled", "false");
    }
  });

  identifier.append(copyButton, status);
  return identifier;
}

function createInfoRow(label: string, value: string | HTMLElement) {
  const row = document.createElement("div");
  row.className = "info-row";

  const name = document.createElement("span");
  name.className = "info-row-label";
  name.textContent = label;
  row.append(name);

  const content = document.createElement("span");
  content.className = "info-row-value";
  content.append(value);
  row.append(content);

  return row;
}

function createVersionHistory(items: AppVersionHistoryItem[]) {
  const visibleItems = items.slice(0, MAX_VISIBLE_VERSION_HISTORY);
  const details = document.createElement("details");
  details.className = "version-history";
  details.open = true;

  const summary = document.createElement("summary");
  summary.textContent =
    items.length > visibleItems.length
      ? `版本历史 · 最近 ${visibleItems.length} 个（共 ${items.length} 个）`
      : `版本历史 · ${items.length} 个版本`;
  details.append(summary);

  const list = document.createElement("div");
  list.className = "version-history-list";

  for (const item of visibleItems) {
    const entry = document.createElement("article");
    entry.className = "version-history-item";

    const header = document.createElement("div");
    header.className = "version-history-header";

    const version = document.createElement("strong");
    version.textContent = `版本 ${item.version}`;
    header.append(version);

    const date = document.createElement("time");
    date.dateTime = item.releasedAt ?? "";
    date.textContent = formatReleaseDate(item.releasedAt);
    header.append(date);

    entry.append(header);

    if (item.notes) {
      const notes = document.createElement("p");
      notes.className = "version-history-notes";
      notes.textContent = item.notes;
      entry.append(notes);
    }

    list.append(entry);
  }

  details.append(list);
  return details;
}

function getComparisonFacts(app: AlternateApp) {
  const price = app.price === undefined
    ? "未提供"
    : app.price === 0
      ? "免费"
      : `${app.formattedPrice ?? String(app.price)} · ${app.currency ?? "币种未提供"}`;

  const rating = app.averageUserRating === undefined
    ? "未提供"
    : `${app.averageUserRating.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} / 5`;
  const ratingCount = app.userRatingCount === undefined
    ? ""
    : ` · ${app.userRatingCount.toLocaleString("zh-CN")} 条评分`;

  return [
    ["应用价格", price],
    ["评分", `${rating}${ratingCount}`],
    ["安装包大小", app.fileSizeBytes === undefined
      ? "未提供"
      : `${(app.fileSizeBytes / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} MB`],
    ["最低 iOS", app.minimumOsVersion?.trim() ? `${app.minimumOsVersion}+` : "未提供"],
  ] as const;
}

function createCandidateCard(
  app: AlternateApp,
  label: string,
  current = false,
  rank?: number,
  country: StoreCountry = "us",
  onInspect?: () => void,
) {
  const card = document.createElement("article");
  card.className = `candidate-card${current ? " is-current" : ""}`;
  card.dataset.candidateKey = candidateKey(app);

  const header = document.createElement("div");
  header.className = "candidate-card-header";

  if (label) {
    const eyebrow = document.createElement("span");
    eyebrow.className = "candidate-card-tag";
    eyebrow.textContent = label;
    header.append(eyebrow);
  }

  if (typeof rank === "number") {
    const rankLabel = document.createElement("span");
    rankLabel.className = "candidate-card-rank";
    rankLabel.textContent = `#${String(rank).padStart(2, "0")}`;
    header.append(rankLabel);
  }

  card.append(header);

  const body = document.createElement("div");
  body.className = "candidate-card-body";

  if (app.iconUrl) {
    const icon = document.createElement("img");
    icon.src = app.iconUrl;
    icon.alt = "";
    icon.className = "candidate-card-icon";
    body.append(icon);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "row-icon-placeholder candidate-card-icon";
    placeholder.textContent = app.name.slice(0, 1).toUpperCase();
    body.append(placeholder);
  }

  const copy = document.createElement("div");
  copy.className = "candidate-card-copy";

  const title = document.createElement("strong");
  title.textContent = app.name;
  copy.append(title);

  const developer = document.createElement("span");
  developer.textContent = app.developer;
  copy.append(developer);

  const appleId = document.createElement("div");
  appleId.className = "candidate-card-apple-id";
  const appleIdLabel = document.createElement("span");
  appleIdLabel.className = "identifier-label";
  appleIdLabel.textContent = "Apple ID：";
  appleId.append(
    appleIdLabel,
    createIdentifier("Apple ID", typeof app.appleId === "number" ? String(app.appleId) : undefined),
  );
  copy.append(appleId);

  const bundleId = document.createElement("div");
  bundleId.className = "candidate-card-bundle-id";
  const bundleIdLabel = document.createElement("span");
  bundleIdLabel.className = "identifier-label";
  bundleIdLabel.textContent = "Bundle ID：";
  bundleId.append(bundleIdLabel, createIdentifier("Bundle ID", app.bundleId));
  copy.append(bundleId);

  const meta = document.createElement("span");
  meta.textContent = `${app.category ?? "类目未知"} · ${app.screenshotUrls.length} 张截图`;
  copy.append(meta);

  const facts = document.createElement("div");
  facts.className = "candidate-card-facts";
  for (const [label, value] of getComparisonFacts(app)) {
    const fact = document.createElement("span");
    fact.textContent = `${label}：${value}`;
    facts.append(fact);
  }
  copy.append(facts);

  body.append(copy);
  card.append(body);

  const footer = document.createElement("div");
  footer.className = "candidate-card-footer";

  const screenshotUrls = app.screenshotUrls.slice(0, 3);
  if (screenshotUrls.length > 0) {
    const screenshots = document.createElement("div");
    screenshots.className = "candidate-card-screenshots";

    for (const [index, screenshotUrl] of screenshotUrls.entries()) {
      const image = document.createElement("img");
      image.src = screenshotUrl;
      image.alt = `${app.name} 商店截图 ${index + 1}`;
      image.className = "candidate-card-screenshot";
      image.loading = "lazy";
      image.decoding = "async";
      screenshots.append(image);
    }

    footer.append(screenshots);
  }

  if (onInspect) {
    const inspect = document.createElement("button");
    inspect.type = "button";
    inspect.className = "candidate-inspect";
    inspect.dataset.role = "candidate-inspect";
    inspect.dataset.candidateKey = candidateKey(app);
    inspect.setAttribute("aria-label", `查看 ${app.name} 的详情，${app.appleId ? `Apple ID ${app.appleId}` : app.developer}`);
    inspect.setAttribute("aria-pressed", String(current));
    inspect.textContent = current ? "重新查看详情" : "查看详情";
    inspect.addEventListener("click", onInspect);
    footer.append(inspect);
  }

  const action = document.createElement("a");
  action.href = app.appStoreUrl.replace(/^(https:\/\/apps\.apple\.com\/)[a-z]{2}\//i, `$1${country}/`);
  action.target = "_blank";
  action.rel = "noreferrer";
  action.className = "candidate-card-link";
  action.textContent = "打开商店页";
  footer.append(action);
  card.append(footer);

  return card;
}

function getCandidates(result: SearchResult): LookupCandidate[] {
  return result.candidates ?? [
    ...(result.app ? [result.app] : []),
    ...result.alternates.map((app) => ({ ...app, description: "", versionHistory: [] })),
  ];
}

function candidateKey(app: Pick<LookupCandidate, "appleId" | "appStoreUrl">) {
  return typeof app.appleId === "number" && Number.isSafeInteger(app.appleId) && app.appleId > 0
    ? `id:${app.appleId}` : `url:${app.appStoreUrl}`;
}

function createCandidates(
  result: SearchResult,
  country: StoreCountry,
  page: number,
  onPageChange: (page: number, control: string) => void,
  onInspect: (candidate: LookupCandidate) => void,
  inspection: CandidateInspection | null,
  filter: HTMLInputElement,
  onFilterChange: () => void,
) {
  const candidates = getCandidates(result);
  if (candidates.length === 0) return null;

  const section = document.createElement("section");
  section.className = "alternates compare-section";
  const title = document.createElement("h4");
  title.className = "alternates-label";
  title.textContent = "候选对比";
  section.append(title);

  const list = document.createElement("div");
  list.className = "alternate-list";
  const header = document.createElement("div");
  header.className = "alternate-list-header";
  const count = document.createElement("strong");
  count.dataset.role = "candidate-count";
  count.setAttribute("role", "status");
  const filterControls = document.createElement("div");
  filterControls.className = "candidate-bundle-filter";
  const label = document.createElement("label");
  label.textContent = "Bundle ID";
  filter.type = "text";
  filter.dataset.role = "candidate-bundle-filter";
  filter.placeholder = "输入 Bundle ID 片段";
  filter.autocomplete = "off";
  filter.spellcheck = false;
  filter.setAttribute("autocapitalize", "none");
  label.append(filter);
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "secondary-button";
  clear.dataset.role = "candidate-filter-clear";
  clear.textContent = "清除";
  clear.setAttribute("aria-label", "清除 Bundle ID 筛选");
  filterControls.append(label, clear);
  header.append(count, filterControls);
  list.append(header);

  const items = document.createElement("div");
  items.className = "alternate-list-items";
  list.append(items);

  const navigations = ["top", "bottom"].map((location) => {
    const navigation = document.createElement("nav");
    navigation.className = "candidate-pagination";
    navigation.setAttribute("aria-label", `候选结果分页（${location === "top" ? "顶部" : "底部"}）`);
    section.append(navigation);
    if (location === "top") section.append(list);
    return navigation;
  });

  function renderPage(page: number) {
    const query = filter.value.trim().toLowerCase();
    const filtered = Array.from(candidates.entries())
      .filter(([, candidate]) => !query || candidate.bundleId?.toLowerCase().includes(query));
    count.textContent = query ? `筛选 ${filtered.length} / ${candidates.length} 个候选` : `共 ${candidates.length} 个候选`;
    clear.disabled = filter.value.length === 0;
    items.replaceChildren();
    const currentApp = inspection?.app ?? result.app;
    for (const [index, candidate] of filtered.slice(page * 10, (page + 1) * 10)) {
      const current = currentApp !== null && candidateKey(candidate) === candidateKey(currentApp);
      items.append(createCandidateCard(
        current ? currentApp! : candidate,
        current ? inspection ? "当前查看" : "自动匹配应用" : "",
        current, index + 1, country, () => onInspect(candidate),
      ));
    }
    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-subtle";
      empty.textContent = "本次返回的候选中没有匹配的 Bundle ID。";
      items.append(empty);
    }

    const pages = Math.ceil(filtered.length / 10);
    for (const [index, navigation] of navigations.entries()) {
      navigation.replaceChildren();
      navigation.hidden = pages === 0;
      if (pages === 0) continue;
      const top = index === 0;
      const rolePrefix = top ? "candidates-top" : "candidates";
      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "secondary-button";
      previous.dataset.role = `${rolePrefix}-prev`;
      previous.textContent = "上一页";
      previous.setAttribute("aria-label", `${top ? "顶部" : "底部"}：上一页候选`);
      previous.disabled = page === 0;
      previous.addEventListener("click", () => onPageChange(page - 1, `${rolePrefix}-prev`));
      const position = document.createElement("span");
      position.dataset.role = top ? "candidate-page-top" : "candidate-page";
      position.setAttribute("role", "status");
      position.textContent = `第 ${page + 1} / ${pages} 页`;
      const next = document.createElement("button");
      next.type = "button";
      next.className = "secondary-button";
      next.dataset.role = `${rolePrefix}-next`;
      next.textContent = "下一页";
      next.setAttribute("aria-label", `${top ? "顶部" : "底部"}：下一页候选`);
      next.disabled = page + 1 >= pages;
      next.addEventListener("click", () => onPageChange(page + 1, `${rolePrefix}-next`));
      navigation.append(previous, position, next);
    }
  }
  filter.oninput = () => {
    onFilterChange();
    renderPage(0);
  };
  clear.addEventListener("click", () => {
    filter.value = "";
    onFilterChange();
    renderPage(0);
    if (!filter.closest("[hidden]")) filter.focus({ preventScroll: true });
  });
  renderPage(page);
  return section;
}

function createInspector(
  originalResult: SearchResult,
  country: StoreCountry,
  page: number,
  onPageChange: (page: number, control: string) => void,
  onInspect: (candidate: LookupCandidate) => void,
  inspection: CandidateInspection | null,
  view: CanvasView,
  id: string,
  onViewChange: (view: CanvasView, candidate?: string) => void,
  candidateFilter: HTMLInputElement,
  onFilterChange: () => void,
) {
  const result = inspection
    ? { ...originalResult, app: inspection.app, iapHints: inspection.iapHints }
    : originalResult;
  const inspector = document.createElement("div");
  inspector.className = "inspector";
  if (result.app) inspector.dataset.appKey = candidateKey(result.app);

  const context = document.createElement("div");
  context.className = "query-context";
  const query = document.createElement("p");
  query.className = "query-label";
  query.append("搜索词：");
  const queryName = document.createElement("strong");
  queryName.textContent = originalResult.query;
  query.append(queryName);
  const verdict = document.createElement("div");
  verdict.className = "query-verdict";
  const verdictLabel = document.createElement("span");
  verdictLabel.textContent = `${country.toUpperCase()} 区 · 原始匹配`;
  verdict.append(verdictLabel, createStatusBadge(originalResult.status, getCandidates(originalResult).length));
  context.append(query, verdict);
  inspector.append(context);

  const tabs = document.createElement("div");
  tabs.className = "canvas-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "结果视图");
  const panels = {} as Record<CanvasView, HTMLElement>;
  const controls: HTMLButtonElement[] = [];
  for (const name of ["candidates", "detail"] as const) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "canvas-tab";
    tab.dataset.role = `${name}-tab`;
    tab.id = `${id}-${name}-tab`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${id}-${name}-panel`);
    tab.setAttribute("aria-selected", String(view === name));
    tab.tabIndex = view === name ? 0 : -1;
    tab.disabled = name === "detail" && !result.app;
    tab.textContent = name === "candidates" ? `候选（${getCandidates(originalResult).length}）` : result.app ? "详情" : "详情（未选择）";
    tab.addEventListener("click", () => onViewChange(name));
    controls.push(tab);
    tabs.append(tab);

    const panel = document.createElement("section");
    panel.className = `canvas-panel ${name}-panel`;
    panel.dataset.role = `${name}-panel`;
    panel.id = `${id}-${name}-panel`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.hidden = view !== name;
    panels[name] = panel;
  }
  tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const available = controls.filter((control) => !control.disabled);
    const index = available.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
    onViewChange(available[next]!.dataset.role === "candidates-tab" ? "candidates" : "detail");
  });
  inspector.append(tabs, panels.candidates, panels.detail);
  const detailPanel = panels.detail;
  const candidates = createCandidates(originalResult, country, page, onPageChange, onInspect, inspection, candidateFilter, onFilterChange);
  if (candidates) {
    panels.candidates.append(candidates);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-subtle";
    empty.textContent = translateMessage(originalResult.message) ?? "商店本次没有返回候选应用。";
    panels.candidates.append(empty);
  }

  if (result.app) {
    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary-button";
    back.dataset.role = "back-to-candidates";
    back.textContent = "返回候选";
    back.addEventListener("click", () => onViewChange("candidates", candidateKey(result.app!)));
    actions.append(back);
    if (inspection) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-button";
      retry.dataset.role = "detail-retry";
      retry.textContent = "重新查看详情";
      retry.addEventListener("click", () => onInspect(inspection.app));
      actions.append(retry);
    }
    detailPanel.append(actions);
  }

  const top = document.createElement("div");
  top.className = "inspector-top";

  const meta = document.createElement("div");
  meta.className = "inspector-meta";

  const viewing = document.createElement("p");
  viewing.className = "viewing-label";
  viewing.textContent = inspection ? "当前查看的应用" : "自动匹配的应用";
  meta.append(viewing);

  const headingRow = document.createElement("div");
  headingRow.className = "inspector-heading-row";

  if (result.app) {
    const icon = document.createElement("img");
    icon.src = result.app.iconUrl;
    icon.alt = `${result.app.name} icon`;
    icon.className = "app-icon";
    headingRow.append(icon);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "row-icon-placeholder";
    placeholder.textContent = result.query.slice(0, 1).toUpperCase();
    headingRow.append(placeholder);
  }

  const headingCopy = document.createElement("div");
  headingCopy.className = "inspector-heading-copy";

  const title = document.createElement("h3");
  title.textContent = result.app ? result.app.name : result.query;
  headingCopy.append(title);

  if (result.app) {
    const developer = document.createElement("p");
    developer.className = "developer";
    developer.textContent = result.app.developer;
    headingCopy.append(developer);

    const factRow = document.createElement("div");
    factRow.className = "fact-row";
    factRow.append(createFactPill(result.app.category ?? "类目未知"));
    factRow.append(createFactPill(`${result.app.screenshotUrls.length} 张截图`));
    factRow.append(createFactPill(formatIapItemCount(result.app.iapItems)));

    if (country === "us" && result.iapHints) {
      factRow.append(createFactPill(`4.99 ${formatIapHint(result.iapHints["4.99"])}`));
      factRow.append(createFactPill(`9.99 ${formatIapHint(result.iapHints["9.99"])}`));
    }

    const latestVersion = result.app.versionHistory?.[0];
    if (latestVersion) {
      factRow.append(createFactPill(`版本 ${latestVersion.version}`));
    }

    headingCopy.append(factRow);
  }

  headingRow.append(headingCopy);
  meta.append(headingRow);
  top.append(meta);
  detailPanel.append(top);
  if (inspection) {
    detailPanel.dataset.state = inspection.state;

    if (inspection.state === "ready") {
      const readyState = document.createElement("p");
      readyState.className = "candidate-detail-state visually-hidden";
      readyState.dataset.role = "detail-state";
      readyState.setAttribute("role", "status");
      readyState.textContent = "商店详情已加载";
      detailPanel.append(readyState);
    } else {
      const detailState = document.createElement("p");
      detailState.className = "candidate-detail-state";
      detailState.dataset.role = "detail-state";
      detailState.setAttribute("role", "status");
      detailState.textContent = inspection.state === "loading"
        ? "详情加载中…"
        : inspection.state === "failed"
          ? "详情加载失败，可重试或打开商店页。"
          : "未提供 Apple ID，仅展示搜索信息。";
      detailState.setAttribute("aria-busy", String(inspection.state === "loading"));
      detailPanel.append(detailState);
    }
  }

  if (!result.app) {
    const message = document.createElement("p");
    message.className = "result-message";
    message.textContent = result.status === "no_match" && getCandidates(originalResult).length > 0
      ? "未自动匹配，请核对候选应用。"
      : translateMessage(result.message) ?? "暂无可展示详情。";
    detailPanel.append(message);
    return inspector;
  }

  const detailGrid = document.createElement("div");
  detailGrid.className = "detail-grid";

  const overviewSection = document.createElement("section");
  overviewSection.className = "detail-section";
  const overviewTitle = document.createElement("h4");
  overviewTitle.className = "section-title";
  overviewTitle.textContent = "商店信息";
  overviewSection.append(overviewTitle);

  const infoList = document.createElement("div");
  infoList.className = "info-list";
  infoList.append(
    createInfoRow(
      "Apple ID",
      createIdentifier("Apple ID", typeof result.app.appleId === "number" ? String(result.app.appleId) : undefined),
    ),
  );
  infoList.append(createInfoRow("Bundle ID", createIdentifier("Bundle ID", result.app.bundleId)));
  infoList.append(createInfoRow("类目", result.app.category ?? "未标注"));
  for (const [label, value] of getComparisonFacts(result.app)) {
    infoList.append(createInfoRow(label, value));
  }

  const latestVersion = result.app.versionHistory?.[0];
  if (latestVersion) {
    infoList.append(
      createInfoRow(
        "最新版本",
        `${latestVersion.version} · ${formatReleaseDate(latestVersion.releasedAt)}`,
      ),
    );
  }
  overviewSection.append(infoList);

  if (result.app.versionHistory.length > 0) {
    overviewSection.append(createVersionHistory(result.app.versionHistory));
  }

  const links = document.createElement("div");
  links.className = "inspector-links inspector-links-inline";

  const appStoreUrl = result.app.appStoreUrl.replace(/^(https:\/\/apps\.apple\.com\/)[a-z]{2}\//i, `$1${country}/`);
  const storeLink = document.createElement("a");
  storeLink.href = appStoreUrl;
  storeLink.target = "_blank";
  storeLink.rel = "noreferrer";
  storeLink.className = "primary-link";
  storeLink.textContent = "打开商店页";
  links.append(storeLink);

  const appleId = result.app.appleId;
  if (typeof appleId === "number" && Number.isSafeInteger(appleId) && appleId > 0) {
    const qimaiLink = document.createElement("a");
    qimaiLink.href = `https://www.qimai.cn/app/baseinfo/appid/${appleId}/country/${country}`;
    qimaiLink.target = "_blank";
    qimaiLink.rel = "noreferrer";
    qimaiLink.className = "secondary-link qimai-link";
    qimaiLink.textContent = "打开 Qimai";
    links.append(qimaiLink);
  }

  overviewSection.append(links);

  if (result.message && !inspection) {
    const message = document.createElement("p");
    message.className = "result-message";
    message.textContent = translateMessage(result.message);
    overviewSection.append(message);
  }

  const descriptionSection = document.createElement("div");
  descriptionSection.className = "detail-section detail-section-subtle";
  const descriptionTitle = document.createElement("h5");
  descriptionTitle.className = "subsection-title";
  descriptionTitle.textContent = "简介";
  descriptionSection.append(descriptionTitle);
  descriptionSection.append(createDescriptionBlock(result.app.description));

  overviewSection.append(descriptionSection);
  detailGrid.append(overviewSection);

  const pricingSection = document.createElement("section");
  pricingSection.className = "detail-section";
  const pricingTitle = document.createElement("h4");
  pricingTitle.className = "section-title";
  pricingTitle.textContent = "价格线索";
  pricingSection.append(pricingTitle);

  const hints = document.createElement("p");
  hints.className = "iap-hints";
  hints.textContent = country !== "us"
    ? "4.99 / 9.99 美元价格线索仅适用于美国区"
    : result.iapHints
      ? `4.99 ${formatIapHint(result.iapHints["4.99"])} · 9.99 ${formatIapHint(result.iapHints["9.99"])}`
      : "暂无价格线索";
  pricingSection.append(hints);

  if (result.app.iapItems.length > 0) {
    const iapList = document.createElement("div");
    iapList.className = "iap-list";

    for (const item of result.app.iapItems) {
      iapList.append(createIapRow(item));
    }

    pricingSection.append(iapList);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-subtle";
    empty.textContent = "未提取到内购价格行。";
    pricingSection.append(empty);
  }

  detailGrid.append(pricingSection);
  detailPanel.append(detailGrid);

  const screenshotsSection = document.createElement("section");
  screenshotsSection.className = "detail-section screenshots-section";
  const screenshotsTitle = document.createElement("h4");
  screenshotsTitle.className = "section-title";
  screenshotsTitle.textContent = "截图";
  screenshotsSection.append(screenshotsTitle);

  if (result.app.screenshotUrls.length > 0) {
    const screenshots = document.createElement("div");
    screenshots.className = "screenshots";
    const lightbox = createScreenshotLightbox(
      result.app.screenshotUrls,
      result.app.name,
    );

    for (const [index, screenshotUrl] of result.app.screenshotUrls.entries()) {
      screenshots.append(
        createScreenshot(
          screenshotUrl,
          `${result.app.name} 商店截图 ${index + 1}`,
          index,
          lightbox.open,
        ),
      );
    }

    screenshotsSection.append(screenshots);
    document.body?.append(lightbox.element);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-subtle";
    empty.textContent = "未提取到截图。";
    screenshotsSection.append(empty);
  }

  detailPanel.append(screenshotsSection);

  return inspector;
}

function createResultRow(result: SearchResult) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "result-row";
  row.setAttribute("aria-pressed", "false");

  const identity = document.createElement("div");
  identity.className = "result-row-identity";

  if (result.app) {
    const icon = document.createElement("img");
    icon.src = result.app.iconUrl;
    icon.alt = "";
    icon.className = "result-row-icon";
    identity.append(icon);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "row-icon-placeholder";
    placeholder.textContent = result.query.slice(0, 1).toUpperCase();
    identity.append(placeholder);
  }

  const copy = document.createElement("div");
  copy.className = "result-row-copy";

  const title = document.createElement("strong");
  title.textContent = result.query;
  copy.append(title);

  const sub = document.createElement("span");
  sub.className = "result-row-subtitle";
  const candidates = getCandidates(result);
  sub.textContent = result.app
    ? `${result.app.name} · ${result.app.developer}`
    : result.status === "no_match" && candidates.length > 0
      ? `${candidates.length} 个候选`
      : translateMessage(result.message) ?? "未找到结果";
  copy.append(sub);

  if (result.app) {
    const meta = document.createElement("span");
    meta.className = "result-row-meta";
    meta.textContent =
      `${result.app.category ?? "类目未知"} · ` +
      `${result.app.screenshotUrls.length} 张截图 · ` +
      formatIapItemCount(result.app.iapItems);
    copy.append(meta);
  }

  if (candidates.length > 0 && (result.app !== null || result.status !== "no_match")) {
    const candidateCount = document.createElement("span");
    candidateCount.className = "result-row-meta";
    candidateCount.textContent = `${candidates.length} 个候选`;
    copy.append(candidateCount);
  }
  identity.append(copy);
  row.append(identity);
  row.append(createStatusBadge(result.status, candidates.length));

  return row;
}

export function renderResults(
  host: HTMLElement,
  results: SearchResult[],
  hasSearched = true,
  options: { country?: StoreCountry } = {},
) {
  renderCleanups.get(host)?.();
  renderCleanups.delete(host);
  const instance = Symbol();
  renderInstances.set(host, instance);
  const country = options.country ?? "us";
  const wasConnected = host.isConnected;
  document.querySelectorAll(".screenshot-lightbox").forEach((lightbox) => {
    lightbox.dispatchEvent(new Event("lightbox-dispose"));
    lightbox.remove();
  });
  document.body?.classList.remove("is-lightbox-open");
  host.innerHTML = "";

  if (results.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = hasSearched
      ? "没有返回结果。"
      : "输入应用名称开始检索";
    host.append(empty);
    return;
  }

  const workbench = document.createElement("div");
  workbench.className = "results-workbench";
  const id = `results-${++nextWorkbenchId}`;

  const listPanel = document.createElement("details");
  listPanel.className = "result-list-panel";
  const queueSummary = document.createElement("summary");
  queueSummary.className = "query-queue-summary";
  const currentQuery = document.createElement("strong");
  const queueCount = document.createElement("span");
  queueCount.textContent = `全部 ${results.length} 项`;
  queueSummary.append(currentQuery, queueCount);
  listPanel.append(queueSummary);

  const listHeader = document.createElement("div");
  listHeader.className = "panel-subhead";
  listHeader.textContent = `查询队列 · ${results.length} 项`;
  listPanel.append(listHeader);

  const list = document.createElement("div");
  list.className = "result-list";
  listPanel.append(list);
  const compactQueue = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 959px)") : null;
  const syncQueue = () => {
    listPanel.open = !compactQueue?.matches || list.contains(document.activeElement);
  };
  syncQueue();
  compactQueue?.addEventListener("change", syncQueue);
  renderCleanups.set(host, () => compactQueue?.removeEventListener("change", syncQueue));

  const inspectorPanel = document.createElement("section");
  inspectorPanel.className = "inspector-panel";
  const inspectorBody = document.createElement("div");
  inspectorBody.className = "inspector-body";
  inspectorPanel.append(inspectorBody);

  workbench.append(listPanel, inspectorPanel);
  host.append(workbench);

  const rows: HTMLButtonElement[] = [];
  let selectedIndex = results.findIndex((result) => result.status === "matched");
  if (selectedIndex === -1) {
    selectedIndex = results.findIndex((result) => result.status === "uncertain_match");
  }
  if (selectedIndex === -1) {
    selectedIndex = results.findIndex((result) => result.app !== null);
  }
  if (selectedIndex === -1) {
    selectedIndex = 0;
  }

  const candidatePages = results.map(() => 0);
  const candidateFilters = results.map(() => document.createElement("input"));
  let inspection: CandidateInspection | null = null;
  let selectionToken = 0;
  let view: CanvasView = "detail";

  function focusCandidate(key: string, preventScroll = true) {
    const control = Array.from(inspectorBody.querySelectorAll<HTMLButtonElement>('[data-role="candidate-inspect"]'))
      .find((button) => button.dataset.candidateKey === key && !button.closest("[hidden]"));
    control?.focus({ preventScroll });
    return control;
  }

  function setView(next: CanvasView, candidate?: string) {
    view = next;
    document.querySelectorAll('.screenshot-lightbox:not([hidden])').forEach((lightbox) => lightbox.dispatchEvent(new Event("lightbox-dispose")));
    inspectorBody.querySelectorAll<HTMLButtonElement>(".canvas-tab").forEach((tab) => {
      const selected = tab.dataset.role === `${view}-tab`;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    inspectorBody.querySelectorAll<HTMLElement>(".canvas-panel").forEach((panel) => {
      panel.hidden = panel.dataset.role !== `${view}-panel`;
    });
    if (candidate && focusCandidate(candidate, false)) return;
    inspectorBody.querySelector<HTMLButtonElement>(`[data-role="${view}-tab"]`)?.focus();
  }

  async function inspectCandidate(candidate: LookupCandidate) {
    const token = ++selectionToken;
    const resultIndex = selectedIndex;
    const key = candidateKey(candidate);
    const hasId = typeof candidate.appleId === "number" && Number.isSafeInteger(candidate.appleId) && candidate.appleId > 0;
    inspection = {
      app: { ...candidate, category: candidate.category ?? null, versionHistory: candidate.versionHistory ?? [], iapItems: [] },
      iapHints: null,
      state: hasId ? "loading" : "baseline",
    };
    view = "detail";
    renderInspector();
    inspectorBody.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')?.focus();
    if (!hasId) return;
    const isCurrent = () => token === selectionToken && resultIndex === selectedIndex
      && renderInstances.get(host) === instance && host.contains(workbench)
      && (!wasConnected || host.isConnected)
      && inspection !== null && candidateKey(inspection.app) === key;
    try {
      const detail = await getAppDetails(candidate.appleId!, country);
      if (!isCurrent()) return;
      if (detail.country !== country || detail.app.appleId !== candidate.appleId) {
        throw new Error("Candidate detail identity changed");
      }
      inspection = { app: detail.app, iapHints: detail.iapHints, state: "ready" };
    } catch {
      if (!isCurrent()) return;
      inspection!.state = "failed";
    }
    renderInspector();
  }

  function renderInspector() {
    const active = document.activeElement instanceof HTMLElement && inspectorBody.contains(document.activeElement)
      ? document.activeElement : null;
    const focusedFilter = active instanceof HTMLInputElement && active === candidateFilters[selectedIndex] && !active.closest("[hidden]")
      ? { control: active, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    const focused = active?.closest<HTMLButtonElement>('[data-role="candidate-inspect"]')?.dataset.candidateKey;
    const focusedRole = active?.matches('[role="tab"], .candidate-pagination button, [data-role="detail-retry"], [data-role="back-to-candidates"], [data-role="candidate-filter-clear"]') ? active.dataset.role : null;
    const focusedControl = active?.matches(".identifier-copy, .screenshot-trigger") ? active : null;
    const section = focusedControl?.closest<HTMLElement>(".info-list, .candidate-card, .screenshots-section");
    const focusIdentity = section && focusedControl ? {
      appKey: inspectorBody.querySelector<HTMLElement>(".inspector")?.dataset.appKey,
      section: section.matches(".candidate-card") ? ".candidate-card"
        : section.matches(".info-list") ? ".info-list" : ".screenshots-section",
      candidateKey: section.dataset.candidateKey,
      label: focusedControl.getAttribute("aria-label"),
      screenshotUrl: focusedControl.querySelector("img")?.getAttribute("src"),
    } : null;
    document.querySelectorAll(".screenshot-lightbox").forEach((lightbox) => {
      lightbox.dispatchEvent(new Event("lightbox-dispose"));
      lightbox.remove();
    });
    document.body?.classList.remove("is-lightbox-open");
    inspectorBody.replaceChildren(createInspector(
      results[selectedIndex], country, candidatePages[selectedIndex]!,
      (page, control) => {
        candidatePages[selectedIndex] = page;
        renderInspector();
        const target = inspectorBody.querySelector<HTMLButtonElement>(`[data-role="${control}"]`);
        (target?.disabled ? inspectorBody.querySelector<HTMLButtonElement>(`.candidate-pagination button:not(:disabled)`) : target)?.focus();
      },
      (candidate) => { void inspectCandidate(candidate); }, inspection, view, id, setView,
      candidateFilters[selectedIndex]!, () => { candidatePages[selectedIndex] = 0; },
    ));
    if (focusedFilter && !focusedFilter.control.closest("[hidden]")) {
      focusedFilter.control.focus({ preventScroll: true });
      focusedFilter.control.setSelectionRange(focusedFilter.start, focusedFilter.end, focusedFilter.direction ?? undefined);
    }
    if (focused) focusCandidate(focused);
    if (focusedRole) {
      const control = inspectorBody.querySelector<HTMLButtonElement>(`[data-role="${focusedRole}"]`);
      if (control && !control.disabled && !control.closest("[hidden]")) control.focus({ preventScroll: true });
    }
    if (focusIdentity && focusIdentity.appKey === inspectorBody.querySelector<HTMLElement>(".inspector")?.dataset.appKey) {
      const scope = Array.from(inspectorBody.querySelectorAll<HTMLElement>(focusIdentity.section))
        .find((element) => element.dataset.candidateKey === focusIdentity.candidateKey);
      Array.from(scope?.querySelectorAll<HTMLButtonElement>(".identifier-copy, .screenshot-trigger") ?? [])
        .find((control) => !control.closest("[hidden]") && control.getAttribute("aria-label") === focusIdentity.label
          && control.querySelector("img")?.getAttribute("src") === focusIdentity.screenshotUrl)
        ?.focus({ preventScroll: true });
    }
  }

  function setSelectedIndex(index: number) {
    selectionToken++;
    inspection = null;
    selectedIndex = index;
    const result = results[index]!;
    view = !result.app || (result.status !== "matched" && getCandidates(result).length > 0) ? "candidates" : "detail";
    currentQuery.textContent = `当前：${result.query}`;

    rows.forEach((row, rowIndex) => {
      const isActive = rowIndex === selectedIndex;
      row.classList.toggle("is-active", isActive);
      row.setAttribute("aria-pressed", String(isActive));
    });

    renderInspector();
  }

  for (const [index, result] of results.entries()) {
    const row = createResultRow(result);
    row.addEventListener("click", () => {
      setSelectedIndex(index);
      if (compactQueue?.matches) {
        listPanel.open = false;
        queueSummary.focus({ preventScroll: true });
      }
    });
    rows.push(row);
    list.append(row);
  }

  setSelectedIndex(selectedIndex);
}
