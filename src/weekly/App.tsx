import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { WeeklyReportResponse } from "../../shared/weeklyReportTypes";
import { useDocumentTitle } from "../app/useDocumentTitle";
import { addDays } from "../lib/reportDate";
import { WeeklyApiError, getWeeklyReport } from "../lib/weeklyApi";
import { WeeklyEmpty, WeeklyError, WeeklyLoading } from "./states";
import { BatchNote, WeekHeader } from "./WeekHeader";
import { Summary } from "./Summary";
import { TeamCards } from "./TeamCards";
import { MetricBars } from "./MetricBars";
import { MetricFacts } from "./MetricFacts";
import { StructureBars } from "./StructureBars";
import { TrendBars } from "./TrendBars";
import { Highlights } from "./Highlights";
import { batchStatusLabel, type BatchStatus } from "./format";
import { useWeeklyWeek } from "./filters";
import "../shelf/styles/charts.css";
import "../shelf/styles/metrics.css";
import "./styles/weekly.css";
import "./styles/weekly-charts.css";

function errorCopy(error: unknown) {
  const status = error instanceof WeeklyApiError ? error.status : null;
  if (status === 400) {
    return {
      title: "周参数无效",
      description: "请选择一个完整的 ISO 周。",
      action: "回到最近一周",
      status,
    };
  }
  if (status === 503) {
    return {
      title: "周报服务暂不可用",
      description: "服务端未配置数据库或暂不可用。",
      action: "重试",
      status,
    };
  }
  return {
    title: "周报加载失败",
    description: error instanceof Error ? error.message : "请求失败",
    action: "重试",
    status,
  };
}

function Group({
  id,
  title,
  meta,
  children,
}: {
  id: "overview" | "teams" | "trends";
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="wx-weekly-group" aria-labelledby={`weekly-group-${id}`} data-role="weekly-group" data-group={id}>
      <div className="wx-weekly-group-head">
        <h2 id={`weekly-group-${id}`} className="wx-weekly-group-title">{title}</h2>
        {meta ? <p className="wx-weekly-section-meta">{meta}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Footnote({ summary }: { summary: WeeklyReportResponse["summary"] }) {
  return (
    <footer className="wx-weekly-footnote">
      <p data-role="weekly-footnote">
        本周共入库 <span className="wx-weekly-mono">{summary.ingestedPackages}</span> 个包，其中{" "}
        <span className="wx-weekly-mono">{summary.unresolvedPackages}</span> 个未解析，未计入统计；数据截至{" "}
        <span className="wx-weekly-mono">{summary.dataThrough ?? "—"}</span>，批次状态{" "}
        {batchStatusLabel(summary.batchStatus as BatchStatus)}。
      </p>
    </footer>
  );
}

export function WeeklyPage() {
  useDocumentTitle("竞品周动态 · App搜索工作台");
  const { week, setWeek } = useWeeklyWeek();
  const [report, setReport] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  // Kept across failures so "next week" stays bounded even when the current fetch fails.
  const [latestCompleteWeek, setLatestCompleteWeek] = useState<string | null>(null);
  // Cleared when a fetch starts, so a cancelled request cannot leave the guard
  // pointing at a week whose report we no longer hold.
  const loaded = useRef<{ week: string; reload: number } | null>(null);

  useEffect(() => {
    // Writing the server-normalized week back to the URL must not trigger a second fetch.
    if (week && loaded.current?.week === week && loaded.current.reload === reload) return;

    let cancelled = false;
    loaded.current = null;
    setReport(null);
    setError(null);
    setLoading(true);

    getWeeklyReport(week ?? undefined)
      .then((data) => {
        if (cancelled) return;
        loaded.current = { week: data.weekStart, reload };
        setReport(data);
        setLatestCompleteWeek(data.latestCompleteWeek);
        if (week !== data.weekStart) setWeek(data.weekStart);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [week, reload, setWeek]);

  const weekStart = week ?? report?.weekStart ?? null;
  const weekEnd = weekStart ? addDays(weekStart, 6) : null;
  const latestWeek = report?.latestCompleteWeek ?? latestCompleteWeek;
  const copy = error ? errorCopy(error) : null;

  const goPrevious = () => {
    if (weekStart) setWeek(addDays(weekStart, -7));
  };
  const goNext = () => {
    if (weekStart) setWeek(addDays(weekStart, 7));
  };
  const retry = () => {
    if (copy?.status === 400) setWeek(null);
    else setReload((value) => value + 1);
  };

  const empty = report !== null && report.summary.resolvedPackages === 0;
  const emptyDescription = report !== null && report.summary.ingestedPackages > 0
    ? `本周入库 ${report.summary.ingestedPackages} 个包，但都没有命中 App Store，未计入统计。`
    : "本周没有入库包。";

  return (
    <section className="wx-weekly" data-role="weekly-view">
      <WeekHeader
        weekStart={weekStart}
        latestCompleteWeek={latestWeek}
        dataThrough={report?.summary.dataThrough ?? null}
        batchStatus={report?.summary.batchStatus ?? null}
        isLoading={loading}
        onPrevious={goPrevious}
        onNext={goNext}
      />

      {report ? <BatchNote status={report.summary.batchStatus} /> : null}

      {loading ? <WeeklyLoading week={weekStart} weekEnd={weekEnd} /> : null}

      {!loading && copy ? (
        <WeeklyError
          title={copy.title}
          description={copy.description}
          actionLabel={copy.action}
          onAction={retry}
        />
      ) : null}

      {!loading && !copy && empty && report ? (
        <>
          <WeeklyEmpty
            description={emptyDescription}
            onPrevious={() => setWeek(addDays(report.weekStart, -7))}
          />
          <Footnote summary={report.summary} />
        </>
      ) : null}

      {!loading && !copy && report && !empty ? (
        <>
          <Group id="overview" title="整体情况">
            <Summary summary={report.summary} weekStart={report.weekStart} weekEnd={report.weekEnd} />
            <StructureBars
              versionCounts={report.versionCounts}
              distributions={report.distributions}
              total={report.summary.resolvedPackages}
            />
            <MetricFacts metrics={report.trends.metrics} weekStart={report.weekStart} />
            <Highlights highlights={report.highlights} />
          </Group>
          <Group
            id="teams"
            title="团队情况"
            meta={
              <>
                <span className="wx-weekly-mono">{report.summary.teamCount}</span> 个团队 ·{" "}
                <span className="wx-weekly-mono">{report.summary.resolvedPackages}</span> 个已解析包
              </>
            }
          >
            <TeamCards
              teams={report.teams}
              total={report.summary.resolvedPackages}
              weeks={report.trends.weeks}
              metrics={report.trends.metrics}
            />
          </Group>
          <Group id="trends" title="过去 4 周趋势">
            <TrendBars weeks={report.trends.weeks} />
            <MetricBars
              weeks={report.trends.weeks}
              metrics={report.trends.metrics}
              teams={report.teams.map((team) => team.team)}
            />
          </Group>
          <Footnote summary={report.summary} />
        </>
      ) : null}
    </section>
  );
}

export default WeeklyPage;
