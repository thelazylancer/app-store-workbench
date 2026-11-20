import "./competitor.css";
import {
  CompetitorApiError,
  getCompetitorDay,
  getCompetitorDays,
  getCompetitorPackage,
} from "../lib/competitorApi";
import type {
  DayDetail,
  GroupBy,
  LookupStatus,
  PackageBrief,
  PackageDetail,
  SummaryCompetitor,
  SummaryGroup,
} from "../../shared/competitorTypes";
import {
  addDays,
  isDateString,
  statusFilterLabel,
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
  date: string | null;
  team: string | null;
  category: string | null;
  status: StatusFilter;
  view: "list" | "detail";
  competitor: string | null;
  packageCode: string | null;
};

const WINDOW_DAYS = 14;
const TIMELINE_GROUP_BY: GroupBy = "category";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root");

const yesterday = yesterdayUtc();

function parseStatus(value: string | null): StatusFilter {
  if (value === "hit") return "hit";
  if (value === "exception" || value === "miss") return "exception";
  return "all";
}

function parseDate(value: string | null): string | null {
  if (!isDateString(value) || value > yesterday) return null;
  return value;
}

function parseState(): PageState {
  const params = new URLSearchParams(window.location.search);
  const team = params.get("team");
  const category = params.get("category");
  return {
    date: parseDate(params.get("date")),
    team: team || null,
    category: category || null,
    status: parseStatus(params.get("status")),
    view: params.get("view") === "detail" ? "detail" : "list",
    competitor: params.get("competitor"),
    packageCode: params.get("package"),
  };
}

let state = parseState();
let loading = false;
let loadError: string | null = null;
let windowLoaded = false;
let requestToken = 0;
let detailToken = 0;
let detailLoading = false;
let detailError: string | null = null;
let detailPackage: PackageDetail | null = null;
let loaded: DayDetail[] = [];
const missingDates = new Set<string>();
const collapsedGroups = new Set<string>();

