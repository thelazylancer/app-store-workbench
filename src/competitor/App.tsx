import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType, useSearchParams } from "react-router";
import type { DayDetail } from "../../shared/competitorTypes";
import { useQueryFilters, type QueryFilters } from "../app/useQueryFilters";
import { useDocumentTitle } from "../app/useDocumentTitle";
import { CompetitorApiError, getCompetitorDay, getCompetitorDays } from "../lib/competitorApi";
import { yesterdayUtc, type ViewMode } from "./format";
import { Controls } from "./Controls";
import { EmptyCard, LoadError, LoadingTimeline } from "./states";
import { Timeline } from "./Timeline";
import { abnormalDays, scopeDays, visibleCount } from "./selectors";
import "./styles/home.css";
import "./styles/timeline.css";
import "./styles/team.css";

const HISTORY_START = "2020-01-01";
/** The browser cannot restore scroll before the async list renders; we save and replay it. */
const SCROLL_KEY = "competitor-home-scroll";

function errorMessage(error: unknown): string {
  return error instanceof CompetitorApiError ? error.message : "请求失败";
}

// shortcut: one request per day that already has packages; switch to a range payload when it includes each day's packages.
async function fetchWindow(): Promise<DayDetail[]> {
  const summaries = await getCompetitorDays(HISTORY_START, yesterdayUtc());
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

export function CompetitorHomePage() {
  useDocumentTitle("竞品日报 · App搜索工作台");
  const { filters, update, clear } = useQueryFilters();
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const navigationType = useNavigationType();
  const restoredRef = useRef(false);
  const view: ViewMode = params.get("view") === "shots" ? "shots" : "list";
  const [days, setDays] = useState<DayDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const daysRef = useRef(days);
  const windowLoadedRef = useRef(false);
  const missingRef = useRef(new Set<string>());
  const tokenRef = useRef(0);
  const seenReload = useRef(-1);

  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  const dateIsReady = (date: string | null): boolean => {
    if (date === null) return windowLoadedRef.current;
    return daysRef.current.some((day) => day.date === date) || missingRef.current.has(date);
  };

  const load = async (focus: string | null): Promise<void> => {
    const token = ++tokenRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      if (focus) {
        const detail = await getCompetitorDay(focus, "first_ad");
        if (token !== tokenRef.current) return;
        missingRef.current.delete(focus);
        setDays((current) => windowLoadedRef.current
          ? [...current.filter((day) => day.date !== detail.date), detail].sort((a, b) => b.date.localeCompare(a.date))
          : [detail]);
      } else {
        const next = await fetchWindow();
        if (token !== tokenRef.current) return;
        setDays(next);
        windowLoadedRef.current = true;
        missingRef.current.clear();
      }
    } catch (error) {
      if (token !== tokenRef.current) return;
      if (focus && error instanceof CompetitorApiError && error.status === 404) {
        missingRef.current.add(focus);
        if (!windowLoadedRef.current) setDays([]);
      } else if (focus && windowLoadedRef.current) {
        setLoadError(errorMessage(error));
      } else {
        setDays([]);
        if (!focus) windowLoadedRef.current = false;
        setLoadError(errorMessage(error));
      }
    }
    if (token !== tokenRef.current) return;
    setLoading(false);
  };

  useEffect(() => {
    const focused = filters.date;
    const forced = seenReload.current !== reload;
    seenReload.current = reload;
    if (!forced && dateIsReady(focused)) return;
    void load(focused);
    // Filters only change the fetch when the date is outside the loaded window.
  }, [filters.date, reload]);

  // Keyed by the current query so each filter/view combination keeps its own position.
  // Saved on scroll only: the unmount cleanup runs after the next page clamps scroll to 0.
  useEffect(() => {
    const key = `${SCROLL_KEY}:${search}`;
    const save = () => {
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        // Storage can be blocked; scrolling still works, only restoration is lost.
      }
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [search]);

  const scoped = scopeDays(days, filters);
  const rawCount = scoped.reduce((sum, day) => sum + day.packages.length, 0);
  const shownRows = visibleCount(days, filters);
  const abnormal = abnormalDays(scoped);
  const hasDays = !loading && !loadError && scoped.length > 0 && rawCount > 0;

  useEffect(() => {
    if (restoredRef.current || !hasDays || navigationType !== "POP") return;
    restoredRef.current = true;
    let target = 0;
    try {
      target = Number(sessionStorage.getItem(`${SCROLL_KEY}:${search}`) ?? 0);
    } catch {
      target = 0;
    }
    if (target > 0) window.scrollTo({ top: target, left: 0 });
  }, [hasDays, navigationType, search]);

  let batchText = "";
  if (loading) batchText = "正在加载…";
  else if (!loadError && scoped.length > 0) {
    batchText = abnormal.length === 0
      ? scoped.length === 1 ? `批次正常 · 批次 ${scoped[0]!.date}` : `批次正常 · ${scoped.length} 天`
      : scoped.length === 1 ? `批次异常 · 批次 ${scoped[0]!.date}` : `批次异常 · ${abnormal.length} 天`;
  }

  const onChange = (patch: Partial<QueryFilters>) => update(patch);
  const onViewChange = (next: ViewMode) => setParams((current) => {
    const nextParams = new URLSearchParams(current);
    if (next === "shots") nextParams.set("view", "shots");
    else nextParams.delete("view");
    return nextParams;
  }, { replace: true });
  const retry = () => setReload((value) => value + 1);

  return (
    <section className="wx-report" data-role="list-view">
      <Controls
        days={days}
        loading={loading}
        filters={filters}
        view={view}
        onChange={onChange}
        onViewChange={onViewChange}
        onClear={clear}
      />

      {!loading && !loadError && abnormal.length > 0 ? (
        <p className="wx-exception-banner" data-role="batch-banner">
          {abnormal.map((day) => day.date).join("、")} 的批次可能不完整。
        </p>
      ) : null}

      <div className="wx-body" data-role="report-body" aria-live="polite">
        {loading ? <LoadingTimeline /> : null}
        {!loading && loadError ? (
          <LoadError focused={filters.date} message={loadError} onRetry={retry} />
        ) : null}
        {!loading && !loadError && !hasDays ? (
          <EmptyCard
            role="empty-day"
            title={filters.date ? "这一天还没有快照" : "还没有快照"}
            lines={[filters.date ? `${filters.date} 没有成功完成的批次。` : "还没有成功完成的批次。"]}
            actions={filters.date
              ? [{ label: "看全部日期", role: "clear-date", onClick: () => update({ date: null }) }]
              : [{ label: "重试", role: "retry-load", onClick: retry }]}
          />
        ) : null}
        {hasDays ? (
          <>
            <Timeline days={days} filters={filters} view={view} />
            {shownRows === 0 ? (
              <EmptyCard
                role="empty-filter"
                title="没有符合当前筛选的包"
                actions={[{ label: "清除筛选", role: "empty-clear-filter", onClick: clear }]}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <footer className="wx-foot">
        <p className="wx-foot-status" data-role="batch-summary">
          {batchText ? (
            <>
              <span className="wx-batch-dot" aria-hidden="true" />
              {batchText}
            </>
          ) : null}
        </p>
      </footer>
    </section>
  );
}

export default CompetitorHomePage;
