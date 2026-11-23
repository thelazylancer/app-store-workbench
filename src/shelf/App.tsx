import { Selector, Text } from "@astryxdesign/core";
import { useEffect, useState } from "react";
import type { ShelfTrendResponse } from "../../shared/shelfTypes";
import { useDocumentTitle } from "../app/useDocumentTitle";
import { addDays, todayUtc } from "../lib/reportDate";
import { ShelfApiError, getShelfTrend } from "../lib/shelfApi";
import { teamLabel } from "../lib/teamLabel";
import { DistributionBoard, WeeklyBarChart, teamClass } from "./Charts";
import { MetricsBoard } from "./Metrics";
import { ShelfDetailDialog } from "./DetailDialog";
import { useShelfFilters } from "./filters";
import type { ShelfSelection } from "./selection";
import { ShelfEmpty, ShelfError, ShelfLoading } from "./states";
import "./styles/shelf.css";
import "./styles/charts.css";

function errorMessage(error: unknown): string {
  return error instanceof ShelfApiError ? error.message : "请求失败";
}

function initialRange(): { from: string; to: string } {
  const to = todayUtc();
  return { from: addDays(to, -90), to };
}

export function ShelfTrendPage() {
  useDocumentTitle("竞品趋势 · App搜索工作台");
  const { filters, update } = useShelfFilters();
  const [range] = useState(initialRange);
  const [trend, setTrend] = useState<ShelfTrendResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [trendReload, setTrendReload] = useState(0);
  const [selection, setSelection] = useState<ShelfSelection | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    setTrendError(null);
    getShelfTrend({ ...range, team: filters.team })
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setTrendError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, filters.team, trendReload]);

  const retry = () => setTrendReload((value) => value + 1);
  const showAllTeams = () => update({ team: null });

  const pageError = trendError;
  const initialLoading = !pageError && trend === null && trendLoading;
  const teamPending = trend !== null && (trend.team ?? null) !== filters.team;
  const bodyLoading = initialLoading || (trendLoading && teamPending);
  const hasData = Boolean(trend && trend.totals.packageCount > 0);
  const empty = !pageError && !bodyLoading && !hasData;
  const total = trend?.totals.packageCount;

  const teams = [...(trend?.teams ?? [])].sort((left, right) => left.localeCompare(right, "zh"));
  const teamOptions = [
    { value: "", label: "全部" },
    ...teams.map((team) => ({ value: team, label: teamLabel(team) })),
  ];
  if (filters.team && !teams.includes(filters.team)) {
    teamOptions.push({ value: filters.team, label: `${teamLabel(filters.team)}（无数据）` });
  }

  return (
    <section className="wx-shelf" data-role="shelf-view">
      <header className="wx-shelf-header">
        <div className="wx-shelf-heading">
          <h1 className="wx-shelf-h1">竞品入库趋势</h1>
          <p className="wx-shelf-meta" data-role="shelf-meta">
            统计范围 <span className="wx-mono">{range.from}</span> ~ <span className="wx-mono">{range.to}</span>
            {" · "}共 <span className="wx-mono">{total ?? "…"}</span> 包
          </p>
        </div>
        <div className="wx-shelf-filter">
          <Text type="supporting" as="span">团队</Text>
          <Selector
            label="团队筛选"
            isLabelHidden
            size="sm"
            options={teamOptions}
            value={filters.team ?? ""}
            onChange={(value) => update({ team: value || null })}
            isDisabled={bodyLoading}
            data-role="team-filter"
          />
        </div>
      </header>

      <p className="visually-hidden" role="status" data-role="shelf-status">
        {trend && !trendLoading ? `已筛选团队：${filters.team ? teamLabel(filters.team) : "全部"}，共 ${trend.totals.packageCount} 包。` : ""}
      </p>

      <div className="wx-shelf-body" aria-busy={trendLoading}>
        {bodyLoading ? <ShelfLoading /> : null}

        {!bodyLoading && pageError ? <ShelfError message={pageError} onRetry={retry} /> : null}

        {empty ? (
          <ShelfEmpty
            title={filters.team ? "该团队没有入库数据" : "还没有入库数据"}
            description={filters.team
              ? `「${teamLabel(filters.team)}」在所选时间范围内没有入库包。`
              : "所选时间范围内没有可展示的入库包。"}
            actionLabel={filters.team ? "查看全部团队" : "重试"}
            actionRole={filters.team ? "shelf-show-all" : "shelf-retry"}
            onAction={filters.team ? showAllTeams : retry}
          />
        ) : null}

        {!bodyLoading && !pageError && hasData && trend ? (
          <>
            <section className="wx-shelf-section" aria-labelledby="shelf-weekly-title">
              <div className="wx-shelf-block-head">
                <h2 id="shelf-weekly-title" className="wx-shelf-h2">每周入库包数</h2>
                <ul className="wx-team-chips" data-role="team-chips" aria-label="按团队筛选">
                  {teams.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        className={`wx-team-chip ${teamClass(name, teams)}`}
                        aria-pressed={filters.team === name}
                        data-role="team-filter-chip"
                        data-team={name}
                        onClick={() => update({ team: filters.team === name ? null : name })}
                      >
                        {teamLabel(name)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <WeeklyBarChart
                weeks={trend.weeks}
                teams={teams}
                team={filters.team}
                onSelect={setSelection}
              />
            </section>

            <section className="wx-shelf-section" aria-labelledby="shelf-distribution-title">
              <div className="wx-shelf-block-head">
                <h2 id="shelf-distribution-title" className="wx-shelf-h2">入库包分布</h2>
              </div>
              <DistributionBoard
                distributions={trend.distributions}
                weeks={trend.weeks}
                from={range.from}
                to={range.to}
                team={filters.team}
                onSelect={setSelection}
              />
            </section>

            <section className="wx-shelf-section" aria-labelledby="shelf-teams-title">
              <div className="wx-shelf-block-head">
                <h2 id="shelf-teams-title" className="wx-shelf-h2">版本与投放（按团队）</h2>
              </div>
              <MetricsBoard
                weeks={trend.weeks}
                stats={trend.teamWeekStats}
                teams={trend.teams}
                onSelect={setSelection}
              />
              <p className="wx-stats-note">
                版本数据来自 App Store 版本历史，版本数只统计已抓到版本记录的包；版本间隔超过 30 天的包不计入均值；「最新版本→投放」为负数表示投放后仍有版本更新；
                「投放→下架」只统计已有下架日期的包。
              </p>
            </section>
          </>
        ) : null}
      </div>

      <ShelfDetailDialog selection={selection} onClose={() => setSelection(null)} />
    </section>
  );
}

export default ShelfTrendPage;
