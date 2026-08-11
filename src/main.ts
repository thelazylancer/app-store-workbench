import "./styles.css";
import { searchApps } from "./lib/api";
import { filterResults, type ResultFilters, type ResultStatusFilter } from "./lib/filterResults";
import { parseQueries } from "./lib/parseQueries";
import { renderResults } from "./lib/renderResults";
import type { SearchResult } from "../shared/types";

function requireElement<T extends Element>(element: T | null, label: string): T {
  if (!element) {
    throw new Error(`Missing ${label}`);
  }

  return element;
}

const app = requireElement(document.querySelector<HTMLDivElement>("#app"), "#app root");

app.innerHTML = `
  <main class="app-shell app-shell-root">
    <section class="workspace-frame">
      <header class="workspace-header">
        <div class="workspace-title">
          <p class="workspace-kicker">美国区 App Store</p>
          <h1>App搜索工作台</h1>
          <p class="workspace-subtitle">检索真实商店页，聚焦截图、价格带和上架信息。</p>
        </div>
        <div class="workspace-badges" aria-label="Store metadata">
          <div class="meta-chip">
            <span class="meta-chip-label">区域</span>
            <strong>US</strong>
          </div>
          <div class="meta-chip">
            <span class="meta-chip-label">来源</span>
            <strong>商店渲染页</strong>
          </div>
          <div class="meta-chip">
            <span class="meta-chip-label">内容</span>
            <strong>URL、图标、简介、截图、内购</strong>
          </div>
        </div>
      </header>

      <div class="workspace-grid">
        <aside class="search-rail">
          <section class="rail-card">
            <div class="rail-card-head">
              <div>
                <p class="panel-label">查询</p>
                <h2>搜索</h2>
              </div>
              <span class="rail-pill">US</span>
            </div>

            <label class="field">
              <span>应用名称</span>
              <textarea placeholder="Funce&#10;Duolingo"></textarea>
              <p class="field-note">支持单个或批量应用名称，每行一个。</p>
            </label>

            <div class="actions">
              <button type="button" data-role="search">开始搜索</button>
              <button type="button" class="secondary-button" data-role="clear">清空结果</button>
            </div>

            <div class="search-hints">
              <span class="search-hint-chip">应用名称</span>
              <span class="search-hint-chip">逐行输入</span>
              <span class="search-hint-chip">批量检索</span>
            </div>
          </section>
        </aside>

        <section class="content-panel">
          <div class="results-panel-head">
            <div>
              <p class="panel-label">结果</p>
              <h2>商店页信息</h2>
            </div>
            <p class="results-summary" data-role="summary">输入一个或多个应用名称开始检索</p>
          </div>

          <section class="results" aria-live="polite">
            <p class="empty">输入应用名称开始检索</p>
          </section>
        </section>
      </div>
    </section>
  </main>
`;

const textarea = requireElement(
  app.querySelector<HTMLTextAreaElement>("textarea"),
  "search textarea",
);
const button = requireElement(
  app.querySelector<HTMLButtonElement>('[data-role="search"]'),
  "search button",
);
const clearButton = requireElement(
  app.querySelector<HTMLButtonElement>('[data-role="clear"]'),
  "clear button",
);
const results = requireElement(app.querySelector<HTMLElement>(".results"), "results container");
const summary = requireElement(
  app.querySelector<HTMLElement>('[data-role="summary"]'),
  "results summary",
);
let hasSearched = false;

function updateSummary(items: SearchResult[], searched: boolean) {
  if (!searched) {
    summary.textContent = "输入一个或多个应用名称开始检索";
    return;
  }

  const matched = items.filter((item) => item.status === "matched").length;
  const uncertain = items.filter((item) => item.status === "uncertain_match").length;
  const failed = items.filter(
    (item) => item.status === "no_match" || item.status === "search_failed",
  ).length;
  const withScreenshots = items.filter(
    (item) => item.app && item.app.screenshotUrls.length > 0,
  ).length;

  summary.textContent =
    `共 ${items.length} 项 · ` +
    `${matched} 项已匹配 · ` +
    `${uncertain} 项待确认 · ` +
    `${withScreenshots} 项有截图 · ` +
    `${failed} 项未解决`;
}

