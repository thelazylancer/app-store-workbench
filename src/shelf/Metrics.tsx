import { teamLabel } from "../lib/teamLabel";
import "./styles/metrics.css";
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

/** Compact label: one decimal below 100, whole numbers above. */
function formatMetric(value: number): string {
  return Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

/** Rounds the domain to 1/2/5 x 10^n so ticks land on readable values. */
function metricTicks(values: number[]): { min: number; max: number; ticks: number[] } {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const rawStep = (high - low || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  const step = (norm <= 1.2 ? 1 : norm <= 2.5 ? 2 : norm <= 6 ? 5 : 10) * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.max(step, Math.ceil(high / step) * step);
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 1000; tick += step) ticks.push(Number(tick.toFixed(6)));
  return { min, max, ticks };
}

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
  // Same 72px bar group as the weekly chart; labels only when they fit.
  const showValues = series.length <= 4;
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
            showValues={showValues}
          />
        ))}
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
  showValues: boolean;
};

function MetricRow({ metric, weeks, series, allTeams, byWeek, tip, bind, onSelect, showValues }: MetricRowProps) {
  const value = (weekStart: string, team: string) => byWeek.get(weekStart)?.get(team)?.[metric.key];
  const values = weeks.flatMap((week) =>
    series
      .map((team) => value(week.weekStart, team))
      .filter((entry): entry is number => typeof entry === "number"));
  if (values.length === 0) return null;
  // Absent values are skipped, not zeroed; a negative metric keeps a zero baseline.
  const { min, max, ticks } = metricTicks(values);
  const span = max - min;
  const percent = (value: number) => ((value - min) / span) * 100;
  const zeroPct = percent(0);

  return (
    <div className="wx-metric-row" data-role="metric-row" data-metric={metric.key}>
      <div className="wx-dist-head">
        <h3 className="wx-dist-title">{metric.title}</h3>
      </div>
      <div className="wx-chart-plot wx-metric-plot">
        <div className="wx-metric-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="wx-metric-tick"
              data-role="metric-tick"
              data-tick={tick}
              style={{ bottom: `${percent(tick)}%` }}
            >
              {formatMetric(tick)}
            </span>
          ))}
        </div>
        <div className="wx-metric-area">
        {ticks.map((tick) => (
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
              {series.map((team, index) => {
                const entry = value(week.weekStart, team);
                if (typeof entry !== "number") return null;
                const valuePct = percent(entry);
                const tipId = `${metric.key}:${week.weekStart}:${team}`;
                return (
                  <button
                    type="button"
                    key={team}
                    className={`wx-metric-bar ${teamClass(team, allTeams)}${entry < 0 ? " wx-metric-negative" : ""}`}
                    style={{
                      left: `${((index + 0.5) / series.length) * 100}%`,
                      width: `${100 / series.length}%`,
                      bottom: `${Math.min(valuePct, zeroPct)}%`,
                      height: `${Math.abs(valuePct - zeroPct)}%`,
                    }}
                    aria-label={`${week.weekStart} ~ ${week.weekEnd}，${teamLabel(team)} ${metric.title} ${entry.toFixed(1)}`}
                    data-role="metric-bar"
                    data-metric={metric.key}
                    data-week={week.weekStart}
                    data-team={team}
                    data-value={entry}
                    {...bind(tipId, `${teamLabel(team)} ${entry.toFixed(1)}`)}
                    onClick={() => onSelect({
                      weekStart: week.weekStart,
                      weekEnd: week.weekEnd,
                      team,
                      groupBy: null,
                      key: null,
                      topKeys: [],
                      label: "",
                    })}
                  >
                    {showValues ? (
                      <span className="wx-metric-value" data-role="metric-value">
                        {formatMetric(entry)}
                      </span>
                    ) : null}
                  </button>
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
      <WeekLabels weeks={weeks} />
    </div>
  );
}
