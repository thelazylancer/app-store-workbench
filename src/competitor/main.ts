import "../styles.css";
import "./competitor.css";
import {
  CompetitorApiError,
  getCompetitorDay,
  getCompetitorDays,
  getCompetitorPackage,
  getCompetitorPackageHistory,
  getCompetitorSummary,
} from "../lib/competitorApi";
import type {
  DateKind,
  DayDetail,
  DaySummary,
  GroupBy,
  PackageDetail,
  SnapshotEntry,
  SummaryCompetitor,
  SummaryGroup,
} from "../../shared/competitorTypes";
import {
  DATE_KIND_LABEL,
  addDays,
  formatDateTime,
  statusFilterLabel,
  yesterdayUtc,
  isDateString,
  type StatusFilter,
} from "./format";
import { competitorKey, renderSummary } from "./renderSummary";
import { renderPackageDetail } from "./renderPackageDetail";

type PageState = {
  date: string;
  dateKind: DateKind;
  groupBy: GroupBy;
  status: StatusFilter;
  view: "list" | "detail";
  competitor: string | null;
  packageCode: string | null;
};

type LoadResult = {
  day: DayDetail | null;
  dayMissing: boolean;
  dayError: string | null;
  summary: SummaryGroup[] | null;
  summaryError: string | null;
  days: DaySummary[];
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root");

const yesterday = yesterdayUtc();

function parseState(): PageState {
  const params = new URLSearchParams(window.location.search);
  const rawDate = params.get("date");
  const requestedDate = isDateString(rawDate) ? rawDate : yesterday;
  const date = requestedDate > yesterday ? yesterday : requestedDate;
  const rawKind = params.get("date_kind");
  const rawGroup = params.get("group_by");
  const rawStatus = params.get("status");
  return {
    date,
    dateKind: rawKind === "listing" ? "listing" : "first_ad",
    groupBy: rawGroup === "category" || rawGroup === "ios_version" ? rawGroup : "team",
    status: rawStatus === "hit" || rawStatus === "miss" ? rawStatus : "all",
    view: params.get("view") === "detail" ? "detail" : "list",
    competitor: params.get("competitor"),
    packageCode: params.get("package"),
  };
}

let state = parseState();
let loading = false;
let result: LoadResult = {
  day: null,
  dayMissing: false,
  dayError: null,
  summary: null,
  summaryError: null,
  days: [],
};
let requestToken = 0;
let detailToken = 0;
let detailLoading = false;
let detailError: string | null = null;
let detailPackage: PackageDetail | null = null;
let detailHistory: SnapshotEntry[] | null = null;
let detailHistoryError: string | null = null;
let recentNote: string | null = null;
const collapsedGroups = new Set<string>();

app.innerHTML = `
  <main class="app-shell app-shell-root">
    <section class="workspace-frame">
      <header class="workspace-header">
        <div class="workspace-title">
          <img class="workspace-logo" src="${import.meta.env.BASE_URL}brand/workbench-logo.png" alt="" width="36" height="36" decoding="async" />
          <span class="workspace-brand">App搜索工作台</span>
        </div>
        <nav class="workspace-tabs" aria-label="主导航">
          <a href="${import.meta.env.BASE_URL}index.html">App Store 搜索</a>
          <a href="${import.meta.env.BASE_URL}competitor.html" aria-current="page">竞品</a>
        </nav>
        <div class="workspace-badges">
          <span class="region-note">8 个区域自动抓取 · 不可筛选</span>
        </div>
      </header>

      <section class="report-surface" data-role="list-view">
        <div class="report-head">
          <div class="report-title-block">
            <h1>竞品日报</h1>
            <p class="report-date-line" data-role="date-line"></p>
          </div>
          <p class="batch-summary" data-role="batch-summary"></p>
        </div>
        <div data-role="batch-banner"></div>

        <section class="report-controls">
          <div class="control-row">
            <div class="control-cluster">
              <span class="control-label">日期</span>
              <div class="date-control">
                <button type="button" class="date-step" data-role="prev-date" aria-label="前一天">‹</button>
                <input type="date" class="date-input" data-role="date-input" aria-label="快照日期" />
                <button type="button" class="date-step" data-role="next-date" aria-label="后一天">›</button>
              </div>
              <button type="button" class="text-action" data-role="back-yesterday" hidden>回到昨天</button>
            </div>
            <div class="control-cluster">
              <span class="control-label">口径</span>
              <div class="filter-segment" role="group" aria-label="日期口径">
                <button type="button" class="filter-chip" data-role="date-kind" data-value="first_ad">投放日期</button>
                <button type="button" class="filter-chip" data-role="date-kind" data-value="listing">上架日期</button>
              </div>
            </div>
          </div>
          <div class="control-row">
            <div class="control-cluster">
              <span class="control-label">分组</span>
              <div class="filter-segment" role="group" aria-label="分组维度">
                <button type="button" class="filter-chip" data-role="group-by" data-value="team">团队</button>
                <button type="button" class="filter-chip" data-role="group-by" data-value="category">类目</button>
                <button type="button" class="filter-chip" data-role="group-by" data-value="ios_version">iOS 版本</button>
              </div>
            </div>
            <div class="control-cluster">
              <span class="control-label">状态</span>
              <div class="filter-segment" role="group" aria-label="命中状态">
                <button type="button" class="filter-chip" data-role="status" data-value="all">全部</button>
                <button type="button" class="filter-chip" data-role="status" data-value="hit">命中</button>
                <button type="button" class="filter-chip" data-role="status" data-value="miss">未命中</button>
              </div>
            </div>
          </div>
        </section>

        <div class="report-cards" data-role="cards"></div>
        <p class="filter-note" data-role="filter-note" hidden></p>
        <div class="report-body" data-role="report-body" aria-live="polite"></div>

        <footer class="report-footer">
          <p data-role="footer-kind">数据来源：内部首投包接口 + App Store 精确 Bundle ID 匹配；仅含 iOS 包，已排除灵蜂。</p>
          <p>版本历史为当日商品页可见快照，不是 App Store 全量历史。页面不提供国家筛选。</p>
        </footer>
      </section>

      <section class="report-surface detail-surface" data-role="detail-view" hidden></section>
    </section>
  </main>
`;

function requireElement<T extends Element>(selector: string): T {
  const element = app!.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const listView = requireElement<HTMLElement>('[data-role="list-view"]');
const detailView = requireElement<HTMLElement>('[data-role="detail-view"]');
const dateLine = requireElement<HTMLElement>('[data-role="date-line"]');
const batchSummary = requireElement<HTMLElement>('[data-role="batch-summary"]');
const batchBanner = requireElement<HTMLElement>('[data-role="batch-banner"]');
const dateInput = requireElement<HTMLInputElement>('[data-role="date-input"]');
const nextDate = requireElement<HTMLButtonElement>('[data-role="next-date"]');
const backYesterday = requireElement<HTMLButtonElement>('[data-role="back-yesterday"]');
const cardsHost = requireElement<HTMLElement>('[data-role="cards"]');
const filterNote = requireElement<HTMLElement>('[data-role="filter-note"]');
const reportBody = requireElement<HTMLElement>('[data-role="report-body"]');
const footerKind = requireElement<HTMLElement>('[data-role="footer-kind"]');
const detailHost = detailView;

function stateToUrl(): string {
  const params = new URLSearchParams();
  params.set("date", state.date);
  params.set("date_kind", state.dateKind);
  params.set("group_by", state.groupBy);
  params.set("status", state.status);
  if (state.view === "detail") {
    params.set("view", "detail");
    if (state.competitor) params.set("competitor", state.competitor);
    if (state.packageCode) params.set("package", state.packageCode);
  }
  return `${window.location.pathname}?${params.toString()}`;
}

function commit(mode: "push" | "replace"): void {
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", stateToUrl());
}

function countStatuses(): { total: number; hit: number; miss: number } {
  const packages = result.day?.packages ?? [];
  return {
    total: packages.length,
    hit: packages.filter((pkg) => pkg.lookupStatus === "hit").length,
    miss: packages.filter((pkg) => pkg.lookupStatus === "bundle_not_found").length,
  };
}

function syncControls(): void {
  const counts = countStatuses();
  const hasData = !loading && Boolean(result.day);
  dateInput.value = state.date;
  dateInput.max = yesterday;
  nextDate.disabled = state.date >= yesterday;
  backYesterday.hidden = state.date === yesterday;
  dateLine.textContent = `${state.date}${state.date === yesterday ? "（昨日）" : ""} · UTC 目标日期 · ${DATE_KIND_LABEL[state.dateKind]}口径`;
  footerKind.textContent = `数据来源：内部首投包接口 + App Store 精确 Bundle ID 匹配；仅含 iOS 包，已排除灵蜂。当前口径：${DATE_KIND_LABEL[state.dateKind]}。`;

  app!.querySelectorAll<HTMLButtonElement>('[data-role="date-kind"]').forEach((button) => {
    const active = button.dataset.value === state.dateKind;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  app!.querySelectorAll<HTMLButtonElement>('[data-role="group-by"]').forEach((button) => {
    const active = button.dataset.value === state.groupBy;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  app!.querySelectorAll<HTMLButtonElement>('[data-role="status"]').forEach((button) => {
    const value = button.dataset.value as StatusFilter;
    const active = value === state.status;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    const label = statusFilterLabel(value);
    const count = value === "all" ? counts.total : value === "hit" ? counts.hit : counts.miss;
    button.textContent = hasData ? `${label} ${count}` : label;
  });
  filterNote.hidden = state.status === "all" || !hasData;
  if (!filterNote.hidden) {
    filterNote.textContent = `当前为筛选结果 · 仅看${statusFilterLabel(state.status)} · ${
      state.status === "hit" ? counts.hit : counts.miss
    } 包 / 当日共 ${counts.total} 包`;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "text-action";
    clear.dataset.role = "empty-clear-filter";
    clear.textContent = "清除筛选";
    filterNote.append(clear);
  }
}

function renderCards(): void {
  cardsHost.replaceChildren();
  cardsHost.hidden = false;
  const counts = countStatuses();
  const competitors = result.summary
    ? result.summary.reduce(
      (sum, group) => sum + group.competitors.length + group.missedPackages.length,
      0,
    )
    : counts.total;
  const pct = (value: number) => counts.total > 0 ? `${((value / counts.total) * 100).toFixed(1)}%` : "—";

  const card = (value: string | number, label: string, variant: string, extra?: HTMLElement | string) => {
    const article = document.createElement("article");
    article.className = `report-card ${variant}`;
    const strong = document.createElement("strong");
    strong.className = "report-card-value";
    strong.textContent = String(value);
    const caption = document.createElement("span");
    caption.className = "report-card-label";
    caption.textContent = label;
    article.append(strong, caption);
    if (extra) {
      if (typeof extra === "string") {
        const note = document.createElement("span");
        note.className = "report-card-note";
        note.textContent = extra;
        article.append(note);
      } else {
        article.append(extra);
      }
    }
    return article;
  };

  const ratio = (text: string, variant: string) => {
    const pill = document.createElement("span");
    pill.className = `ratio-pill ${variant}`;
    pill.textContent = text;
    return pill;
  };

  cardsHost.append(
    card(counts.total, "包总数", "card-total"),
    card(competitors, "竞品数", "card-total", "含未命中包"),
    card(counts.hit, "命中", "card-hit", ratio(pct(counts.hit), "ratio-hit")),
    card(counts.miss, "未命中", "card-miss", ratio(pct(counts.miss), "ratio-miss")),
  );
}

function renderBatch(): void {
  batchSummary.replaceChildren();
  batchBanner.replaceChildren();
  const batch = result.day?.batch;
  if (!batch) return;

  const abnormal = !batch.rangeComplete || batch.stale || batch.status !== "ok";
  if (!abnormal) {
    const dot = document.createElement("span");
    dot.className = "batch-dot";
    dot.setAttribute("aria-hidden", "true");
    batchSummary.append(dot, `批次正常 · 更新于 ${formatDateTime(batch.fetchedAt)} · 范围完整`);
    return;
  }

  const messages: string[] = [];
  if (!batch.rangeComplete) messages.push("本日源数据可能缺少部分包，计数仅供参考。");
  if (batch.stale) messages.push("该批次已被标记为过期，详情可能不是最新。");
  if (batch.status === "failed") messages.push("批次同步失败，数据可能不完整。");

  const banner = document.createElement("p");
  banner.className = `batch-banner${batch.status === "failed" ? " is-danger" : ""}`;
  banner.dataset.role = "batch-banner";
  banner.textContent = messages.join("；") || "该批次数据可能不完整。";
  batchBanner.append(banner);
}

function createEmptyCard(options: {
  role: string;
  title: string;
  lines: string[];
  inline?: boolean;
  actions?: Array<{ label: string; role: string }>;
}): HTMLElement {
  const card = document.createElement("section");
  card.className = options.inline ? "empty-card is-inline" : "empty-card";
  card.dataset.role = options.role;
  if (!options.inline) {
    const mark = document.createElement("div");
    mark.className = "empty-state-mark";
    card.append(mark);
  }
  const heading = document.createElement("h2");
  heading.textContent = options.title;
  card.append(heading);
  for (const line of options.lines) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    card.append(paragraph);
  }
  if (options.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "empty-card-actions";
    for (const action of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.dataset.role = action.role;
      button.textContent = action.label;
      actions.append(button);
    }
    card.append(actions);
  }
  return card;
}

function renderError(title: string, message: string, role = "error"): HTMLElement {
  const card = document.createElement("section");
  card.className = "report-error";
  card.dataset.role = role;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const reason = document.createElement("p");
  reason.textContent = `无法获取 ${state.date} 的竞品快照`;
  const detail = document.createElement("p");
  detail.className = "report-error-reason";
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "secondary-button";
  retry.dataset.role = "retry-load";
  retry.textContent = "重试";
  card.append(heading, reason, detail, retry);
  if (state.date !== yesterday) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary-button";
    back.dataset.role = "empty-back-yesterday";
    back.textContent = "回到昨天";
    card.append(back);
  }
  return card;
}

function renderSkeleton(): void {
  cardsHost.hidden = false;
  cardsHost.replaceChildren();
  for (let index = 0; index < 4; index += 1) {
    const card = document.createElement("div");
    card.className = "report-card skeleton-card";
    cardsHost.append(card);
  }
  reportBody.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "report-skeleton";
  wrapper.dataset.role = "loading";
  const label = document.createElement("p");
  label.className = "skeleton-label";
  label.textContent = `正在加载 ${state.date}…`;
  wrapper.append(label);
  for (let index = 0; index < 3; index += 1) {
    const head = document.createElement("div");
    head.className = "skeleton-block skeleton-group-head";
    const row = document.createElement("div");
    row.className = "skeleton-block skeleton-group-row";
    wrapper.append(head, row, row.cloneNode(true), row.cloneNode(true));
  }
  reportBody.append(wrapper);
}

function renderListContent(): void {
  syncControls();
  listView.hidden = state.view === "detail";
  detailView.hidden = state.view !== "detail";

  if (loading) {
    batchSummary.replaceChildren("正在加载…");
    batchBanner.replaceChildren();
    renderSkeleton();
    return;
  }

  if (result.dayMissing) {
    cardsHost.replaceChildren();
    cardsHost.hidden = true;
    batchSummary.replaceChildren();
    batchBanner.replaceChildren();
    reportBody.replaceChildren(createEmptyCard({
      role: "empty-day",
      title: "这一天还没有快照",
      lines: [
        "每日任务在北京时间 09:30 抓取前一天的数据。",
        `${state.date} 没有成功完成的批次，可能是任务未运行或数据尚未就绪。`,
        ...(recentNote ? [recentNote] : []),
      ],
      actions: [
        ...(state.date !== yesterday ? [{ label: "回到昨天", role: "empty-back-yesterday" }] : []),
        { label: "查看最近有数据的日期", role: "recent-date" },
      ],
    }));
    return;
  }

  if (result.dayError) {
    cardsHost.replaceChildren();
    cardsHost.hidden = true;
    batchSummary.replaceChildren();
    batchBanner.replaceChildren();
    reportBody.replaceChildren(renderError("报告加载失败", result.dayError));
    return;
  }

  if (!result.day) return;
  renderCards();
  renderBatch();

  if (result.summaryError) {
    reportBody.replaceChildren(renderError("分组数据加载失败", result.summaryError, "summary-error"));
    return;
  }

  if (!result.summary || result.summary.length === 0 || result.day.packages.length === 0) {
    reportBody.replaceChildren(createEmptyCard({
      role: "empty-packages",
      title: "当天没有符合条件的 iOS 竞品包",
      lines: [
        `已按当前口径（${DATE_KIND_LABEL[state.dateKind]} = ${state.date}）查询，并应用：`,
        "· 仅保留 display_name 包含 ios 的记录",
        "· 已排除 team = 灵蜂",
      ],
      actions: [
        {
          label: state.dateKind === "first_ad" ? "切到上架日期口径" : "切到投放日期口径",
          role: "empty-switch-kind",
        },
        { label: "查看前一天", role: "empty-prev-date" },
      ],
    }));
    return;
  }

  const counts = countStatuses();
  const filtered = state.status === "all"
    ? counts.total
    : state.status === "hit"
      ? counts.hit
      : counts.miss;
  if (filtered === 0) {
    reportBody.replaceChildren(createEmptyCard({
      role: "empty-filter",
      title: "当前筛选下没有包",
      lines: [
        state.status === "miss"
          ? `当日 ${counts.total} 个包全部命中了 App Store。`
          : `当日 ${counts.total} 个包均未命中 App Store。`,
      ],
      inline: true,
      actions: [{ label: "清除筛选", role: "empty-clear-filter" }],
    }));
    return;
  }

  reportBody.classList.remove("is-loading");
  renderSummary(reportBody, {
    groups: result.summary,
    packages: new Map(result.day.packages.map((pkg) => [pkg.packageCode, pkg])),
    date: state.date,
    dateKind: state.dateKind,
    groupBy: state.groupBy,
    status: state.status,
    collapsedGroups,
    buildDetailHref: (key, packageCode) => {
      const params = new URLSearchParams({
        date: state.date,
        date_kind: state.dateKind,
        group_by: state.groupBy,
        status: state.status,
        view: "detail",
        competitor: key,
        package: packageCode,
      });
      return `${window.location.pathname}?${params.toString()}`;
    },
  });
}

function findDetailContext(key: string): {
  competitor: SummaryCompetitor;
  groupName: string;
} | null {
  for (const group of result.summary ?? []) {
    const match = group.competitors.find((item) => competitorKey(item) === key);
    if (match) return { competitor: match, groupName: group.groupKey };
    if (key.startsWith("pkg:")) {
      const code = key.slice(4);
      const missed = group.missedPackages.find((item) => item.packageCode === code);
      if (missed) {
        return {
          groupName: group.groupKey,
          competitor: {
            appleId: null,
            name: missed.displayName,
            packageCount: 1,
            packages: [missed],
          },
        };
      }
    }
  }
  return null;
}

function pickPackageCode(competitor: SummaryCompetitor): string {
  if (state.packageCode && competitor.packages.some((pkg) => pkg.packageCode === state.packageCode)) {
    return state.packageCode;
  }
  const statuses = new Map((result.day?.packages ?? []).map((pkg) => [pkg.packageCode, pkg.lookupStatus]));
  return competitor.packages.find((pkg) => statuses.get(pkg.packageCode) === "hit")?.packageCode
    ?? competitor.packages[0]?.packageCode
    ?? "";
}

function historyDates(): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(state.date, -index));
}

function renderDetailView(): void {
  detailView.hidden = state.view !== "detail";
  listView.hidden = state.view === "detail";
  if (state.view !== "detail") {
    detailView.replaceChildren();
    return;
  }

  const key = state.competitor;
  const context = key ? findDetailContext(key) : null;
  if (!context) {
    const waitingForList = loading || (!result.dayMissing && !result.dayError && !result.summaryError && !result.summary);
    renderPackageDetail(detailHost, {
      competitor: { appleId: null, name: "", packageCount: 0, packages: [] },
      packageCode: state.packageCode ?? "",
      packageDetail: null,
      date: state.date,
      dateKind: state.dateKind,
      groupName: "",
      loading: waitingForList,
      error: waitingForList ? null : result.dayMissing ? "该日期没有快照" : "未找到该竞品在当前分组中的数据",
      history: null,
      historyError: null,
      historyDates: historyDates(),
      packageStatus: new Map(),
      onSelectPackage: () => undefined,
      onRetry: () => { void load(); },
      onBack: backToList,
    });
    return;
  }

  const packageCode = state.packageCode ?? pickPackageCode(context.competitor);
  const packageStatus = new Map((result.day?.packages ?? []).map((pkg) => [pkg.packageCode, pkg.lookupStatus]));
  renderPackageDetail(detailHost, {
    competitor: context.competitor,
    packageCode,
    packageDetail: detailPackage,
    date: state.date,
    dateKind: state.dateKind,
    groupName: context.groupName,
    loading: detailLoading,
    error: detailError,
    history: detailHistory,
    historyError: detailHistoryError,
    historyDates: historyDates(),
    packageStatus,
    onSelectPackage: selectPackage,
    onRetry: () => { void loadDetail(packageCode); },
    onBack: backToList,
  });
}

async function loadDetail(packageCode: string): Promise<void> {
  const token = ++detailToken;
  detailLoading = true;
  detailError = null;
  detailPackage = null;
  detailHistory = null;
  detailHistoryError = null;
  renderDetailView();

  const dates = historyDates();
  const from = dates[dates.length - 1] ?? state.date;
  const [pkgResult, historyResult] = await Promise.allSettled([
    getCompetitorPackage(packageCode),
    getCompetitorPackageHistory(packageCode, from, state.date),
  ]);
  if (token !== detailToken) return;

  detailLoading = false;
  if (pkgResult.status === "fulfilled") {
    detailPackage = pkgResult.value;
  } else {
    detailError = pkgResult.reason instanceof CompetitorApiError
      ? pkgResult.reason.message
      : "详情请求失败";
  }
  if (historyResult.status === "fulfilled") {
    detailHistory = historyResult.value;
  } else {
    detailHistoryError = historyResult.reason instanceof CompetitorApiError
      ? historyResult.reason.message
      : "请求失败";
  }
  renderDetailView();
}

function openDetail(key: string, packageCode: string): void {
  state.view = "detail";
  state.competitor = key;
  state.packageCode = packageCode || null;
  commit("push");
  detailPackage = null;
  detailHistory = null;
  detailHistoryError = null;
  renderListContent();
  void loadDetail(packageCode);
}

function selectPackage(packageCode: string): void {
  state.packageCode = packageCode;
  commit("replace");
  void loadDetail(packageCode);
}

function backToList(): void {
  state.view = "list";
  state.competitor = null;
  state.packageCode = null;
  detailToken += 1;
  commit("push");
  renderListContent();
  renderDetailView();
  const heading = listView.querySelector("h1");
  heading?.focus?.();
}

async function load(): Promise<void> {
  const token = ++requestToken;
  loading = true;
  recentNote = null;
  detailPackage = null;
  detailHistory = null;
  detailHistoryError = null;
  detailError = null;
  result = {
    day: null,
    dayMissing: false,
    dayError: null,
    summary: null,
    summaryError: null,
    days: result.days,
  };
  renderListContent();
  renderDetailView();

  const [dayResult, summaryResult, daysResult] = await Promise.allSettled([
    getCompetitorDay(state.date, state.dateKind),
    getCompetitorSummary(state.date, state.dateKind, state.groupBy),
    getCompetitorDays(addDays(state.date, -6), state.date),
  ]);
  if (token !== requestToken) return;

  loading = false;
  if (dayResult.status === "fulfilled") {
    result.day = dayResult.value;
  } else if (dayResult.reason instanceof CompetitorApiError && dayResult.reason.status === 404) {
    result.dayMissing = true;
  } else {
    result.dayError = dayResult.reason instanceof CompetitorApiError
      ? dayResult.reason.message
      : "请求失败";
  }
  if (summaryResult.status === "fulfilled") {
    result.summary = summaryResult.value;
  } else {
    result.summaryError = summaryResult.reason instanceof CompetitorApiError
      ? summaryResult.reason.message
      : "请求失败";
  }
  if (daysResult.status === "fulfilled") {
    result.days = daysResult.value;
  }

  renderListContent();
  renderDetailView();
  if (state.view === "detail" && state.competitor) {
    const context = findDetailContext(state.competitor);
    const packageCode = state.packageCode ?? (context ? pickPackageCode(context.competitor) : "");
    if (packageCode) {
      if (state.packageCode !== packageCode) {
        state.packageCode = packageCode;
        commit("replace");
      }
      void loadDetail(packageCode);
    }
  }
}

function setDate(date: string): void {
  if (date > yesterday || !isDateString(date)) return;
  state.date = date;
  state.view = "list";
  state.competitor = null;
  state.packageCode = null;
  commit("replace");
  void load();
}

function setDateKind(dateKind: DateKind): void {
  state.dateKind = dateKind;
  commit("replace");
  void load();
}

function setGroupBy(groupBy: GroupBy): void {
  if (state.groupBy === groupBy) return;
  state.groupBy = groupBy;
  collapsedGroups.clear();
  commit("replace");
  void load();
}

function setStatus(status: StatusFilter): void {
  state.status = status;
  commit("replace");
  renderListContent();
}

async function findRecentDate(): Promise<void> {
  recentNote = null;
  try {
    const days = await getCompetitorDays(addDays(state.date, -30), state.date);
    const withBatch = days.filter((day) => day.batchStatus !== null || day.packageCount > 0);
    if (withBatch.length === 0) {
      recentNote = "近 30 天也没有其他有数据的日期。";
      renderListContent();
      return;
    }
    const latest = [...withBatch].sort((a, b) => b.date.localeCompare(a.date))[0]!;
    setDate(latest.date);
  } catch {
    recentNote = "最近日期查询失败，请稍后重试。";
    renderListContent();
  }
}

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const control = target.closest<HTMLElement>("[data-role]");
  if (!control) return;

  switch (control.dataset.role) {
    case "prev-date":
      setDate(addDays(state.date, -1));
      break;
    case "next-date":
      if (state.date < yesterday) setDate(addDays(state.date, 1));
      break;
    case "back-yesterday":
      setDate(yesterday);
      break;
    case "date-kind":
      setDateKind(control.dataset.value as DateKind);
      break;
    case "group-by":
      setGroupBy(control.dataset.value as GroupBy);
      break;
    case "status":
      setStatus(control.dataset.value as StatusFilter);
      break;
    case "timeline-date":
      if (control.dataset.date) setDate(control.dataset.date);
      break;
    case "group-toggle": {
      event.preventDefault();
      const group = control.dataset.group ?? "";
      if (collapsedGroups.has(group)) collapsedGroups.delete(group);
      else collapsedGroups.add(group);
      renderListContent();
      Array.from(reportBody.querySelectorAll<HTMLElement>('[data-role="group-toggle"]'))
        .find((element) => element.dataset.group === group)
        ?.focus();
      break;
    }
    case "expand-all":
      collapsedGroups.clear();
      renderListContent();
      break;
    case "collapse-all":
      for (const group of result.summary ?? []) collapsedGroups.add(group.groupKey);
      renderListContent();
      break;
    case "competitor-row":
    case "missed-row":
      event.preventDefault();
      openDetail(control.dataset.competitor ?? "", control.dataset.package ?? "");
      break;
    case "retry-load":
      void load();
      break;
    case "empty-back-yesterday":
      setDate(yesterday);
      break;
    case "empty-prev-date":
      setDate(addDays(state.date, -1));
      break;
    case "empty-switch-kind":
      setDateKind(state.dateKind === "first_ad" ? "listing" : "first_ad");
      break;
    case "empty-clear-filter":
      setStatus("all");
      break;
    case "recent-date":
      void findRecentDate();
      break;
    case "detail-back":
      backToList();
      break;
    case "detail-retry":
      if (state.packageCode) void loadDetail(state.packageCode);
      break;
  }
});

dateInput.addEventListener("change", () => {
  if (dateInput.value) setDate(dateInput.value);
  dateInput.value = state.date;
});

window.addEventListener("popstate", () => {
  const next = parseState();
  const needsLoad = next.date !== state.date
    || next.dateKind !== state.dateKind
    || next.groupBy !== state.groupBy;
  state = next;
  if (needsLoad) {
    void load();
  } else {
    renderListContent();
    renderDetailView();
    if (state.view === "detail" && state.competitor) {
      const context = findDetailContext(state.competitor);
      const packageCode = state.packageCode ?? (context ? pickPackageCode(context.competitor) : "");
      if (packageCode) void loadDetail(packageCode);
    }
  }
});

syncControls();
renderListContent();
void load();