function createButtonIcon(kind: "search" | "clear") {
  const icon = document.createElement("span");
  icon.className = `button-icon button-icon-${kind}`;
  icon.setAttribute("aria-hidden", "true");

  if (kind === "search") {
    icon.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="4.75" stroke="currentColor" stroke-width="1.8"></circle><path d="M12 12L16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
  } else {
    icon.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
  }

  return icon;
}

function decorateActionButtons() {
  button.prepend(createButtonIcon("search"));
  clearButton.prepend(createButtonIcon("clear"));
}

function createFilterButton(
  role: string,
  value: string,
  label: string,
  isActive = false,
) {
  const control = document.createElement("button");
  control.type = "button";
  control.className = `filter-chip${isActive ? " is-active" : ""}`;
  control.dataset.role = role;
  control.dataset.value = value;
  control.dataset.label = label;
  control.textContent = label;
  return control;
}

function createFilterBar() {
  const bar = document.createElement("div");
  bar.className = "filter-bar";

  const statusCluster = document.createElement("section");
  statusCluster.className = "filter-cluster";

  const statusLabel = document.createElement("p");
  statusLabel.className = "filter-cluster-label";
  statusLabel.textContent = "匹配状态";
  statusCluster.append(statusLabel);

  const statusGroup = document.createElement("div");
  statusGroup.className = "filter-group filter-segment";
  statusGroup.setAttribute("role", "tablist");
  statusGroup.setAttribute("aria-label", "匹配状态筛选");
  statusGroup.append(createFilterButton("status-filter", "all", "全部", true));
  statusGroup.append(createFilterButton("status-filter", "matched", "已匹配"));
  statusGroup.append(createFilterButton("status-filter", "uncertain_match", "待确认"));
  statusGroup.append(createFilterButton("status-filter", "unresolved", "未解决"));
  statusCluster.append(statusGroup);

  const toggleCluster = document.createElement("section");
  toggleCluster.className = "filter-cluster filter-cluster-secondary";

  const toggleLabel = document.createElement("p");
  toggleLabel.className = "filter-cluster-label";
  toggleLabel.textContent = "结果约束";
  toggleCluster.append(toggleLabel);

  const toggleGroup = document.createElement("div");
  toggleGroup.className = "filter-group filter-group-toggles";
  toggleGroup.append(createFilterButton("screenshots-filter", "off", "仅看有截图"));
  toggleGroup.append(createFilterButton("iap-filter", "off", "命中 4.99 / 9.99"));
  toggleCluster.append(toggleGroup);

  bar.append(statusCluster, toggleCluster);
  return bar;
}

function createEmptyState(title: string, description: string, filtered = false) {
  const state = document.createElement("section");
  state.className = `empty-state${filtered ? " is-filtered" : ""}`;

  const mark = document.createElement("div");
  mark.className = "empty-state-mark";
  state.append(mark);

  const badge = document.createElement("p");
  badge.className = "empty-state-kicker";
  badge.textContent = filtered ? "当前筛选下无结果" : "等待搜索";
  state.append(badge);

  const heading = document.createElement("h3");
  heading.textContent = title;
  state.append(heading);

  const copy = document.createElement("p");
  copy.className = "empty-state-copy";
  copy.textContent = description;
  state.append(copy);

  if (!filtered) {
    const note = document.createElement("p");
    note.className = "empty-state-note";
    note.textContent = "支持单个搜索，也支持逐行输入多个应用名称。";
    state.append(note);
  }
  return state;
}

const filters: ResultFilters = {
  status: "all",
  screenshotsOnly: false,
  iapMatchedOnly: false,
};
let allResults: SearchResult[] = [];
const filterBar = createFilterBar();

function getStatusCounts(items: SearchResult[]) {
  return {
    all: items.length,
    matched: items.filter((item) => item.status === "matched").length,
    uncertain_match: items.filter((item) => item.status === "uncertain_match").length,
    unresolved: items.filter(
      (item) => item.status === "no_match" || item.status === "search_failed",
    ).length,
  };
}

