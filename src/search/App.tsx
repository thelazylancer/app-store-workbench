import { Text } from "@astryxdesign/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSearchQuery, SearchResult, StoreCountry } from "../../shared/types";
import { useDocumentTitle } from "../app/useDocumentTitle";
import { searchApps } from "../lib/api";
import { filterResults, type ResultFilters, type ResultStatusFilter } from "../lib/filterResults";
import { initMotion } from "../lib/motion";
import { Composer, type FocusRequest, type QueryRow, type Validation } from "./Composer";
import { FilterBar } from "./FilterBar";
import {
  defaultSelectedIndex,
  getStatusCounts,
  summarize,
} from "./format";
import { Inspector } from "./Inspector";
import { ResultsQueue } from "./ResultsQueue";
import { SearchEmptyState, SearchError, SearchLoading } from "./states";
import "./styles/results.css";

const DEFAULT_FILTERS: ResultFilters = {
  status: "all",
  screenshotsOnly: false,
  iapMatchedOnly: false,
};

function initialRows(): QueryRow[] {
  const bundle = new URLSearchParams(window.location.search).get("bundle")?.trim() ?? "";
  return [{ id: 0, name: "", bundleId: bundle }];
}

export function SearchPage() {
  useDocumentTitle("App Store 搜索 · App 搜索工作台");
  const [rows, setRows] = useState<QueryRow[]>(initialRows);
  const [country, setCountry] = useState<StoreCountry>("us");
  const [filters, setFilters] = useState<ResultFilters>(DEFAULT_FILTERS);
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [responseCountry, setResponseCountry] = useState<StoreCountry>("us");
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [summaryNote, setSummaryNote] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [composerOpen, setComposerOpen] = useState(true);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);

  const pageRef = useRef<HTMLElement>(null);
  const rowId = useRef(1);
  const focusSeq = useRef(0);
  const searchGeneration = useRef(0);

  const filtered = useMemo(() => filterResults(allResults, filters), [allResults, filters]);
  const counts = useMemo(() => getStatusCounts(allResults), [allResults]);
  const activeIndex = selectedIndex < filtered.length ? selectedIndex : 0;

  useEffect(() => {
    setSelectedIndex(defaultSelectedIndex(filtered));
  }, [filtered]);

  const motionMode = hasSearched && !loading && !loadFailed && filtered.length > 0 ? "results" : "empty";

  useEffect(() => {
    if (pageRef.current && typeof window.matchMedia === "function") {
      initMotion(pageRef.current, motionMode);
    }
  }, [motionMode, filtered, selectedIndex, hasSearched, loading, loadFailed]);

  function requestFocus(index: number) {
    focusSeq.current += 1;
    setFocusRequest({ index, seq: focusSeq.current });
  }

  function resetResults() {
    searchGeneration.current += 1;
    setHasSearched(false);
    setAllResults([]);
    setSelectedIndex(0);
    setFilters(DEFAULT_FILTERS);
    setLoading(false);
    setLoadFailed(false);
    setPendingCount(0);
    setSummaryNote(null);
  }

  function handleRowChange(id: number, field: "name" | "bundleId", value: string) {
    setValidation(null);
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function handleAddRow() {
    const id = rowId.current++;
    setRows((current) => [...current, { id, name: "", bundleId: "" }]);
    requestFocus(rows.length);
  }

  function handleRemoveRow(id: number) {
    if (rows.length === 1) {
      return;
    }

    const index = rows.findIndex((row) => row.id === id);
    const next = rows.filter((row) => row.id !== id);
    setRows(next);
    setValidation(null);
    requestFocus(Math.min(index, next.length - 1));
  }

  async function handleSearch() {
    const generation = ++searchGeneration.current;
    const queries: AppSearchQuery[] = [];
    const invalidIds = new Set<number>();
    let firstInvalidIndex = -1;

    rows.forEach((row, index) => {
      const name = row.name.trim();
      const bundleId = row.bundleId.trim();
      if (!name && !bundleId) {
        invalidIds.add(row.id);
        if (firstInvalidIndex === -1) firstInvalidIndex = index;
        return;
      }
      queries.push(name ? (bundleId ? { name, bundleId } : { name }) : { bundleId });
    });

    if (invalidIds.size > 0) {
      setValidation({ message: "应用名称与 Bundle ID 至少填一项", invalidIds });
      setComposerOpen(true);
      setSummaryNote(null);
      setLoading(false);
      setLoadFailed(false);
      setPendingCount(0);
      setHasSearched(allResults.length > 0);
      requestFocus(firstInvalidIndex);
      return;
    }

    setValidation(null);
    setComposerOpen(false);
    setSummaryNote(null);

    if (queries.length === 0) {
      resetResults();
      return;
    }

    setHasSearched(true);
    setLoading(true);
    setLoadFailed(false);
    setAllResults([]);
    setSelectedIndex(0);
    setPendingCount(queries.length);

    try {
      const response = await searchApps(queries, country);
      if (generation !== searchGeneration.current) return;
      setResponseCountry(response.country);
      setAllResults(response.results);
      setLoading(false);
    } catch {
      if (generation !== searchGeneration.current) return;
      setLoading(false);
      setLoadFailed(true);
    }
  }

  function handleClear() {
    resetResults();
    setRows([{ id: rowId.current++, name: "", bundleId: "" }]);
    setValidation(null);
    setComposerOpen(true);
    requestFocus(0);
  }

  function handleCountryChange(next: StoreCountry) {
    resetResults();
    setCountry(next);
    setValidation(null);
    setSummaryNote(`已切换至 ${next.toUpperCase()} 区`);
  }

  function handleStatusChange(status: ResultStatusFilter) {
    setSummaryNote(null);
    setFilters((current) => ({ ...current, status }));
  }

  function handleToggleScreenshots() {
    setSummaryNote(null);
    setFilters((current) => ({ ...current, screenshotsOnly: !current.screenshotsOnly }));
  }

  function handleToggleIap() {
    if (country !== "us") {
      return;
    }
    setSummaryNote(null);
    setFilters((current) => ({ ...current, iapMatchedOnly: !current.iapMatchedOnly }));
  }

  const summary = loading
    ? `正在查询 ${pendingCount} 个应用...`
    : loadFailed
      ? "检索失败"
      : !hasSearched
        ? (summaryNote ?? "尚未检索")
        : summarize(filtered);

  const content =
    loading ? (
      <SearchLoading />
    ) : loadFailed ? (
      <SearchError />
    ) : !hasSearched ? (
      <SearchEmptyState title="输入应用名称或 Bundle ID 后显示结果" />
    ) : filtered.length === 0 ? (
      <SearchEmptyState title="没有符合当前筛选的结果" filtered />
    ) : (
      <div className="results-workbench">
        <ResultsQueue results={filtered} selectedIndex={activeIndex} onSelect={setSelectedIndex} />
        <Inspector result={filtered[activeIndex]!} country={responseCountry} />
      </div>
    );

  return (
    <section ref={pageRef} className="wx-search-page">
      <div className="wx-workspace-grid">
        <Composer
          rows={rows}
          country={country}
          open={composerOpen}
          validation={validation}
          focusRequest={focusRequest}
          onOpenChange={setComposerOpen}
          onCountryChange={handleCountryChange}
          onRowChange={handleRowChange}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          onSearch={handleSearch}
          onClear={handleClear}
        />

        <section className="wx-content-panel">
          <div className="wx-results-head">
            <h2>商店页信息</h2>
            <Text as="p" type="code" className="results-summary" data-role="summary">
              {summary}
            </Text>
          </div>

          <FilterBar
            filters={filters}
            counts={counts}
            country={country}
            visible={hasSearched}
            onStatusChange={handleStatusChange}
            onToggleScreenshots={handleToggleScreenshots}
            onToggleIap={handleToggleIap}
          />

          <section className="wx-results" aria-live="polite" aria-busy={loading}>
            {content}
          </section>
        </section>
      </div>
    </section>
  );
}
