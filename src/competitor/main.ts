import "../styles.css";
import "./competitor.css";
import {
  CompetitorApiError,
  getCompetitorDay,
  getCompetitorDays,
  getCompetitorPackage,
  getCompetitorPackageHistory,
  getCompetitorSummary,
  getCompetitorSummaryRange,
} from "../lib/competitorApi";
import type {
  DateKind,
  DayDetail,
  DaySummary,
  GroupBy,
  LookupStatus,
  PackageBrief,
  PackageDetail,
  SnapshotEntry,
  SummaryCompetitor,
  SummaryGroup,
} from "../../shared/competitorTypes";
import {
  DATE_KIND_LABEL,
  addDays,
  daySpan,
  formatDateTime,
  formatMonthDay,
  isDateString,
  statusFilterLabel,
  weekdayLabel,
  yesterdayUtc,
  type StatusFilter,
} from "./format";
import {
  competitorKey,
  packageCompetitorKey,
  renderSummary,
  type ExceptionEntry,
} from "./renderSummary";
import { renderPackageDetail } from "./renderPackageDetail";

type PageState = {
  date: string;
  rangeFrom: string | null;
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

const MAX_RANGE_DAYS = 31;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root");

const yesterday = yesterdayUtc();

function parseStatus(value: string | null): StatusFilter {
  if (value === "hit") return "hit";
  if (value === "exception" || value === "miss") return "exception";
  return "all";
}

function parseState(): PageState {
  const params = new URLSearchParams(window.location.search);
  const rawDate = params.get("date");
  const requestedDate = isDateString(rawDate) ? rawDate : yesterday;
  const date = requestedDate > yesterday ? yesterday : requestedDate;
  const rawKind = params.get("date_kind");
  const rawGroup = params.get("group_by");
  const rawFrom = params.get("from");
  const rangeFrom = isDateString(rawFrom)
    && rawFrom <= date
    && daySpan(rawFrom, date) <= MAX_RANGE_DAYS
    ? rawFrom
    : null;
  return {
    date,
    rangeFrom,
    dateKind: rawKind === "listing" ? "listing" : "first_ad",
    groupBy: rawGroup === "category" || rawGroup === "ios_version" ? rawGroup : "team",
    status: parseStatus(params.get("status")),
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
let rangeNote: string | null = null;
const collapsedGroups = new Set<string>();

app.innerHTML = `
  <main class="wx-shell">
    <header class="wx-top">
      <div class="wx-brand">
        <img src="${import.meta.env.BASE_URL}brand/workbench-logo.png" alt="" width="28" height="28" decoding="async" />
        <span>App搜索工作台</span>
      </div>
      <nav class="wx-tabs" aria-label="主导航">
        <a href="${import.meta.env.BASE_URL}index.html">App Store 搜索</a>
        <a href="${import.meta.env.BASE_URL}competitor.html" aria-current="page">竞品</a>
      </nav>
      <span class="wx-region">8 个区域自动抓取 · 不可筛选</span>
    </header>

    <section class="wx-report" data-role="list-view">
      <div class="wx-head">
        <div class="wx-title">
          <h1>竞品日报</h1>
          <span class="wx-date" data-role="date-big">${state.date}</span>
          <span class="wx-tag" data-role="date-tag">昨日</span>
        </div>
        <div class="wx-controls">
          <div class="wx-control">
            <span class="wx-label">日期</span>
            <div class="wx-stepper">
              <button type="button" data-role="prev-date" aria-label="前一天">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 4L6 8l4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/></svg>
              </button>
              <input type="date" data-role="date-input" aria-label="快照日期" />
              <button type="button" data-role="next-date" aria-label="后一天">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/></svg>
              </button>
            </div>
            <button type="button" class="wx-text-action" data-role="back-yesterday" hidden>回到昨天</button>
          </div>
          <div class="wx-control">
            <span class="wx-label">口径</span>
            <div class="wx-seg" role="group" aria-label="日期口径">
              <button type="button" data-role="date-kind" data-value="first_ad">投放日期</button>
              <button type="button" data-role="date-kind" data-value="listing">上架日期</button>
            </div>
          </div>
          <div class="wx-control">
            <span class="wx-label">分组</span>
            <div class="wx-seg" role="group" aria-label="分组维度">
              <button type="button" data-role="group-by" data-value="team">团队</button>
              <button type="button" data-role="group-by" data-value="category">类目</button>
              <button type="button" data-role="group-by" data-value="ios_version">iOS 版本</button>
            </div>
          </div>
          <div class="wx-control">
            <span class="wx-label">状态</span>
            <div class="wx-seg" role="group" aria-label="命中状态">
              <button type="button" data-role="status" data-value="all">全部</button>
              <button type="button" data-role="status" data-value="hit">命中</button>
              <button type="button" data-role="status" data-value="exception">异常</button>
            </div>
          </div>
        </div>
      </div>

      <p class="wx-subline" data-role="date-line"></p>
      <div data-role="batch-banner"></div>

      <section class="wx-forecast" data-role="forecast" aria-label="近 7 天预报"></section>
      <p class="wx-range-note" data-role="range-note" aria-live="polite" hidden></p>
      <p class="wx-filter-note" data-role="filter-note" hidden></p>

      <div class="wx-body" data-role="report-body" aria-live="polite"></div>

      <footer class="wx-foot">
        <p data-role="batch-summary"></p>
        <p data-role="footer-kind">数据来源：内部首投包接口 + App Store 精确 Bundle ID 匹配；仅含 iOS 包，已排除灵蜂。</p>
        <p>版本历史为当日商品页可见快照，不是 App Store 全量历史。页面不提供国家筛选。</p>
      </footer>
    </section>

    <section class="wx-detail" data-role="detail-view" hidden></section>
  </main>
`;

function requireElement<T extends Element>(selector: string): T {
  const element = app!.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const listView = requireElement<HTMLElement>('[data-role="list-view"]');
const detailView = requireElement<HTMLElement>('[data-role="detail-view"]');
const dateBig = requireElement<HTMLElement>('[data-role="date-big"]');
const dateTag = requireElement<HTMLElement>('[data-role="date-tag"]');
const dateLine = requireElement<HTMLElement>('[data-role="date-line"]');
const batchSummary = requireElement<HTMLElement>('[data-role="batch-summary"]');
const batchBanner = requireElement<HTMLElement>('[data-role="batch-banner"]');
const dateInput = requireElement<HTMLInputElement>('[data-role="date-input"]');
const nextDate = requireElement<HTMLButtonElement>('[data-role="next-date"]');
const backYesterday = requireElement<HTMLButtonElement>('[data-role="back-yesterday"]');
const forecastHost = requireElement<HTMLElement>('[data-role="forecast"]');
const rangeNoteHost = requireElement<HTMLElement>('[data-role="range-note"]');
const filterNote = requireElement<HTMLElement>('[data-role="filter-note"]');
const reportBody = requireElement<HTMLElement>('[data-role="report-body"]');
const footerKind = requireElement<HTMLElement>('[data-role="footer-kind"]');
const detailHost = detailView;

function urlStateParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set("date", state.date);
  if (state.rangeFrom) params.set("from", state.rangeFrom);
  params.set("date_kind", state.dateKind);
  params.set("group_by", state.groupBy);
  params.set("status", state.status);
  return params;
}

function stateToUrl(): string {
  const params = urlStateParams();
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

function pendingPackagesOf(group: SummaryGroup): PackageBrief[] {
  // Backend may still be rolling out the range contract.
  return group.pendingPackages ?? [];
}

function totals(): { total: number; hit: number; pending: number; exception: number } {
  if (result.summary) {
    return result.summary.reduce(
      (sum, group) => ({
        total: sum.total + group.packageCount,
        hit: sum.hit + group.hitCount,
        pending: sum.pending + group.pendingCount,
        exception: sum.exception + group.missCount + group.pendingCount,
      }),
      { total: 0, hit: 0, pending: 0, exception: 0 },
    );
  }
  const packages = result.day?.packages ?? [];
  const hit = packages.filter((pkg) => pkg.lookupStatus === "hit").length;
  const pending = packages.filter((pkg) => pkg.lookupStatus === "pending").length;
  const miss = packages.filter((pkg) => pkg.lookupStatus === "bundle_not_found").length;
  return { total: packages.length, hit, pending, exception: miss + pending };
}

function syncControls(): void {
  const counts = totals();
  const hasData = !loading && Boolean(result.summary || result.day);
  const rangeDays = state.rangeFrom ? daySpan(state.rangeFrom, state.date) : 1;
  dateBig.textContent = state.date;
  dateTag.textContent = state.rangeFrom
    ? `区间 ${rangeDays} 天`
    : state.date === yesterday ? "昨日" : "历史快照";
  dateInput.value = state.date;
  dateInput.max = yesterday;
  nextDate.disabled = state.date >= yesterday;
  backYesterday.hidden = state.date === yesterday && !state.rangeFrom;
  dateLine.textContent = state.rangeFrom
    ? `${state.rangeFrom} — ${state.date} · 区间 ${rangeDays} 天 · UTC 目标日期 · ${DATE_KIND_LABEL[state.dateKind]}口径`
    : `${state.date}${state.date === yesterday ? "（昨日）" : ""} · UTC 目标日期 · ${DATE_KIND_LABEL[state.dateKind]}口径`;
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
    const count = value === "all" ? counts.total : value === "hit" ? counts.hit : counts.exception;
    button.textContent = hasData ? `${label} ${count}` : label;
  });

  filterNote.hidden = state.status === "all" || !hasData;
  filterNote.replaceChildren();
  if (!filterNote.hidden) {
    const count = state.status === "hit" ? counts.hit : counts.exception;
    filterNote.append(`当前为筛选结果 · 仅看${statusFilterLabel(state.status)} · ${count} 包 / 共 ${counts.total} 包`);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "wx-text-action";
    clear.dataset.role = "empty-clear-filter";
    clear.textContent = "清除筛选";
    filterNote.append(clear);
  }

  renderRangeNote();
}

function renderRangeNote(): void {
  rangeNoteHost.replaceChildren();
  if (state.rangeFrom) {
    rangeNoteHost.hidden = false;
    rangeNoteHost.classList.remove("is-warn");
    rangeNoteHost.append(
      `已选 ${daySpan(state.rangeFrom, state.date)} 天：${state.rangeFrom} — ${state.date} · 再次点击区间内任意一天回到单日`,
    );
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "wx-text-action";
    clear.dataset.role = "clear-range";
    clear.textContent = "回到单日";
    rangeNoteHost.append(clear);
    return;
  }
  if (rangeNote) {
    rangeNoteHost.hidden = false;
    rangeNoteHost.classList.add("is-warn");
    rangeNoteHost.textContent = rangeNote;
    return;
  }
  rangeNoteHost.hidden = true;
}

function forecastDays(): DaySummary[] {
  const start = addDays(state.date, -6);
  const byDate = new Map(result.days.map((day) => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return byDate.get(date) ?? {
      date,
      packageCount: 0,
      hitCount: 0,
      missCount: 0,
      batchStatus: null,
    };
  });
}

function renderForecast(): void {
  forecastHost.replaceChildren();
  if (loading && result.days.length === 0) {
    forecastHost.classList.add("is-loading");
    for (let index = 0; index < 7; index += 1) {
      const cell = document.createElement("div");
      cell.className = "wx-day wx-day-skeleton";
      forecastHost.append(cell);
    }
    return;
  }
  forecastHost.classList.remove("is-loading");

  const days = forecastDays();
  const max = Math.max(1, ...days.map((day) => day.packageCount));
  const barMax = 112;

  for (const day of days) {
    const isMain = day.date === state.date;
    const inRange = Boolean(state.rangeFrom && day.date >= state.rangeFrom && day.date <= state.date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `wx-day${isMain ? " is-main" : ""}${inRange ? " is-in-range" : ""}`;
    button.dataset.role = "forecast-day";
    button.dataset.date = day.date;
    button.setAttribute("aria-pressed", String(inRange));
    if (isMain) button.setAttribute("aria-current", "date");
    button.setAttribute(
      "aria-label",
      `${day.date} ${weekdayLabel(day.date)} · ${day.packageCount} 包${isMain ? " · 当前日期" : ""}${inRange ? " · 已选区间" : ""}`,
    );
    button.title = `${day.date} · ${day.packageCount} 包`;

    const dateLabel = document.createElement("span");
    dateLabel.className = "wx-day-date";
    if (isMain) {
      const weekday = document.createElement("span");
      weekday.className = "wx-day-weekday";
      weekday.textContent = weekdayLabel(day.date);
      const monthDay = document.createElement("span");
      monthDay.className = "wx-day-md";
      monthDay.textContent = formatMonthDay(day.date);
      dateLabel.append(weekday, monthDay);
      if (state.date === yesterday) {
        const tag = document.createElement("em");
        tag.className = "wx-day-tag";
        tag.textContent = "昨日";
        dateLabel.append(tag);
      }
    } else {
      dateLabel.textContent = formatMonthDay(day.date);
    }

    const count = document.createElement("span");
    count.className = "wx-day-count";
    count.textContent = String(day.packageCount);

    const plot = document.createElement("span");
    plot.className = "wx-day-plot";
    const bar = document.createElement("span");
    bar.className = "wx-bar";
    bar.style.height = day.packageCount === 0
      ? "0"
      : `${Math.max(1, Math.round((day.packageCount / max) * barMax))}px`;
    plot.append(count, bar);

    button.append(dateLabel, plot);
    forecastHost.append(button);
  }
}

function renderBatch(): void {
  batchSummary.replaceChildren();
  batchBanner.replaceChildren();
  const batch = result.day?.batch;
  if (!batch) {
    if (state.rangeFrom) {
      batchSummary.textContent = `范围 ${state.rangeFrom} — ${state.date} · 区间统计来自汇总接口`;
    }
    return;
  }

  const abnormal = !batch.rangeComplete || batch.stale || batch.status !== "ok";
  if (!abnormal) {
    const dot = document.createElement("span");
    dot.className = "wx-batch-dot";
    dot.setAttribute("aria-hidden", "true");
    batchSummary.append(dot, `批次正常 · 更新于 ${formatDateTime(batch.fetchedAt)} · 范围完整`);
    return;
  }

  const messages: string[] = [];
  if (!batch.rangeComplete) messages.push("本日源数据可能缺少部分包，计数仅供参考。");
  if (batch.stale) messages.push("该批次已被标记为过期，详情可能不是最新。");
  if (batch.status === "failed") messages.push("批次同步失败，数据可能不完整。");

  const banner = document.createElement("p");
  banner.className = "wx-banner";
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
  card.className = options.inline ? "wx-empty is-inline" : "wx-empty";
  card.dataset.role = options.role;
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
    actions.className = "wx-empty-actions";
    for (const action of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wx-button";
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
  card.className = "wx-error";
  card.dataset.role = role;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const reason = document.createElement("p");
  reason.textContent = state.rangeFrom
    ? `无法获取 ${state.rangeFrom} — ${state.date} 的竞品数据`
    : `无法获取 ${state.date} 的竞品快照`;
  const detail = document.createElement("p");
  detail.className = "wx-error-reason";
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "wx-button";
  retry.dataset.role = "retry-load";
  retry.textContent = "重试";
  const actions = document.createElement("div");
  actions.className = "wx-empty-actions";
  actions.append(retry);
  if (state.date !== yesterday) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "wx-button";
    back.dataset.role = "empty-back-yesterday";
    back.textContent = "回到昨天";
    actions.append(back);
  }
  card.append(heading, reason, detail, actions);
  return card;
}

function renderSkeleton(): void {
  reportBody.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.className = "wx-skeleton";
  wrapper.dataset.role = "loading";
  const label = document.createElement("p");
  label.className = "wx-skeleton-label";
  label.textContent = `正在加载 ${state.rangeFrom ? `${state.rangeFrom} — ${state.date}` : state.date}…`;
  wrapper.append(label);
  for (let index = 0; index < 4; index += 1) {
    const row = document.createElement("div");
    row.className = "wx-skeleton-row";
    wrapper.append(row);
  }
  reportBody.append(wrapper);
}

function exceptionEntries(): ExceptionEntry[] {
  const entries = new Map<string, ExceptionEntry>();
  for (const group of result.summary ?? []) {
    for (const missed of group.missedPackages) {
      entries.set(missed.packageCode, { ...missed, reason: "miss", groupKey: group.groupKey });
    }
    for (const pending of pendingPackagesOf(group)) {
      if (!entries.has(pending.packageCode)) {
        entries.set(pending.packageCode, { ...pending, reason: "pending", groupKey: group.groupKey });
      }
    }
  }
  if (!state.rangeFrom) {
    for (const pkg of result.day?.packages ?? []) {
      if (pkg.lookupStatus === "pending" && !entries.has(pkg.packageCode)) {
        entries.set(pkg.packageCode, {
          packageCode: pkg.packageCode,
          displayName: pkg.displayName,
          team: pkg.team,
          appVersion: pkg.appVersion,
          iconLocalPath: pkg.iconLocalPath,
          reason: "pending",
          groupKey: state.groupBy === "team"
            ? pkg.team
            : state.groupBy === "category"
              ? pkg.category ?? "未知"
              : pkg.minimumOsVersion ?? pkg.appVersion ?? "未知",
        });
      }
    }
  }
  return [...entries.values()].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
}

function buildDetailHref(key: string, packageCode: string): string {
  const params = urlStateParams();
  params.set("view", "detail");
  params.set("competitor", key);
  params.set("package", packageCode);
  return `${window.location.pathname}?${params.toString()}`;
}

function renderListContent(): void {
  syncControls();
  listView.hidden = state.view === "detail";
  detailView.hidden = state.view !== "detail";
  renderForecast();

  if (loading) {
    batchSummary.replaceChildren("正在加载…");
    batchBanner.replaceChildren();
    renderSkeleton();
    return;
  }

  if (result.dayMissing) {
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
    batchSummary.replaceChildren();
    batchBanner.replaceChildren();
    reportBody.replaceChildren(renderError("报告加载失败", result.dayError));
    return;
  }

  if (result.summaryError) {
    batchSummary.replaceChildren();
    batchBanner.replaceChildren();
    reportBody.replaceChildren(renderError("报告加载失败", result.summaryError));
    return;
  }

  if (!result.summary || (!state.rangeFrom && !result.day)) return;
  renderBatch();

  const exceptions = exceptionEntries();
  const counts = totals();
  const emptySummary = result.summary.length === 0
    || counts.total === 0
    || (!state.rangeFrom && (result.day?.packages.length ?? 0) === 0);

  if (emptySummary) {
    reportBody.replaceChildren(createEmptyCard({
      role: "empty-packages",
      title: state.rangeFrom
        ? "该区间没有符合条件的 iOS 竞品包"
        : "当天没有符合条件的 iOS 竞品包",
      lines: [
        `已按当前口径（${DATE_KIND_LABEL[state.dateKind]} = ${state.rangeFrom ? `${state.rangeFrom} — ${state.date}` : state.date}）查询，并应用：`,
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

  if (state.status !== "all") {
    const visible = state.status === "hit" ? counts.hit : exceptions.length;
    if (visible === 0) {
      const title = state.status === "hit"
        ? state.rangeFrom ? "该区间没有命中包" : "当天没有命中包"
        : state.rangeFrom ? "该区间没有异常包" : "当天没有异常包";
      reportBody.replaceChildren(createEmptyCard({
        role: "empty-filter",
        title,
        lines: [
          state.status === "hit"
            ? "全部包都在异常区，或当前口径下没有命中记录。"
            : "未命中与待补全均为空，页面保持平静。",
        ],
        inline: true,
        actions: [{ label: "清除筛选", role: "empty-clear-filter" }],
      }));
      return;
    }
  }

  renderSummary(reportBody, {
    groups: result.summary,
    packages: new Map((result.day?.packages ?? []).map((pkg) => [pkg.packageCode, pkg])),
    dateKind: state.dateKind,
    groupBy: state.groupBy,
    status: state.status,
    rangeDays: state.rangeFrom ? daySpan(state.rangeFrom, state.date) : 1,
    collapsedGroups,
    exceptions,
    buildDetailHref,
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
      const missed = group.missedPackages.find((item) => item.packageCode === code)
        ?? pendingPackagesOf(group).find((item) => item.packageCode === code);
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

function packageStatusMap(): Map<string, LookupStatus> {
  const statuses = new Map<string, LookupStatus>();
  if (result.day) {
    for (const pkg of result.day.packages) statuses.set(pkg.packageCode, pkg.lookupStatus);
  }
  for (const group of result.summary ?? []) {
    for (const competitor of group.competitors) {
      for (const brief of competitor.packages) {
        if (!statuses.has(brief.packageCode)) statuses.set(brief.packageCode, "hit");
      }
    }
    for (const missed of group.missedPackages) statuses.set(missed.packageCode, "bundle_not_found");
    for (const pending of pendingPackagesOf(group)) {
      if (!statuses.has(pending.packageCode)) statuses.set(pending.packageCode, "pending");
    }
  }
  return statuses;
}

function pickPackageCode(competitor: SummaryCompetitor): string {
  if (state.packageCode && competitor.packages.some((pkg) => pkg.packageCode === state.packageCode)) {
    return state.packageCode;
  }
  const statuses = packageStatusMap();
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
      rangeFrom: state.rangeFrom,
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
  renderPackageDetail(detailHost, {
    competitor: context.competitor,
    packageCode,
    packageDetail: detailPackage,
    date: state.date,
    dateKind: state.dateKind,
    rangeFrom: state.rangeFrom,
    groupName: context.groupName,
    loading: detailLoading,
    error: detailError,
    history: detailHistory,
    historyError: detailHistoryError,
    historyDates: historyDates(),
    packageStatus: packageStatusMap(),
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
  listView.querySelector("h1")?.focus?.();
}

async function load(): Promise<void> {
  const token = ++requestToken;
  loading = true;
  recentNote = null;
  rangeNote = null;
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

  const dayPromise: Promise<DayDetail | null> = state.rangeFrom
    ? Promise.resolve(null)
    : getCompetitorDay(state.date, state.dateKind);
  const summaryPromise = state.rangeFrom
    ? getCompetitorSummaryRange(state.rangeFrom, state.date, state.dateKind, state.groupBy)
    : getCompetitorSummary(state.date, state.dateKind, state.groupBy);

  const [dayResult, summaryResult, daysResult] = await Promise.allSettled([
    dayPromise,
    summaryPromise,
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
  state.rangeFrom = null;
  state.view = "list";
  state.competitor = null;
  state.packageCode = null;
  rangeNote = null;
  commit("replace");
  void load();
}

function shiftDate(delta: number): void {
  if (state.rangeFrom) {
    const span = daySpan(state.rangeFrom, state.date);
    let to = addDays(state.date, delta);
    if (to > yesterday) to = yesterday;
    state.date = to;
    state.rangeFrom = addDays(to, -(span - 1));
    rangeNote = null;
    commit("replace");
    void load();
    return;
  }
  const next = addDays(state.date, delta);
  if (next > yesterday) return;
  setDate(next);
}

function selectForecastDay(date: string): void {
  if (state.view === "detail") {
    state.view = "list";
    state.competitor = null;
    state.packageCode = null;
  }

  if (state.rangeFrom) {
    if (date >= state.rangeFrom && date <= state.date) {
      state.date = date;
      state.rangeFrom = null;
      rangeNote = null;
      commit("replace");
      void load();
      return;
    }
    state.date = date;
    state.rangeFrom = null;
    rangeNote = null;
    renderListContent();
    commit("replace");
    void load();
    return;
  }

  if (date === state.date) return;

  const from = date < state.date ? date : state.date;
  const to = date < state.date ? state.date : date;
  if (daySpan(from, to) > MAX_RANGE_DAYS) {
    rangeNote = `日期范围最多 ${MAX_RANGE_DAYS} 天，请缩短选择。`;
    renderRangeNote();
    return;
  }

  state.date = to;
  state.rangeFrom = from;
  rangeNote = null;
  renderListContent();
  commit("replace");
  void load();
}

function clearRange(): void {
  state.rangeFrom = null;
  rangeNote = null;
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
      shiftDate(-1);
      break;
    case "next-date":
      if (state.date < yesterday) shiftDate(1);
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
    case "forecast-day":
      if (control.dataset.date) selectForecastDay(control.dataset.date);
      break;
    case "clear-range":
      clearRange();
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
    case "exception-row":
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
    || next.rangeFrom !== state.rangeFrom
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
