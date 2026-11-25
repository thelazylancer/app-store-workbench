import { Button } from "@astryxdesign/core";
import { useState } from "react";
import type {
  WeeklyMetricKey,
  WeeklyMetricPoint,
  WeeklyMetricSeries,
  WeeklyTrendWeek,
} from "../../shared/weeklyReportTypes";
import { formatMetric, metricTicks } from "../lib/metricScale";
import { teamLabel } from "../lib/teamLabel";
import { ChartTip, WeekLabels, teamClass, useScrollRegion } from "../shelf/Charts";
import { formatDay } from "./format";
import { useClickTip } from "./useClickTip";

type PointLookup = Map<string, Map<string, WeeklyMetricPoint>>;

function indexPoints(points: WeeklyMetricPoint[]): PointLookup {
  const lookup: PointLookup = new Map();
  for (const point of points) {
    let week = lookup.get(point.weekStart);
    if (!week) {
      week = new Map();
      lookup.set(point.weekStart, week);
    }
    week.set(point.team, point);
  }
  return lookup;
}

/** Current week's ranked teams first, then teams seen only in history (locale order). */
function colorTeamList(teams: string[], metrics: WeeklyMetricSeries[]): string[] {
  const seen = new Set(teams);
  const historical = [...new Set(metrics.flatMap((series) => series.points.map((point) => point.team)))]
    .filter((team) => !seen.has(team))
    .sort((left, right) => left.localeCompare(right, "zh"));
  return [...teams, ...historical];
}

function cellText(series: WeeklyMetricKey, point: WeeklyMetricPoint): string {
  if (series === "avgAdToOfflineDays") {
    return `${formatDay(point.value)} 天（已下架 ${point.offlineCount}/${point.packageCount}）`;
  }
  return formatDay(point.value);
}

