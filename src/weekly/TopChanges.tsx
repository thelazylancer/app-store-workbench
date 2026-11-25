import { SHELF_UNKNOWN_KEY } from "../../shared/shelfTypes";
import type { WeeklyDistributionWeek, WeeklyTrendWeek } from "../../shared/weeklyReportTypes";
import { ChartTip } from "../shelf/Charts";
import { formatPercent, formatPp } from "./format";
import { useClickTip } from "./useClickTip";

function TopPanel({
  id,
  title,
  weeks,
  data,
}: {
  id: "category" | "privacy";
  title: string;
  weeks: WeeklyTrendWeek[];
  data: WeeklyDistributionWeek[];
}) {
  const { tip, bind } = useClickTip();
  const byWeek = new Map(
    data.map((week) => [week.weekStart, new Map(week.buckets.map((bucket) => [bucket.key, bucket]))]),
  );
  const currentWeek = weeks[weeks.length - 1];
  const current = byWeek.get(currentWeek.weekStart);
  const rows = current
    ? [...current.values()]
        .filter((bucket) => bucket.key !== SHELF_UNKNOWN_KEY && bucket.count > 0)
        .sort((a, b) => b.share - a.share)
        .slice(0, 10)
    : [];
  // Baseline is the earliest week in the window that has resolved packages;
  // the oldest week is often empty, so "vs 4 weeks ago" would always be "—".
  const baseWeek = weeks.find((week) => byWeek.has(week.weekStart));
  const base = baseWeek && baseWeek.weekStart !== currentWeek.weekStart
    ? byWeek.get(baseWeek.weekStart)
    : null;
  const baseLabel = baseWeek ? `较 ${baseWeek.weekStart.slice(5)}` : "无对比基准";

  return (
    <section
      className="wx-weekly-top-panel"
      data-role="weekly-top-panel"
      data-chart={id}
      aria-labelledby={`weekly-top-${id}`}
    >
      <div className="wx-weekly-top-head">
        <h4 className="wx-dist-title" id={`weekly-top-${id}`}>{title}</h4>
        <span className="wx-weekly-top-base">{baseLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="wx-weekly-chart-empty">本周没有可用的{id === "category" ? "品类" : "隐私域名"}数据。</p>
      ) : (
        <div className="wx-weekly-top-rows">
          {rows.map((bucket) => {
            const max = Math.max(
              1,
              ...weeks.map((week) => byWeek.get(week.weekStart)?.get(bucket.key)?.share ?? 0),
            );
            const deltaPp = base ? (bucket.share - (base.get(bucket.key)?.share ?? 0)) * 100 : null;
            return (
              <div className="wx-weekly-top-row" key={bucket.key} data-role="weekly-top-row" data-key={bucket.key}>
                <span className="wx-weekly-top-label" title={bucket.label}>{bucket.label}</span>
                <span className="wx-weekly-top-share">
                  {bucket.count} 包 · {formatPercent(bucket.share)}
                </span>
                <span className="wx-weekly-top-spark">
                  {weeks.map((week) => {
                    const point = byWeek.get(week.weekStart)?.get(bucket.key);
                    if (!point || point.count === 0) {
                      return <span className="wx-weekly-top-slot" key={week.weekStart} />;
                    }
                    const text = `${bucket.label} · ${week.weekStart.slice(5)}：${formatPercent(point.share)}`;
                    const tipId = `${id}:${bucket.key}:${week.weekStart}`;
                    return (
                      <button
                        type="button"
                        className="wx-weekly-top-slot"
                        key={week.weekStart}
                        aria-label={text}
                        data-role="weekly-top-bar"
                        data-week={week.weekStart}
                        data-share={point.share}
                        {...bind(tipId, text)}
                      >
                        <span
                          className={`wx-weekly-top-bar${week === currentWeek ? " wx-weekly-top-bar-current" : ""}`}
                          style={{ height: `${Math.max((point.share / max) * 100, 6)}%` }}
                        >
                          <span className="wx-weekly-top-bar-value">{formatPercent(point.share)}</span>
                        </span>
                      </button>
                    );
                  })}
                </span>
                <span className="wx-weekly-top-delta" data-role="weekly-top-delta">
                  {deltaPp === null ? "—" : formatPp(deltaPp)}
                </span>
              </div>
            );
          })}
          <span className="wx-weekly-top-tip">
            <ChartTip tip={tip} id={tip?.id ?? ""} />
          </span>
        </div>
      )}
    </section>
  );
}

/** Item 7: category and privacy-domain Top10, current week vs the window's base week. */
export function TopChanges({
  weeks,
  categoryWeeks,
  privacyWeeks,
}: {
  weeks: WeeklyTrendWeek[];
  categoryWeeks: WeeklyDistributionWeek[];
  privacyWeeks: WeeklyDistributionWeek[];
}) {
  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-top-title">
      <div className="wx-weekly-section-head">
        <h3 id="weekly-top-title" className="wx-weekly-h3">品类与隐私变化</h3>
        <p className="wx-weekly-section-meta">按本周占比 Top10 · 柱顶为各周占比 · Δpp 对比最早有数据的一周</p>
      </div>
      <div className="wx-weekly-top-grid">
        <TopPanel id="category" title="品类 Top10 变化" weeks={weeks} data={categoryWeeks} />
        <TopPanel id="privacy" title="隐私域名 Top10 变化" weeks={weeks} data={privacyWeeks} />
      </div>
    </section>
  );
}
