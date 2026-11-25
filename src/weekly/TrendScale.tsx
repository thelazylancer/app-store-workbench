import type {
  WeeklyIapPoint,
  WeeklyTrendWeek,
  WeeklyVersionAveragePoint,
} from "../../shared/weeklyReportTypes";
import { ChartTip } from "../shelf/Charts";
import { formatPercent } from "./format";
import { useClickTip } from "./useClickTip";
import { TrendBars, WeekLabels } from "./TrendBars";

type RatioPoint = { weekStart: string; value: number; label: string; tooltip: string };

function RatioBars({
  chart,
  title,
  weeks,
  points,
  max,
}: {
  chart: "iap" | "version";
  title: string;
  weeks: WeeklyTrendWeek[];
  points: RatioPoint[];
  max: number;
}) {
  const { tip, bind } = useClickTip();
  const lookup = new Map(points.map((point) => [point.weekStart, point]));

  return (
    <div className="wx-weekly-ratio" data-role="weekly-ratio-chart" data-chart={chart}>
      <div className="wx-weekly-overall-plot">
        {weeks.map((week) => {
          const point = lookup.get(week.weekStart);
          if (!point) {
            return <span className="wx-weekly-overall-slot" key={week.weekStart} />;
          }
          return (
            <span className="wx-weekly-overall-slot" key={week.weekStart}>
              <button
                type="button"
                className="wx-weekly-overall-column"
                aria-label={`${title} · ${week.weekStart.slice(5)}：${point.tooltip}`}
                data-role="weekly-ratio-bar"
                data-chart={chart}
                data-week={week.weekStart}
                data-value={point.value}
                {...bind(`${chart}:${week.weekStart}`, `${week.weekStart.slice(5)}：${point.tooltip}`)}
              >
                <span
                  className="wx-weekly-overall-bar"
                  style={{ bottom: 0, height: `${Math.max((point.value / max) * 100, 1)}%` }}
                >
                  <span className="wx-weekly-overall-value">{point.label}</span>
                </span>
              </button>
            </span>
          );
        })}
        <span className="wx-weekly-overall-tip">
          <ChartTip tip={tip} id={tip?.id ?? ""} />
        </span>
      </div>
      <div className="wx-weekly-overall-labels" aria-hidden="true">
        {weeks.map((week) => (
          <div key={week.weekStart}>
            <span>{week.weekStart.slice(5)}</span>
            <span>~ {week.weekEnd.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type CoverageSeries = {
  key: "all" | "resolved";
  label: string;
  count: number;
  total: number;
};

function coverageSeries(week: WeeklyTrendWeek): CoverageSeries[] {
  return [
    { key: "all", label: "全部包", count: week.attributedPackages, total: week.ingestedPackages },
    {
      key: "resolved",
      label: "已解析包",
      count: week.resolvedAttributedPackages,
      total: week.resolvedPackages,
    },
  ];
}

function shareText(series: CoverageSeries): string {
  return series.total > 0 ? formatPercent(series.count / series.total) : "—";
}

/** The two attribution ratios of one week: `全部包 25.0%（10/40） · 已解析包 50.0%（9/18）`. */
function coverageTip(week: WeeklyTrendWeek): string {
  const parts = coverageSeries(week).map((series) => (
    series.total > 0
      ? `${series.label} ${shareText(series)}（${series.count}/${series.total}）`
      : `${series.label} —`
  ));
  return `${week.weekStart.slice(5)} ~ ${week.weekEnd.slice(5)}：${parts.join(" · ")}`;
}

/** Two bars per week: attribution share over all packages, then over resolved packages. */
function CoverageBars({ weeks }: { weeks: WeeklyTrendWeek[] }) {
  const { tip, bind } = useClickTip();
  const aria = weeks.map((week) => (
    `${week.weekStart.slice(5)} ${coverageSeries(week)
      .map((series) => `${series.label} ${shareText(series)}`)
      .join("，")}`
  ));

  return (
    <figure className="wx-weekly-coverage">
      <div
        className="wx-weekly-coverage-plot"
        role="img"
        aria-label={`近 4 周有归因比例。${aria.join("；")}。`}
        data-role="weekly-coverage-chart"
      >
        {weeks.map((week) => {
          const id = `coverage:${week.weekStart}`;
          return (
            <div className="wx-weekly-coverage-slot" key={week.weekStart}>
              <div className="wx-weekly-coverage-group">
                {coverageSeries(week).map((series) => {
                  const share = series.total > 0 ? series.count / series.total : null;
                  return (
                    <button
                      type="button"
                      className="wx-weekly-coverage-column"
                      key={series.key}
                      aria-label={`${week.weekStart} ${series.label}有归因：${share === null ? "无数据" : `${shareText(series)}（${series.count}/${series.total}）`}`}
                      data-role="weekly-coverage-bar"
                      data-series={series.key}
                      data-week={week.weekStart}
                      data-value={share ?? ""}
                      {...bind(id, coverageTip(week))}
                    >
                      {share === null ? (
                        <span className="wx-weekly-coverage-missing" aria-hidden="true">—</span>
                      ) : (
                        <span
                          className={`wx-weekly-coverage-bar wx-weekly-coverage-bar-${series.key}`}
                          style={{ height: `${Math.max(share * 100, 1)}%` }}
                        >
                          <span className="wx-weekly-coverage-value" aria-hidden="true">
                            {formatPercent(share)}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <ChartTip tip={tip} id={id} />
            </div>
          );
        })}
      </div>
      <WeekLabels weeks={weeks} />
    </figure>
  );
}

/** Items 1–3: new packages, IAP share, mean versions per package. */
export function TrendScale({
  weeks,
  iapShare,
  avgVersions,
}: {
  weeks: WeeklyTrendWeek[];
  iapShare: WeeklyIapPoint[];
  avgVersions: WeeklyVersionAveragePoint[];
}) {
  const iapPoints: RatioPoint[] = iapShare.map((point) => ({
    weekStart: point.weekStart,
    value: point.share * 100,
    label: formatPercent(point.share),
    tooltip: formatPercent(point.share),
  }));
  const versionPoints: RatioPoint[] = avgVersions.map((point) => ({
    weekStart: point.weekStart,
    value: point.value,
    label: point.value.toFixed(1),
    tooltip: `${point.value.toFixed(1)} 个版本`,
  }));
  const versionMax = Math.max(1, ...versionPoints.map((point) => point.value));

  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-scale-title">
      <div className="wx-weekly-section-head">
        <h3 id="weekly-scale-title" className="wx-weekly-h3">新增与结构</h3>
        <p className="wx-weekly-section-meta">新增包含未解析包 · 内购与版本按已解析包</p>
      </div>
      <div className="wx-weekly-scale-grid">
        <div className="wx-weekly-trend-panel wx-weekly-trend-panel-wide">
          <div className="wx-weekly-wide-grid">
            <div>
              <div className="wx-weekly-panel-head">
                <h4 className="wx-dist-title">新增包数</h4>
              </div>
              <TrendBars weeks={weeks} />
            </div>
            <div>
              <div className="wx-weekly-panel-head">
                <h4 className="wx-dist-title">有归因比例</h4>
                <span className="wx-weekly-coverage-legend">
                  <span><i className="wx-weekly-coverage-swatch-all" />全部包为分母</span>
                  <span><i className="wx-weekly-coverage-swatch-resolved" />已解析包为分母</span>
                </span>
              </div>
              <CoverageBars weeks={weeks} />
            </div>
          </div>
        </div>
        <div className="wx-weekly-trend-panel">
          <h4 className="wx-dist-title">内购比例</h4>
          <RatioBars
            chart="iap"
            title="内购比例"
            weeks={weeks}
            points={iapPoints}
            max={100}
          />
        </div>
        <div className="wx-weekly-trend-panel">
          <div className="wx-weekly-panel-head">
            <h4 className="wx-dist-title">包版本数</h4>
            <span className="wx-weekly-panel-note">平均版本数</span>
          </div>
          <RatioBars
            chart="version"
            title="包版本数"
            weeks={weeks}
            points={versionPoints}
            max={versionMax}
          />
        </div>
      </div>
    </section>
  );
}
