import "./styles.css";
import { searchApps } from "./lib/api";
import { filterResults, type ResultFilters, type ResultStatusFilter } from "./lib/filterResults";
import { parseQueries } from "./lib/parseQueries";
import { renderResults } from "./lib/renderResults";
import type { SearchResult, StoreCountry } from "../shared/types";

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
          <h1>App搜索工作台</h1>
        </div>
        <div class="workspace-badges" aria-label="商店信息">
          <span data-role="country-code">US</span>
        </div>
      </header>

      <div class="workspace-grid">
        <details class="search-composer" open>
          <summary class="composer-summary">
            <span class="composer-context" data-role="composer-context">US 区</span>
            <span class="composer-edit">编辑搜索</span>
            <span class="composer-collapse">收起</span>
          </summary>
          <section class="rail-card">
            <div class="composer-bar">
              <label class="field storefront-field">
                <span class="visually-hidden">App Store 区域</span>
                <select aria-label="App Store 区域" data-role="country">
                  <option value="us">美国 · US</option>
                  <option value="cn">中国大陆 · CN</option>
                  <option value="hk">中国香港 · HK</option>
                  <option value="tw">中国台湾 · TW</option>
                  <option value="jp">日本 · JP</option>
                  <option value="sg">新加坡 · SG</option>
                  <option value="gb">英国 · GB</option>
                  <option value="au">澳大利亚 · AU</option>
                </select>
              </label>

              <label class="field query-field query-field-quick">
                <span class="visually-hidden">应用名称</span>
                <input
                  type="text"
                  data-role="quick-query"
                  placeholder="输入应用名称，多个用逗号分隔"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>

              <div class="actions">
                <button type="button" data-role="search">开始搜索</button>
                <button type="button" class="secondary-button" data-role="clear">清空结果</button>
              </div>
            </div>

            <button
              type="button"
              class="batch-toggle"
              data-role="batch-toggle"
              aria-expanded="false"
              aria-controls="batch-query-panel"
            >批量编辑</button>

            <div class="batch-editor" id="batch-query-panel" data-role="batch-panel" hidden>
              <label class="field query-field query-field-batch">
                <span>批量应用名称</span>
                <textarea
                  rows="4"
                  data-role="batch-query"
                  placeholder="每行一个应用名称，也可用逗号分隔"
                ></textarea>
              </label>
            </div>
          </section>
        </details>

        <section class="content-panel">
          <div class="results-panel-head">
            <h2>商店页信息</h2>
            <p class="results-summary" data-role="summary">尚未检索</p>
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
  app.querySelector<HTMLTextAreaElement>('[data-role="batch-query"]'),
  "search textarea",
);
const quickInput = requireElement(
  app.querySelector<HTMLInputElement>('[data-role="quick-query"]'),
  "quick search input",
);
const batchToggle = requireElement(
  app.querySelector<HTMLButtonElement>('[data-role="batch-toggle"]'),
  "batch editor toggle",
);
const batchPanel = requireElement(
  app.querySelector<HTMLElement>('[data-role="batch-panel"]'),
  "batch editor panel",
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
const countrySelect = requireElement(app.querySelector<HTMLSelectElement>('[data-role="country"]'), "country selector");
const composer = requireElement(app.querySelector<HTMLDetailsElement>(".search-composer"), "search composer");
const composerSummary = requireElement(app.querySelector<HTMLElement>(".composer-summary"), "composer summary");
let selectedCountry: StoreCountry = "us";
let responseCountry: StoreCountry = "us";
let searchGeneration = 0;
let hasSearched = false;

function syncComposerSummary() {
  const count = parseQueries(textarea.value).length;
  const context = requireElement(app.querySelector('[data-role="composer-context"]'), "composer context");
  const country = selectedCountry.toUpperCase();
  context.textContent = count > 0 ? `${count} 个应用名称 · ${country} 区` : `${country} 区`;
}

function normalizeQueryBreaks(value: string) {
  return value.replace(/\s*[\r\n]+\s*/g, ", ");
}

function syncCanonicalFromQuick() {
  if (textarea.value !== quickInput.value) textarea.value = quickInput.value;
  syncComposerSummary();
}

function setBatchOpen(open: boolean, moveFocus = true) {
  batchPanel.hidden = !open;
  batchToggle.setAttribute("aria-expanded", String(open));
  batchToggle.textContent = open ? "收起批量编辑" : "批量编辑";

  if (!moveFocus) return;
  if (open) {
    textarea.focus();
  } else {
    batchToggle.focus();
  }
}

quickInput.addEventListener("input", () => {
  const raw = quickInput.value;

  if (/[\r\n]/.test(raw)) {
    const caret = quickInput.selectionStart ?? raw.length;
    const normalized = normalizeQueryBreaks(raw);
    const caretBefore = normalizeQueryBreaks(raw.slice(0, caret)).length;
    quickInput.value = normalized;
    quickInput.setSelectionRange(caretBefore, caretBefore);
  }

  syncCanonicalFromQuick();
});

quickInput.addEventListener("paste", (event) => {
  const pasted = event.clipboardData?.getData("text/plain") ?? "";
  if (!/[\r\n]/.test(pasted)) return;

  event.preventDefault();
  const start = quickInput.selectionStart ?? quickInput.value.length;
  const end = quickInput.selectionEnd ?? start;
  const normalized = normalizeQueryBreaks(pasted);
  const before = quickInput.value.slice(0, start);
  const after = quickInput.value.slice(end);
  const prefix = before && !/[\s,]$/.test(before) ? ", " : "";
  const suffix = after && !/^[\s,]/.test(after) ? ", " : "";
  const insertion = `${prefix}${normalized}${suffix}`;
  quickInput.value = before + insertion + after;
  const caret = start + insertion.length;
  quickInput.setSelectionRange(caret, caret);
  syncCanonicalFromQuick();
});

quickInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  button.click();
});