async function refreshMotion(mode: "boot" | "empty" | "results") {
  try {
    const { initMotion } = await import("./lib/motion");
    initMotion(app, mode);
  } catch {
    // Motion is non-blocking for the workbench.
  }
}

function syncFilterUi() {
  const counts = getStatusCounts(allResults);
  app
    .querySelectorAll<HTMLButtonElement>('[data-role="status-filter"]')
    .forEach((element) => {
      element.classList.toggle("is-active", element.dataset.value === filters.status);
      const label = element.dataset.label ?? "";

      switch (element.dataset.value) {
        case "all":
          element.textContent = `${label} ${counts.all}`;
          break;
        case "matched":
          element.textContent = `${label} ${counts.matched}`;
          break;
        case "uncertain_match":
          element.textContent = `${label} ${counts.uncertain_match}`;
          break;
        case "unresolved":
          element.textContent = `${label} ${counts.unresolved}`;
          break;
        default:
          element.textContent = label;
      }
    });

  const screenshotsFilter = app.querySelector<HTMLButtonElement>(
    '[data-role="screenshots-filter"]',
  );
  screenshotsFilter?.classList.toggle("is-active", filters.screenshotsOnly);

  const iapFilter = app.querySelector<HTMLButtonElement>('[data-role="iap-filter"]');
  iapFilter?.classList.toggle("is-active", filters.iapMatchedOnly);
}

function updateResultsView() {
  if (!hasSearched) {
    filterBar.hidden = true;
    results.classList.add("is-idle");
    syncFilterUi();
    updateSummary([], false);
    results.replaceChildren(
      createEmptyState(
        "输入应用名称后显示结果",
        "搜索后在这里查看商店页信息。",
      ),
    );
    void refreshMotion("empty");
    return;
  }

  filterBar.hidden = false;
  results.classList.remove("is-idle");
  syncFilterUi();
  const filtered = filterResults(allResults, filters);
  updateSummary(filtered, hasSearched);

  if (filtered.length === 0) {
    results.replaceChildren(
      createEmptyState(
        "没有符合当前筛选的结果",
        "调整筛选条件后继续查看。",
        true,
      ),
    );
    void refreshMotion("empty");
    return;
  }

  renderResults(results, filtered, hasSearched);
  void refreshMotion("results");
}

function bindFilterEvents() {
  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const trigger = target.closest<HTMLButtonElement>(".filter-chip");
    if (!trigger) {
      return;
    }

    if (trigger.dataset.role === "status-filter") {
      filters.status = (trigger.dataset.value as ResultStatusFilter) ?? "all";
    }

    if (trigger.dataset.role === "screenshots-filter") {
      filters.screenshotsOnly = !filters.screenshotsOnly;
    }

    if (trigger.dataset.role === "iap-filter") {
      filters.iapMatchedOnly = !filters.iapMatchedOnly;
    }

    syncFilterUi();
    updateResultsView();
  });
}

button.addEventListener("click", async () => {
  const names = parseQueries(textarea.value);

  if (names.length === 0) {
    hasSearched = false;
    allResults = [];
    filters.status = "all";
    filters.screenshotsOnly = false;
    filters.iapMatchedOnly = false;
    syncFilterUi();
    updateResultsView();
    return;
  }

  hasSearched = true;
  allResults = [];
  results.innerHTML = `<p class="empty">检索中...</p>`;
  summary.textContent = `正在查询 ${names.length} 个应用...`;

  try {
    const response = await searchApps(names);
    allResults = response.results;
    updateResultsView();
  } catch {
    summary.textContent = "检索失败";
    results.innerHTML = `<p class="result-message">请求失败，请稍后重试</p>`;
  }
});

clearButton.addEventListener("click", () => {
  textarea.value = "";
  hasSearched = false;
  allResults = [];
  filters.status = "all";
  filters.screenshotsOnly = false;
  filters.iapMatchedOnly = false;
  syncFilterUi();
  updateResultsView();
  textarea.focus();
});

decorateActionButtons();
results.before(filterBar);
syncFilterUi();
bindFilterEvents();
updateResultsView();
void refreshMotion("boot");
