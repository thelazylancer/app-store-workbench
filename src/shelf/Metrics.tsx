import { teamLabel } from "../lib/teamLabel";
import type { ShelfTeamWeekStats, ShelfTrendWeek } from "../../shared/shelfTypes";
import type { ShelfSelection } from "./selection";
import {
  ChartTip,
  type ChartTipState,
  WeekLabels,
  teamClass,
  useChartTip,
  useScrollRegion,
} from "./Charts";

type MetricKey = "avgVersionCount" | "avgVersionGapDays" | "avgLatestVersionToAdDays" | "avgAdToOfflineDays";

const METRICS: { key: MetricKey; title: string }[] = [
  { key: "avgVersionCount", title: "平均每包版本数" },
  { key: "avgVersionGapDays", title: "平均版本间隔（天）" },
  { key: "avgLatestVersionToAdDays", title: "最新版本→投放（天）" },
  { key: "avgAdToOfflineDays", title: "投放→下架（天）" },
];

type MetricsBoardProps = {
  weeks: ShelfTrendWeek[];
  stats: ShelfTeamWeekStats[];
  teams: string[]; // all teams in range, stable order → stable colours
  onSelect: (selection: ShelfSelection) => void;
};

/** One chart per version/launch metric, weeks on x and one bar per team. */
export function MetricsBoard({ weeks, stats, teams, onSelect }: MetricsBoardProps) {
  const scroll = useScrollRegion(weeks.length);
  const { tip, bind } = useChartTip();
  const series = [...new Set(stats.map((row) => row.team))]
    .sort((left, right) => left.localeCompare(right, "zh"));
  const byWeek = new Map<string, Map<string, ShelfTeamWeekStats>>();
  for (const row of stats) {
    let week = byWeek.get(row.weekStart);
    if (!week) {
      week = new Map();
      byWeek.set(row.weekStart, week);
    }
    week.set(row.team, row);
  }

  return (
    <div className="wx-chart-scroll wx-dist-scroll" ref={scroll.ref} tabIndex={scroll.tabIndex}>
      <div className="wx-chart-canvas wx-dist-canvas">
        {METRICS.map((metric) => (
          <MetricRow
            key={metric.key}
            metric={metric}
            weeks={weeks}
            series={series}
            allTeams={teams}
            byWeek={byWeek}
            tip={tip}
            bind={bind}
            onSelect={onSelect}
          />
        ))}
        <WeekLabels weeks={weeks} />
      </div>
    </div>
  );
}

type MetricRowProps = {
  metric: { key: MetricKey; title: string };
  weeks: ShelfTrendWeek[];
  series: string[];
  allTeams: string[];
  byWeek: Map<string, Map<string, ShelfTeamWeekStats>>;
  tip: ChartTipState;
  bind: ReturnType<typeof useChartTip>["bind"];
  onSelect: (selection: ShelfSelection) => void;
};

function MetricRow({ metric, weeks, series, allTeams, byWeek, tip, bind, onSelect }: MetricRowProps) {
  const values: number[] = [];
  for (const week of weeks) {
    for (const team of series) {
      const value = byWeek.get(week.weekStart)?.get(team)?.[metric.key];
      if (typeof value === "number") values.push(value);
    }
  }
  if (values.length === 0) return null;
  // Absent values are skipped, not zeroed; a negative metric keeps a zero baseline.
  const max = Math.max(1e-9, ...values);
  const min = Math.min(0, ...values);
  const span = max - min;
  const zeroPct = ((0 - min) / span) * 100;

  return (
    <div className="wx-metric-row" data-role="metric-row" data-metric={metric.key}>
      <div className="wx-dist-head">
        <h3 className="wx-dist-title">{metric.title}</h3>
        <ul className="wx-dist-legend">
          {series.map((team) => (
            <li key={team}>
              <span className={`wx-dist-swatch ${teamClass(team, allTeams)}`} />
              <span className="wx-dist-legend-label">{teamLabel(team)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="wx-chart-plot wx-metric-plot">
        {min < 0 ? <span className="wx-metric-zero" style={{ bottom: `${zeroPct}%` }} aria-hidden="true" /> : null}
        {weeks.map((week) => (
          <div className="wx-chart-slot" key={week.weekStart}>
            <div className="wx-metric-track">
              {series.map((team, index) => {
                const value = byWeek.get(week.weekStart)?.get(team)?.[metric.key];
                if (typeof value !== "number") return null;
                const valuePct = ((value - min) / span) * 100;
                const tipId = `${metric.key}:${week.weekStart}:${team}`;
                return (
                  <button
                    type="button"
                    key={team}
                    className={`wx-metric-bar ${teamClass(team, allTeams)}${value < 0 ? " wx-metric-negative" : ""}`}
                    style={{
                      left: `${(index / series.length) * 100}%`,
                      width: `${100 / series.length}%`,
                      bottom: `${Math.min(valuePct, zeroPct)}%`,
                      height: `${Math.abs(valuePct - zeroPct)}%`,
                    }}
                    aria-label={`${week.weekStart} ~ ${week.weekEnd}，${teamLabel(team)} ${metric.title} ${value.toFixed(1)}`}
                    data-role="metric-bar"
                    data-metric={metric.key}
                    data-week={week.weekStart}
                    data-team={team}
                    data-value={value}
                    {...bind(tipId, `${teamLabel(team)} ${value.toFixed(1)}`)}
                    onClick={() => onSelect({
                      weekStart: week.weekStart,
                      weekEnd: week.weekEnd,
                      team,
                      groupBy: null,
                      key: null,
                      topKeys: [],
                      label: "",
                    })}
                  />
                );
              })}
            </div>
            {series.map((team) => (
              <ChartTip key={team} tip={tip} id={`${metric.key}:${week.weekStart}:${team}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
