import type { WeeklyMetricSeries, WeeklyTrendWeek } from "../../shared/weeklyReportTypes";
import { ChartTip } from "../shelf/Charts";
import { formatDay, formatMetricPoint } from "./format";
import { useClickTip } from "./useClickTip";

function OverallRow({
  series,
  weeks,
}: {
  series: WeeklyMetricSeries;
  weeks: WeeklyTrendWeek[];
}) {
  const { tip, bind } = useClickTip();
  const lookup = new Map(series.overall.map((point) => [point.weekStart, point]));
  const values = series.overall.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const percent = (value: number) => ((value - min) / span) * 100;
  const zeroPct = percent(0);

  return (
    <div
      className="wx-weekly-overall-row"
      data-role="weekly-metric-overall-row"
      data-metric={series.key}
    >
      <h5 className="wx-dist-title">{series.title}</h5>
      <div className="wx-weekly-overall-plot">
        <span className="wx-weekly-overall-zero" style={{ bottom: `${zeroPct}%` }} aria-hidden="true" />
        {weeks.map((week) => {
          const point = lookup.get(week.weekStart);
          if (!point) {
            return <span className="wx-weekly-overall-slot" key={week.weekStart} />;
          }
          const valuePct = percent(point.value);
          const bottom = Math.min(valuePct, zeroPct);
          const height = Math.abs(valuePct - zeroPct);
          const text = `整体：${formatMetricPoint(series.key, point)}`;
          return (
            <span className="wx-weekly-overall-slot" key={week.weekStart}>
              <button
                type="button"
                className="wx-weekly-overall-column"
                aria-label={`${series.title} · ${text}`}
                data-role="weekly-metric-overall-bar"
                data-metric={series.key}
                data-week={week.weekStart}
                data-value={point.value}
                {...bind(`overall:${series.key}:${week.weekStart}`, text)}
              >
                <span
                  className={`wx-weekly-overall-bar${point.value < 0 ? " wx-weekly-overall-negative" : ""}`}
                  style={{ bottom: `${bottom}%`, height: `${Math.max(height, 1)}%` }}
                >
                  <span className="wx-weekly-overall-value">{formatDay(point.value)}</span>
                </span>
              </button>
            </span>
          );
        })}
        <span className="wx-weekly-overall-tip">
          <ChartTip tip={tip} id={tip?.id ?? ""} />
        </span>
      </div>
    </div>
  );
}

type MetricBarsProps = {
  weeks: WeeklyTrendWeek[];
  metrics: WeeklyMetricSeries[];
};

/** Four-week version/delivery metrics for all resolved packages (no team layer). */
export function MetricBars({ weeks, metrics }: MetricBarsProps) {
  const overallMetrics = metrics.filter((series) => series.overall.length > 0);

  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-metrics-title">
      <div className="wx-weekly-section-head">
        <h3 id="weekly-metrics-title" className="wx-weekly-h3">版本与投放</h3>
        <p className="wx-weekly-section-meta">整体 · 点击柱查看数值 · — 表示无可用包</p>
      </div>
      {overallMetrics.length > 0 ? (
        <div className="wx-weekly-overall" data-role="weekly-metric-overall">
          {overallMetrics.map((series) => (
            <OverallRow key={series.key} series={series} weeks={weeks} />
          ))}
          <div className="wx-weekly-overall-labels" aria-hidden="true">
            {weeks.map((week) => (
              <div key={week.weekStart}>
                <span>{week.weekStart.slice(5)}</span>
                <span>~ {week.weekEnd.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="wx-weekly-metric-empty">近 4 周无可用数据。</p>
      )}
    </section>
  );
}
