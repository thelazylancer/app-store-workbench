import type {
  AlternateApp,
  AppVersionHistoryItem,
  IapHintState,
  IapItem,
  SearchResult,
} from "../../shared/types";

const MAX_VISIBLE_VERSION_HISTORY = 5;

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
    default:
      return message;
  }
}

function createStatusBadge(status: SearchResult["status"]) {
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
      badge.textContent = "未找到";
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
) {
  const card = document.createElement("article");
  card.className = `candidate-card${current ? " is-current" : ""}`;

  const header = document.createElement("div");
  header.className = "candidate-card-header";

  const eyebrow = document.createElement("span");
  eyebrow.className = "candidate-card-tag";
  eyebrow.textContent = label;
  header.append(eyebrow);

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
  appleId.append(
    "Apple ID：",
    createIdentifier("Apple ID", typeof app.appleId === "number" ? String(app.appleId) : undefined),
  );
  copy.append(appleId);

  const bundleId = document.createElement("div");
  bundleId.className = "candidate-card-bundle-id";
  bundleId.append("Bundle ID：", createIdentifier("Bundle ID", app.bundleId));
  copy.append(bundleId);

  const meta = document.createElement("span");
  meta.textContent = `${app.category ?? "类目未知"} · ${app.screenshotUrls.length} 张搜索图`;
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

  const action = document.createElement("a");
  action.href = app.appStoreUrl;
  action.target = "_blank";
  action.rel = "noreferrer";
  action.className = "candidate-card-link";
  action.textContent = "打开候选";
  footer.append(action);
  card.append(footer);

  return card;
}

function createInspector(result: SearchResult) {
  const inspector = document.createElement("div");
  inspector.className = "inspector";

  const top = document.createElement("div");
  top.className = "inspector-top";

  const meta = document.createElement("div");
  meta.className = "inspector-meta";

  const query = document.createElement("p");
  query.className = "query-label";
  query.textContent = `搜索词：${result.query}`;
  meta.append(query);

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

    if (result.iapHints) {
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
  top.append(createStatusBadge(result.status));
  inspector.append(top);

  if (!result.app) {
    const message = document.createElement("p");
    message.className = "result-message";
    message.textContent = translateMessage(result.message) ?? "暂无可展示详情。";
    inspector.append(message);
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

  const storeLink = document.createElement("a");
  storeLink.href = result.app.appStoreUrl;
  storeLink.target = "_blank";
  storeLink.rel = "noreferrer";
  storeLink.className = "primary-link";
  storeLink.textContent = "打开商店页";
  links.append(storeLink);

  const appleId = result.app.appleId;
  if (typeof appleId === "number" && Number.isSafeInteger(appleId) && appleId > 0) {
    const qimaiLink = document.createElement("a");
    qimaiLink.href = `https://www.qimai.cn/app/baseinfo/appid/${appleId}/country/us`;
    qimaiLink.target = "_blank";
    qimaiLink.rel = "noreferrer";
    qimaiLink.className = "secondary-link qimai-link";
    qimaiLink.textContent = "打开 Qimai";
    links.append(qimaiLink);
  }

  const rawLink = document.createElement("a");
  rawLink.href = result.app.appStoreUrl;
  rawLink.target = "_blank";
  rawLink.rel = "noreferrer";
  rawLink.className = "secondary-link";
  rawLink.textContent = result.app.appStoreUrl.replace("?uo=4", "");
  links.append(rawLink);

  overviewSection.append(links);

  if (result.status === "uncertain_match" && result.alternates.length > 0) {
    const alternates = document.createElement("section");
    alternates.className = "alternates compare-section";

    const label = document.createElement("p");
    label.className = "alternates-label";
    label.textContent = "候选对比";
    alternates.append(label);

    const note = document.createElement("p");
    note.className = "alternates-note";
    note.textContent = "名称相近的结果集中展示，优先核对 Apple ID、Bundle ID、开发者和截图。";
    alternates.append(note);

    const candidateGrid = document.createElement("div");
    candidateGrid.className = "candidate-grid";
    candidateGrid.append(
      createCandidateCard(result.app, "当前命中", true),
    );

    const alternateList = document.createElement("div");
    alternateList.className = "alternate-list";

    const alternateListHeader = document.createElement("div");
    alternateListHeader.className = "alternate-list-header";

    const alternateListTitle = document.createElement("strong");
    alternateListTitle.textContent = `${result.alternates.length} 个备选`;
    alternateListHeader.append(alternateListTitle);

    const alternateListHint = document.createElement("span");
    alternateListHint.textContent = "用于确认匹配";
    alternateListHeader.append(alternateListHint);
    alternateList.append(alternateListHeader);

    const alternateItems = document.createElement("div");
    alternateItems.className = "alternate-list-items";

    for (const [index, alternate] of result.alternates.entries()) {
      alternateItems.append(createCandidateCard(alternate, "备选项", false, index + 1));
    }

    alternateList.append(alternateItems);
    candidateGrid.append(alternateList);
    alternates.append(candidateGrid);

    inspector.append(alternates);
  }

  if (result.message) {
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
  hints.textContent = result.iapHints
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
  inspector.append(detailGrid);

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
    empty.textContent = "未从商店渲染页提取到截图。";
    screenshotsSection.append(empty);
  }

  inspector.append(screenshotsSection);

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
  title.textContent = result.app ? result.app.name : result.query;
  copy.append(title);

  const sub = document.createElement("span");
  sub.className = "result-row-subtitle";
  sub.textContent = result.app
    ? result.app.developer
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

  identity.append(copy);
  row.append(identity);
  row.append(createStatusBadge(result.status));

  return row;
}

export function renderResults(
  host: HTMLElement,
  results: SearchResult[],
  hasSearched = true,
) {
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

  const listPanel = document.createElement("section");
  listPanel.className = "result-list-panel";

  const listHeader = document.createElement("div");
  listHeader.className = "panel-subhead";
  listHeader.textContent = "结果列表";
  listPanel.append(listHeader);

  const list = document.createElement("div");
  list.className = "result-list";
  listPanel.append(list);

  const inspectorPanel = document.createElement("section");
  inspectorPanel.className = "inspector-panel";

  const inspectorHeader = document.createElement("div");
  inspectorHeader.className = "panel-subhead";
  inspectorHeader.textContent = "详情";
  inspectorPanel.append(inspectorHeader);

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

  function setSelectedIndex(index: number) {
    selectedIndex = index;

    rows.forEach((row, rowIndex) => {
      const isActive = rowIndex === selectedIndex;
      row.classList.toggle("is-active", isActive);
      row.setAttribute("aria-pressed", String(isActive));
    });

    inspectorBody.replaceChildren(createInspector(results[selectedIndex]));
  }

  for (const [index, result] of results.entries()) {
    const row = createResultRow(result);
    row.addEventListener("click", () => {
      setSelectedIndex(index);
    });
    rows.push(row);
    list.append(row);
  }

  setSelectedIndex(selectedIndex);
}