app.innerHTML = `
  <main class="wx-shell">
    <header class="wx-top">
      <div class="wx-brand">
        <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="2" fill="#1C2733"/><rect x="1" y="9" width="4" height="6" fill="#E7EDF2"/><rect x="6" y="6" width="4" height="9" fill="#E7EDF2"/><rect x="11" y="2" width="4" height="13" fill="#2E6FA3"/></svg>
        <span>App 搜索工作台</span>
      </div>
      <nav class="wx-tabs" aria-label="主导航">
        <a href="${import.meta.env.BASE_URL}index.html" aria-current="page">竞品</a>
        <a href="${import.meta.env.BASE_URL}search.html">App Store 搜索</a>
      </nav>
    </header>

    <section class="wx-report" data-role="list-view">
      <div class="wx-head">
        <div class="wx-title">
          <h1>时间线</h1>
          <span class="wx-window" data-role="window-caption"></span>
        </div>
        <div class="wx-controls">
          <label class="wx-control">
            <span class="wx-label">团队</span>
            <select class="wx-select" data-role="team-filter" aria-label="按团队过滤"></select>
          </label>
          <label class="wx-control">
            <span class="wx-label">类目</span>
            <select class="wx-select" data-role="category-filter" aria-label="按类目过滤"></select>
          </label>
          <div class="wx-control">
            <span class="wx-label">日期</span>
            <input class="wx-select" type="date" data-role="date-filter" aria-label="按日期筛选" max="${yesterday}" />
            <button type="button" class="wx-text-action" data-role="clear-date" hidden>清除</button>
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

      <div class="wx-stats">
        <div class="wx-stat"><b data-role="stat-total">0</b><span>包总数</span></div>
        <div class="wx-stat"><b data-role="stat-competitors">0</b><span>竞品数</span></div>
        <div class="wx-stat wx-stat-hit"><b data-role="stat-hit">0</b><span>命中</span></div>
        <div class="wx-stat wx-stat-exception"><b data-role="stat-exception">0</b><span>异常</span></div>
      </div>

      <div data-role="batch-banner"></div>
      <p class="wx-filter-note" data-role="filter-note" hidden></p>
      <div class="wx-body" data-role="report-body" aria-live="polite"></div>

      <footer class="wx-foot">
        <p class="wx-foot-status" data-role="batch-summary"></p>
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
const windowCaption = requireElement<HTMLElement>('[data-role="window-caption"]');
const batchSummary = requireElement<HTMLElement>('[data-role="batch-summary"]');
const batchBanner = requireElement<HTMLElement>('[data-role="batch-banner"]');
const statTotal = requireElement<HTMLElement>('[data-role="stat-total"]');
const statCompetitors = requireElement<HTMLElement>('[data-role="stat-competitors"]');
const statHit = requireElement<HTMLElement>('[data-role="stat-hit"]');
const statException = requireElement<HTMLElement>('[data-role="stat-exception"]');
const filterNote = requireElement<HTMLElement>('[data-role="filter-note"]');
const reportBody = requireElement<HTMLElement>('[data-role="report-body"]');
const teamSelect = requireElement<HTMLSelectElement>('[data-role="team-filter"]');
const categorySelect = requireElement<HTMLSelectElement>('[data-role="category-filter"]');
const dateInput = requireElement<HTMLInputElement>('[data-role="date-filter"]');
const clearDateButton = requireElement<HTMLButtonElement>('[data-role="clear-date"]');
const detailHost = detailView;

function windowStart(): string {
  return addDays(yesterday, -(WINDOW_DAYS - 1));
}

function urlStateParams(): URLSearchParams {
  const params = new URLSearchParams();
  if (state.date) params.set("date", state.date);
  if (state.team) params.set("team", state.team);
  if (state.category) params.set("category", state.category);
  if (state.status !== "all") params.set("status", state.status);
  return params;
}

function stateToUrl(): string {
  const params = urlStateParams();
  if (state.view === "detail") {
    params.set("view", "detail");
    if (state.competitor) params.set("competitor", state.competitor);
    if (state.packageCode) params.set("package", state.packageCode);
  }
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

function commit(mode: "push" | "replace"): void {
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", stateToUrl());
}

function errorMessage(error: unknown): string {
  return error instanceof CompetitorApiError ? error.message : "请求失败";
}

function versionEntries(pkg: PackageDetail): Array<{ releasedAt?: unknown }> {
  // Day payloads leave `versions` empty; the history lives on appStoreJson.
  const history = pkg.appStoreJson.versionHistory;
  if (Array.isArray(history) && history.length > 0) return history as Array<{ releasedAt?: unknown }>;
  return pkg.versions;
}

function releaseDates(entries: Array<{ releasedAt?: unknown }>): { earliestReleasedAt: string | null; latestReleasedAt: string | null } {
  const dates = entries
    .map((entry) => typeof entry.releasedAt === "string" ? entry.releasedAt.slice(0, 10) : "")
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return {
    earliestReleasedAt: dates[0] ?? null,
    latestReleasedAt: dates.at(-1) ?? null,
  };
}

function briefFrom(pkg: PackageDetail): PackageBrief {
  const iap = pkg.appStoreJson.iapItems;
  const versions = versionEntries(pkg);
  return {
    packageCode: pkg.packageCode,
    displayName: pkg.displayName,
    team: pkg.team,
    appVersion: pkg.appVersion,
    iconLocalPath: pkg.iconLocalPath,
    hasIap: Array.isArray(iap) && iap.length > 0,
    versionCount: versions.length,
    ...releaseDates(versions),
  };
}

function storeName(pkg: PackageDetail): string {
  for (const key of ["name", "trackName"]) {
    const value = pkg.appStoreJson[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return pkg.displayName;
}

function categoryOf(pkg: PackageDetail): string {
  return pkg.category ?? "未分类";
}

function inScope(day: DayDetail): boolean {
  return state.date === null || day.date === state.date;
}

function matches(pkg: PackageDetail): boolean {
  if (state.team && pkg.team !== state.team) return false;
  if (state.category && categoryOf(pkg) !== state.category) return false;
  return true;
}

function scopeDays(): DayDetail[] {
  return loaded.filter(inScope).sort((a, b) => b.date.localeCompare(a.date));
}

function toGroup(day: DayDetail, applyFilters: boolean): SummaryGroup {
  const packages = day.packages.filter((pkg) => !applyFilters || matches(pkg));
  const hits = packages.filter((pkg) => pkg.lookupStatus === "hit");
  const missed = packages.filter((pkg) => pkg.lookupStatus === "bundle_not_found");
  const pending = packages.filter((pkg) => pkg.lookupStatus === "pending");
  const byKey = new Map<string, PackageDetail[]>();
  for (const pkg of hits) {
    const key = pkg.appleId !== null ? `apple:${pkg.appleId}` : `pkg:${pkg.packageCode}`;
    const list = byKey.get(key) ?? [];
    list.push(pkg);
    byKey.set(key, list);
  }
  const competitors: SummaryCompetitor[] = [...byKey.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
    const first = sorted[0]!;
    return {
      appleId: first.appleId,
      name: storeName(first),
      packageCount: sorted.length,
      packages: sorted.map(briefFrom),
    };
  });
  return {
    groupKey: day.date,
    packageCount: packages.length,
    hitCount: hits.length,
    missCount: missed.length,
    pendingCount: pending.length,
    competitorCount: competitors.length,
    competitors,
    missedPackages: missed.map(briefFrom),
    pendingPackages: pending.map(briefFrom),
    timeline: [],
  };
}

function exceptionsOf(group: SummaryGroup): ExceptionEntry[] {
  return [
    ...group.missedPackages.map((brief) => ({ ...brief, reason: "miss" as const, groupKey: group.groupKey })),
    ...group.pendingPackages.map((brief) => ({ ...brief, reason: "pending" as const, groupKey: group.groupKey })),
  ].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
}

function scopedPackages(): PackageDetail[] {
  return scopeDays().flatMap((day) => day.packages).filter(matches);
}

function totals(): { total: number; competitors: number; hit: number; exception: number } {
  const packages = scopedPackages();
  const hits = packages.filter((pkg) => pkg.lookupStatus === "hit");
  const keys = new Set(hits.map((pkg) => pkg.appleId !== null ? `apple:${pkg.appleId}` : `pkg:${pkg.packageCode}`));
  return {
    total: packages.length,
    competitors: keys.size,
    hit: hits.length,
    exception: packages.length - hits.length,
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh"));
}

function fillSelect(select: HTMLSelectElement, values: string[], current: string | null): void {
  const options = current && !values.includes(current) ? [...values, current] : values;
  const signature = options.join("\0");
  if (select.dataset.options !== signature) {
    select.dataset.options = signature;
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "全部";
    select.append(all);
    for (const value of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
  }
  select.value = current ?? "";
}

function syncControls(): void {
  const counts = totals();
  const hasData = !loading && scopedPackages().length > 0;
  const optionPackages = scopeDays().flatMap((day) => day.packages);
  windowCaption.textContent = state.date ?? `${windowStart()} — ${yesterday}`;
  dateInput.value = state.date ?? "";
  clearDateButton.hidden = state.date === null;
  fillSelect(teamSelect, uniqueSorted(optionPackages.map((pkg) => pkg.team)), state.team);
  fillSelect(categorySelect, uniqueSorted(optionPackages.map(categoryOf)), state.category);

  statTotal.textContent = String(counts.total);
  statCompetitors.textContent = String(counts.competitors);
  statHit.textContent = String(counts.hit);
  statException.textContent = String(counts.exception);

  app!.querySelectorAll<HTMLButtonElement>('[data-role="status"]').forEach((button) => {
    const value = button.dataset.value as StatusFilter;
    const active = value === state.status;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.replaceChildren();
    const labelSpan = document.createElement("span");
    labelSpan.textContent = statusFilterLabel(value);
    button.append(labelSpan);
    if (hasData) {
      const count = value === "all" ? counts.total : value === "hit" ? counts.hit : counts.exception;
      const countSpan = document.createElement("span");
      countSpan.className = "wx-seg-count";
      countSpan.textContent = String(count);
      button.append(" ", countSpan);
    }
  });

  const filtered = Boolean(state.team || state.category || state.status !== "all");
  filterNote.hidden = !filtered || !hasData;
  filterNote.replaceChildren();
  if (!filterNote.hidden) {
    const bits = [state.team, state.category, state.status !== "all" ? statusFilterLabel(state.status) : null]
      .filter(Boolean);
    const shown = state.status === "hit" ? counts.hit : state.status === "exception" ? counts.exception : counts.total;
    filterNote.append(`当前为筛选结果 · ${bits.join(" · ")} · ${shown} 包`);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "wx-text-action";
    clear.dataset.role = "empty-clear-filter";
    clear.textContent = "清除筛选";
    filterNote.append(clear);
  }
}

function renderBatch(): void {
  batchSummary.replaceChildren();
  batchBanner.replaceChildren();
  const days = scopeDays();
  if (days.length === 0) return;
  const abnormal = days.filter((day) => {
    const batch = day.batch;
    return !batch || !batch.rangeComplete || batch.stale || batch.status !== "ok";
  });
  const dot = document.createElement("span");
  dot.className = "wx-batch-dot";
  dot.setAttribute("aria-hidden", "true");
  if (abnormal.length === 0) {
    batchSummary.append(
      dot,
      days.length === 1 ? `批次正常 · 批次 ${days[0]!.date}` : `批次正常 · ${days.length} 天`,
    );
    return;
  }
  batchSummary.append(dot, days.length === 1 ? `批次异常 · 批次 ${days[0]!.date}` : `批次异常 · ${abnormal.length} 天`);
  const banner = document.createElement("p");
  banner.className = "wx-banner";
  banner.textContent = abnormal.map((day) => day.date).join("、") + " 的批次可能不完整。";
  batchBanner.append(banner);
}

function createEmptyCard(options: {
  role: string;
  title: string;
  lines?: string[];
  actions?: Array<{ label: string; role: string }>;
}): HTMLElement {
  const card = document.createElement("section");
  card.className = "wx-empty";
  card.dataset.role = options.role;
  const heading = document.createElement("h2");
  heading.textContent = options.title;
  card.append(heading);
  for (const line of options.lines ?? []) {
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

function renderError(message: string): HTMLElement {
  const card = document.createElement("section");
  card.className = "wx-error";
  card.dataset.role = "error";
  const heading = document.createElement("h2");
  heading.textContent = "报告加载失败";
  const reason = document.createElement("p");
  reason.textContent = state.date
    ? `无法获取 ${state.date} 的竞品快照`
    : `无法获取 ${windowStart()} — ${yesterday} 的竞品数据`;
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
  label.textContent = "正在加载时间线…";
  wrapper.append(label);
  for (let index = 0; index < 4; index += 1) {
    const row = document.createElement("div");
    row.className = "wx-skeleton-row";
    wrapper.append(row);
  }
  reportBody.append(wrapper);
}

function buildDetailHref(key: string, packageCode: string): string {
  const params = urlStateParams();
  params.set("view", "detail");
  params.set("competitor", key);
  params.set("package", packageCode);
  return `${window.location.pathname}?${params.toString()}`;
}

function packageMap(day: DayDetail): Map<string, PackageDetail> {
  return new Map(day.packages.map((pkg) => [pkg.packageCode, pkg]));
}

function renderTimeline(): void {
  reportBody.replaceChildren();
  for (const day of scopeDays()) {
    const group = toGroup(day, true);
    if (group.packageCount === 0) continue;
    const host = document.createElement("div");
    host.className = "wx-timeline-day";
    host.dataset.role = "timeline-day";
    host.dataset.date = day.date;
    renderSummary(host, {
      groups: group.competitors.length > 0 ? [group] : [],
      packages: packageMap(day),
      dateKind: "first_ad",
      groupBy: TIMELINE_GROUP_BY,
      status: state.status,
      rangeDays: 1,
      collapsedGroups,
      exceptions: exceptionsOf(group),
      buildDetailHref,
    });
    if (host.childElementCount === 0) continue;
    reportBody.append(host);
  }
}

function visibleRowCount(): number {
  return reportBody.querySelectorAll('[data-role="competitor-row"], [data-role="exception-row"]').length;
}

function renderListContent(): void {
  syncControls();
  listView.hidden = state.view === "detail";
  detailView.hidden = state.view !== "detail";
  if (state.view === "detail") return;

  if (loading) {
    batchSummary.replaceChildren("正在加载…");
    batchBanner.replaceChildren();
    renderSkeleton();
    return;
  }

  if (loadError) {
    batchSummary.replaceChildren();
    batchBanner.replaceChildren();
    reportBody.replaceChildren(renderError(loadError));
    return;
  }

  const scoped = scopeDays();
  const rawCount = scoped.reduce((sum, day) => sum + day.packages.length, 0);
  if (scoped.length === 0 || rawCount === 0) {
    batchSummary.replaceChildren();
    batchBanner.replaceChildren();
    const focused = state.date;
    reportBody.replaceChildren(createEmptyCard({
      role: "empty-day",
      title: focused ? "这一天还没有快照" : `近 ${WINDOW_DAYS} 天没有快照`,
      lines: [
        focused
          ? `${focused} 没有成功完成的批次。`
          : `${windowStart()} — ${yesterday} 没有成功完成的批次。`,
      ],
      actions: focused ? [{ label: "回到时间线", role: "clear-date" }] : [{ label: "重试", role: "retry-load" }],
    }));
    return;
  }

  renderBatch();
  renderTimeline();
  if (visibleRowCount() === 0) {
    reportBody.replaceChildren(createEmptyCard({
      role: "empty-filter",
      title: "没有符合当前筛选的包",
      actions: [{ label: "清除筛选", role: "empty-clear-filter" }],
    }));
  }
}

function findDetailContext(key: string): { competitor: SummaryCompetitor; groupName: string } | null {
  for (const day of loaded) {
    const group = toGroup(day, false);
    const match = group.competitors.find((item) => competitorKey(item) === key);
    if (match) return { competitor: match, groupName: match.packages[0]?.team ?? "" };
    if (key.startsWith("pkg:")) {
      const code = key.slice(4);
      const missed = group.missedPackages.find((item) => item.packageCode === code)
        ?? group.pendingPackages.find((item) => item.packageCode === code);
      if (missed) {
        return {
          groupName: missed.team,
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
  for (const day of loaded) {
    for (const pkg of day.packages) statuses.set(pkg.packageCode, pkg.lookupStatus);
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
    const waiting = loading || (!loadError && !windowLoaded && loaded.length === 0 && state.date === null);
    renderPackageDetail(detailHost, {
      competitor: { appleId: null, name: "", packageCount: 0, packages: [] },
      packageCode: state.packageCode ?? "",
      packageDetail: null,
      groupName: "",
      loading: waiting,
      error: waiting ? null : loadError ?? (state.date && missingDates.has(state.date) ? "该日期没有快照" : "未找到该竞品"),
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
    groupName: context.groupName,
    loading: detailLoading,
    error: detailError,
    onRetry: () => { void loadDetail(packageCode); },
    onBack: backToList,
  });
}

async function loadDetail(packageCode: string): Promise<void> {
  const token = ++detailToken;
  detailLoading = true;
  detailError = null;
  detailPackage = null;
  renderDetailView();
  try {
    const pkg = await getCompetitorPackage(packageCode);
    if (token !== detailToken) return;
    detailPackage = pkg;
  } catch (error) {
    if (token !== detailToken) return;
    detailError = errorMessage(error);
  }
  detailLoading = false;
  renderDetailView();
}

function openDetail(key: string, packageCode: string): void {
  state.view = "detail";
  state.competitor = key;
  state.packageCode = packageCode || null;
  commit("push");
  detailPackage = null;
  renderListContent();
  renderDetailView();
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
}

function dateIsReady(date: string | null): boolean {
  if (date === null) return windowLoaded;
  return loaded.some((day) => day.date === date) || missingDates.has(date);
}

// shortcut: one request per day in the 14-day window; switch to a range payload when it includes each day's packages.
async function fetchWindow(): Promise<DayDetail[]> {
  const summaries = await getCompetitorDays(windowStart(), yesterday);
  const dates = [...new Set(summaries.filter((day) => day.packageCount > 0).map((day) => day.date))];
  const failures: unknown[] = [];
  const details = await Promise.all(dates.map(async (date) => {
    try {
      return await getCompetitorDay(date, "first_ad");
    } catch (error) {
      if (error instanceof CompetitorApiError && error.status === 404) return null;
      failures.push(error);
      return null;
    }
  }));
  const byDate = new Map<string, DayDetail>();
  for (const detail of details) {
    if (detail) byDate.set(detail.date, detail);
  }
  if (byDate.size === 0 && failures.length > 0) throw failures[0];
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function load(): Promise<void> {
  const token = ++requestToken;
  const focus = state.date;
  loading = true;
  loadError = null;
  detailPackage = null;
  detailError = null;
  renderListContent();
  renderDetailView();

  try {
    if (focus) {
      const detail = await getCompetitorDay(focus, "first_ad");
      if (token !== requestToken) return;
      missingDates.delete(focus);
      loaded = windowLoaded
        ? [...loaded.filter((day) => day.date !== detail.date), detail].sort((a, b) => b.date.localeCompare(a.date))
        : [detail];
    } else {
      const days = await fetchWindow();
      if (token !== requestToken) return;
      loaded = days;
      windowLoaded = true;
      missingDates.clear();
    }
  } catch (error) {
    if (token !== requestToken) return;
    if (focus && error instanceof CompetitorApiError && error.status === 404) {
      missingDates.add(focus);
      if (!windowLoaded) loaded = [];
    } else if (focus && windowLoaded) {
      loadError = errorMessage(error);
    } else {
      loaded = [];
      if (!focus) windowLoaded = false;
      loadError = errorMessage(error);
    }
  }

  if (token !== requestToken) return;
  loading = false;
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

function setDate(value: string): void {
  const next = value ? parseDate(value) : null;
  if (value && !next) return;
  if (next === state.date) return;
  state.date = next;
  state.view = "list";
  state.competitor = null;
  state.packageCode = null;
  commit("replace");
  if (dateIsReady(next)) {
    renderListContent();
    renderDetailView();
  } else {
    void load();
  }
  if (next) {
    document.querySelector<HTMLElement>(`[data-role="timeline-day"][data-date="${next}"]`)?.scrollIntoView?.({ block: "start" });
  }
}

function setTeam(team: string | null): void {
  state.team = team || null;
  commit("replace");
  renderListContent();
}

function setCategory(category: string | null): void {
  state.category = category || null;
  commit("replace");
  renderListContent();
}

function setStatus(status: StatusFilter): void {
  state.status = status;
  commit("replace");
  renderListContent();
}

function clearFilters(): void {
  state.team = null;
  state.category = null;
  state.status = "all";
  commit("replace");
  renderListContent();
}

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.dataset.role === "team-filter") {
    setTeam(target.value || null);
  } else if (target instanceof HTMLSelectElement && target.dataset.role === "category-filter") {
    setCategory(target.value || null);
  } else if (target instanceof HTMLInputElement && target.dataset.role === "date-filter") {
    setDate(target.value);
  }
});

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const control = target.closest<HTMLElement>("[data-role]");
  if (!control) return;

  switch (control.dataset.role) {
    case "status":
      setStatus(control.dataset.value as StatusFilter);
      break;
    case "clear-date":
      setDate("");
      break;
    case "group-toggle": {
      event.preventDefault();
      const group = control.dataset.group ?? "";
      if (collapsedGroups.has(group)) collapsedGroups.delete(group);
      else collapsedGroups.add(group);
      renderListContent();
      break;
    }
    case "competitor-row":
    case "exception-row":
      event.preventDefault();
      openDetail(control.dataset.competitor ?? "", control.dataset.package ?? "");
      break;
    case "retry-load":
      void load();
      break;
    case "empty-clear-filter":
      clearFilters();
      break;
    case "detail-back":
      backToList();
      break;
    case "detail-retry":
      if (state.packageCode) void loadDetail(state.packageCode);
      break;
  }
});

window.addEventListener("popstate", () => {
  const next = parseState();
  const dateChanged = next.date !== state.date;
  state = next;
  if (dateChanged && !dateIsReady(state.date)) {
    void load();
    return;
  }
  renderListContent();
  renderDetailView();
  if (state.view === "detail" && state.competitor) {
    const context = findDetailContext(state.competitor);
    const packageCode = state.packageCode ?? (context ? pickPackageCode(context.competitor) : "");
    if (packageCode) void loadDetail(packageCode);
  }
});

function urlNeedsNormalize(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has("date_kind") || params.has("group_by") || params.has("from")) return true;
  const rawDate = params.get("date");
  return Boolean(rawDate) && state.date !== rawDate;
}

syncControls();
renderListContent();
if (urlNeedsNormalize()) commit("replace");
void load();