batchToggle.addEventListener("click", () => {
  setBatchOpen(Boolean(batchPanel.hidden));
});

textarea.addEventListener("input", () => {
  quickInput.value = parseQueries(textarea.value).join(", ");
  syncComposerSummary();
});

function updateSummary(items: SearchResult[], searched: boolean) {
  if (!searched) {
    summary.textContent = "尚未检索";
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
    `已匹配 ${matched} · ` +
    `待确认 ${uncertain} · ` +
    `有截图 ${withScreenshots} · ` +
    `未解决 ${failed}`;
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

  const toggleGroup = document.createElement("div");
  toggleGroup.className = "filter-group filter-group-toggles";
  toggleGroup.setAttribute("role", "group");
  toggleGroup.setAttribute("aria-label", "结果筛选");
  toggleGroup.append(createFilterButton("screenshots-filter", "off", "仅看有截图"));
  toggleGroup.append(createFilterButton("iap-filter", "off", "命中 4.99 / 9.99"));
  toggleCluster.append(toggleGroup);

  bar.append(statusCluster, toggleCluster);
  return bar;
}

function createEmptyState(title: string, filtered = false) {
  const state = document.createElement("section");
  state.className = `empty-state${filtered ? " is-filtered" : ""}`;

  const mark = document.createElement("div");
  mark.className = "empty-state-mark";
  state.append(mark);

  const heading = document.createElement("h3");
  heading.textContent = title;
  state.append(heading);

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
  if (iapFilter) {
    iapFilter.classList.toggle("is-active", filters.iapMatchedOnly);
    iapFilter.disabled = selectedCountry !== "us";
    iapFilter.textContent = selectedCountry === "us" ? "命中 4.99 / 9.99" : "美元价格筛选仅美国区";
  }
}

function updateResultsView() {
  if (!hasSearched) {
    renderResults(results, [], false);
    filterBar.hidden = true;
    results.classList.add("is-idle");
    syncFilterUi();
    updateSummary([], false);
    results.replaceChildren(
      createEmptyState("输入应用名称后显示结果"),
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
    renderResults(results, [], false);
    results.replaceChildren(
      createEmptyState(
        "没有符合当前筛选的结果",
        true,
      ),
    );
    void refreshMotion("empty");
    return;
  }

  renderResults(results, filtered, hasSearched, { country: responseCountry });
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
  const generation = ++searchGeneration;
  const names = parseQueries(textarea.value);
  syncComposerSummary();

  if (names.length === 0) {
    composer.open = true;
    hasSearched = false;
    allResults = [];
    filters.status = "all";
    filters.screenshotsOnly = false;
    filters.iapMatchedOnly = false;
    syncFilterUi();
    updateResultsView();
    return;
  }

  if (composer.contains(document.activeElement)) composerSummary.focus();
  composer.open = false;
  hasSearched = true;
  allResults = [];
  renderResults(results, [], false);
  results.innerHTML = `<p class="empty">检索中...</p>`;
  summary.textContent = `正在查询 ${names.length} 个应用...`;

  try {
    const response = await searchApps(names, selectedCountry);
    if (generation !== searchGeneration) return;
    responseCountry = response.country;
    allResults = response.results;
    updateResultsView();
  } catch {
    if (generation !== searchGeneration) return;
    summary.textContent = "检索失败";
    results.innerHTML = `<p class="result-message">请求失败，请稍后重试</p>`;
  }
});

clearButton.addEventListener("click", () => {
  searchGeneration++;
  setBatchOpen(false, false);
  textarea.value = "";
  quickInput.value = "";
  composer.open = true;
  syncComposerSummary();
  hasSearched = false;
  allResults = [];
  filters.status = "all";
  filters.screenshotsOnly = false;
  filters.iapMatchedOnly = false;
  syncFilterUi();
  updateResultsView();
  quickInput.focus();
});

countrySelect.addEventListener("change", () => {
  searchGeneration++;
  selectedCountry = countrySelect.value as StoreCountry;
  syncComposerSummary();
  hasSearched = false;
  allResults = [];
  filters.status = "all";
  filters.screenshotsOnly = false;
  filters.iapMatchedOnly = false;
  app.querySelectorAll('[data-role="country-code"]').forEach((label) => {
    label.textContent = selectedCountry.toUpperCase();
  });
  updateResultsView();
  summary.textContent = `已切换至 ${selectedCountry.toUpperCase()} 区`;
});

decorateActionButtons();
results.before(filterBar);
syncFilterUi();
bindFilterEvents();
updateResultsView();
void refreshMotion("boot");