function ValuesTable({
  series,
  weeks,
  teams,
  lookup,
  id,
  hidden,
  open,
  ariaHidden,
}: {
  series: WeeklyMetricSeries;
  weeks: WeeklyTrendWeek[];
  teams: string[];
  lookup: PointLookup;
  id: string;
  hidden: boolean;
  open: boolean;
  ariaHidden?: boolean;
}) {
  return (
    <div
      className={hidden ? "visually-hidden" : "wx-weekly-values-wrap"}
      hidden={hidden ? undefined : !open}
      aria-hidden={ariaHidden ? true : undefined}
    >
      <table
        className="wx-weekly-values"
        id={id}
        data-role={hidden ? "weekly-metric-table-hidden" : "weekly-metric-table"}
        data-metric={series.key}
      >
        <caption>{series.title}（近 4 周，按团队）</caption>
        <thead>
          <tr>
            <th scope="col">团队</th>
            {weeks.map((week) => <th key={week.weekStart} scope="col">{week.weekStart}</th>)}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team}>
              <th scope="row">{teamLabel(team)}</th>
              {weeks.map((week) => {
                const point = lookup.get(week.weekStart)?.get(team);
                return (
                  <td key={week.weekStart} className="wx-weekly-mono">
                    {point ? cellText(series.key, point) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricRow({
  series,
  weeks,
  allTeams,
}: {
  series: WeeklyMetricSeries;
  weeks: WeeklyTrendWeek[];
  allTeams: string[];
}) {
  const [open, setOpen] = useState(false);
  const { tip, bind } = useClickTip();
  const lookup = indexPoints(series.points);
  const values = series.points.map((point) => point.value);
  const tableId = `weekly-metric-values-${series.key}`;

  if (values.length === 0) {
    return (
      <div className="wx-metric-row" data-role="weekly-metric-row" data-metric={series.key}>
        <div className="wx-dist-head">
          <h3 className="wx-dist-title">{series.title}</h3>
        </div>
        <p className="wx-weekly-metric-empty">近 4 周无可用数据。</p>
      </div>
    );
  }

  const { min, max, ticks } = metricTicks(values);
  const span = max - min;
  const percent = (value: number) => ((value - min) / span) * 100;
  const zeroPct = percent(0);
  const gridTicks = [...new Set([min, 0, max])].sort((left, right) => left - right);

  return (
    <div className="wx-metric-row" data-role="weekly-metric-row" data-metric={series.key}>
      <div className="wx-dist-head">
        <h3 className="wx-dist-title">{series.title}</h3>
        <Button
          variant="ghost"
          size="sm"
          label={`${series.title} 数值`}
          aria-expanded={open}
          aria-controls={tableId}
          data-role="weekly-metric-toggle"
          data-metric={series.key}
          onClick={() => setOpen((value) => !value)}
        >
          数值
        </Button>
      </div>
      <div className="wx-chart-plot wx-metric-plot wx-weekly-metric-plot">
        <div className="wx-metric-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="wx-metric-tick"
              data-role="weekly-metric-tick"
              data-tick={tick}
              style={{ bottom: `${percent(tick)}%` }}
            >
              {formatMetric(tick)}
            </span>
          ))}
        </div>
        <div
          className="wx-metric-area"
          role="img"
          aria-label={`${series.title}，近 4 周，按团队。${
            series.key === "avgAdToOfflineDays" ? "0 天表示该团队该周没有已下架包；" : ""
          }完整数值见${open ? "下方表格" : "「数值」表格"}。`}
        >
          {gridTicks.map((tick) => (
            <span
              key={tick}
              className={`wx-metric-grid${tick === 0 ? " wx-metric-grid-zero" : ""}`}
              style={{ bottom: `${percent(tick)}%` }}
              aria-hidden="true"
            />
          ))}
          {weeks.map((week) => (
            <div className="wx-chart-slot" key={week.weekStart}>
              <div className="wx-metric-track">
                {allTeams.map((team, index) => {
                  const point = lookup.get(week.weekStart)?.get(team);
                  if (!point) return null;
                  const valuePct = percent(point.value);
                  return (
                    <div
                      key={team}
                      className={`wx-metric-bar wx-weekly-metric-bar ${teamClass(team, allTeams)}${
                        point.value < 0 ? " wx-metric-negative" : ""
                      }`}
                      style={{
                        left: `${((index + 0.5) / allTeams.length) * 100}%`,
                        width: `${100 / allTeams.length}%`,
                        bottom: `${Math.min(valuePct, zeroPct)}%`,
                        height: `${Math.abs(valuePct - zeroPct)}%`,
                      }}
                      data-role="weekly-metric-bar"
                      data-metric={series.key}
                      data-week={week.weekStart}
                      data-team={team}
                      data-value={point.value}
                      aria-hidden="true"
                      {...bind(
                        `${series.key}:${week.weekStart}`,
                        `${teamLabel(team)}：${cellText(series.key, point)}`,
                      )}
                    />
                  );
                })}
              </div>
              <ChartTip tip={tip} id={`${series.key}:${week.weekStart}`} />
            </div>
          ))}
        </div>
      </div>
      <ValuesTable
        series={series}
        weeks={weeks}
        teams={allTeams}
        lookup={lookup}
        id={tableId}
        hidden={false}
        open={open}
      />
      <ValuesTable
        series={series}
        weeks={weeks}
        teams={allTeams}
        lookup={lookup}
        id={`${tableId}-hidden`}
        hidden
        open
        ariaHidden={open}
      />
    </div>
  );
}

type MetricBarsProps = {
  weeks: WeeklyTrendWeek[];
  metrics: WeeklyMetricSeries[];
  teams: string[];
};

export function MetricBars({ weeks, metrics, teams }: MetricBarsProps) {
  const scroll = useScrollRegion(weeks.length);
  const allTeams = colorTeamList(teams, metrics);

  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-metrics-title">
      <div className="wx-weekly-section-head">
        <h2 id="weekly-metrics-title" className="wx-weekly-h2">版本与投放（近 4 周）</h2>
        <p className="wx-weekly-section-meta">只读 · 点击柱查看数值 · — 表示无可用包</p>
      </div>
      <ul className="wx-weekly-team-legend" aria-label="团队图例">
        {allTeams.map((team) => (
            <li key={team}>
              <span className={`wx-dist-swatch ${teamClass(team, allTeams)}`} aria-hidden="true" />
              {teamLabel(team)}
            </li>
        ))}
      </ul>
      <div
        className="wx-chart-scroll wx-dist-scroll wx-weekly-metric-scroll"
        ref={scroll.ref}
        tabIndex={scroll.tabIndex}
        aria-label="指标图横向滚动区域"
      >
        <div className="wx-chart-canvas wx-dist-canvas wx-weekly-metric-canvas">
          {metrics.map((series) => (
            <MetricRow
              key={series.key}
              series={series}
              weeks={weeks}
              allTeams={allTeams}
            />
          ))}
          <WeekLabels weeks={weeks} />
        </div>
      </div>
    </section>
  );
}
