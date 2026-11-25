import type { WeeklyMetricSeries } from "../../shared/weeklyReportTypes";
import { formatDay } from "./format";

/** This-week version/delivery numbers for all resolved packages in one row. */
export function MetricFacts({
  metrics,
  weekStart,
}: {
  metrics: WeeklyMetricSeries[];
  weekStart: string;
}) {
  return (
    <section
      className="wx-weekly-section"
      aria-labelledby="weekly-metric-facts-title"
      data-role="weekly-metric-facts"
    >
      <div className="wx-weekly-section-head">
        <h3 id="weekly-metric-facts-title" className="wx-weekly-h3">版本与投放（本周）</h3>
        <p className="wx-weekly-section-meta">
          全体已解析包 · 近 4 周走势见「过去 4 周趋势」
        </p>
      </div>
      <dl className="wx-weekly-facts-grid">
        {metrics.map((series) => {
          const point = series.overall.find((item) => item.weekStart === weekStart);
          return (
            <div className="wx-weekly-fact-item" key={series.key} data-metric={series.key}>
              <dt>{series.title}</dt>
              <dd>
                {point ? (
                  <>
                    <span className="wx-weekly-mono">{formatDay(point.value)}</span> 天
                  </>
                ) : (
                  <span className="wx-weekly-muted">—</span>
                )}
                {point && series.key === "avgAdToOfflineDays" ? (
                  <span className="wx-weekly-fact-context">
                    已下架 {point.offlineCount}/{point.packageCount}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
