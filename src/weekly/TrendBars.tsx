import type { WeeklyTrendWeek } from "../../shared/weeklyReportTypes";

function trendAriaLabel(weeks: WeeklyTrendWeek[]): string {
  const parts = weeks.map((week) => (
    week.dataSufficient
      ? `${week.weekStart.slice(5)} ${week.resolvedPackages} 包`
      : `${week.weekStart.slice(5)} 数据不足`
  ));
  return `近 4 周已解析新增趋势。${parts.join("；")}。`;
}

export function TrendBars({ weeks }: { weeks: WeeklyTrendWeek[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.resolvedPackages));
  const lastIndex = weeks.length - 1;

  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-trend-title">
      <div className="wx-weekly-section-head">
        <h2 id="weekly-trend-title" className="wx-weekly-h2">近 4 周新增趋势</h2>
        <p className="wx-weekly-section-meta">已解析新增包数 · 最后一根为本周</p>
      </div>
      <figure className="wx-weekly-trend-figure">
        <div
          className="wx-weekly-trend-plot"
          role="img"
          aria-label={trendAriaLabel(weeks)}
          data-role="weekly-trend"
        >
          {weeks.map((week) => (
            <div className="wx-weekly-trend-slot" key={week.weekStart}>
              <div className="wx-weekly-trend-track">
                {week.dataSufficient ? (
                  <div
                    className="wx-weekly-trend-column"
                    style={{ height: `${(week.resolvedPackages / max) * 100}%` }}
                    data-role="weekly-trend-bar"
                    data-week={week.weekStart}
                    data-value={week.resolvedPackages}
                  >
                    <span className="wx-weekly-trend-value" aria-hidden="true">
                      {week.resolvedPackages}
                    </span>
                    <span className="wx-weekly-trend-bar" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="wx-weekly-trend-gap-wrap" data-role="weekly-trend-gap-wrap">
                    <span className="wx-weekly-trend-insufficient" aria-hidden="true">数据不足</span>
                    <span
                      className="wx-weekly-trend-gap"
                      data-role="weekly-trend-gap"
                      data-week={week.weekStart}
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="wx-weekly-trend-labels" aria-hidden="true">
          {weeks.map((week, index) => (
            <div className="wx-weekly-trend-label" key={week.weekStart}>
              <span className="wx-weekly-date-full">{week.weekStart}</span>
              <span className="wx-weekly-date-short">{week.weekStart.slice(5)}</span>
              <span className="wx-weekly-date-full">~ {week.weekEnd}</span>
              <span className="wx-weekly-date-short">~ {week.weekEnd.slice(5)}</span>
              {index === lastIndex ? <span className="wx-weekly-current-week">本周</span> : null}
            </div>
          ))}
        </div>
      </figure>
    </section>
  );
}
