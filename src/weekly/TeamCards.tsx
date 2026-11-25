import { teamLabel } from "../lib/teamLabel";
import type {
  WeeklyBucket,
  WeeklyMetricKey,
  WeeklyMetricPoint,
  WeeklyMetricSeries,
  WeeklyTeam,
  WeeklyTrendWeek,
} from "../../shared/weeklyReportTypes";
import { ChartTip } from "../shelf/Charts";
import type { ChartTipState } from "../shelf/Charts";
import { formatChange, formatMetricPoint, formatPercent } from "./format";
import { useClickTip } from "./useClickTip";

const BLUE_CLASSES = [
  "wx-weekly-blue-1",
  "wx-weekly-blue-2",
  "wx-weekly-blue-3",
];

type ClickBind = ReturnType<typeof useClickTip>["bind"];

type MiniBar = {
  key: string;
  label: string;
  tipLabel: string;
  count: number;
  /** null when the team has <3 resolved packages (proportions stay hidden). */
  share: number | null;
  className: string;
};

function blueClass(index: number): string {
  return BLUE_CLASSES[Math.min(index, BLUE_CLASSES.length - 1)]!;
}

function topBars(buckets: WeeklyBucket[], sufficient: boolean, limit: number): MiniBar[] {
  return buckets.slice(0, limit).map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    tipLabel: bucket.label,
    count: bucket.count,
    share: sufficient ? bucket.share : null,
    className: blueClass(index),
  }));
}

/** 1 / 2 / 3+ (3 and 4+ merged); a no-record bucket appears only when non-zero. */
function versionBars(team: WeeklyTeam, sufficient: boolean): MiniBar[] {
  const byKey = new Map(team.versionCounts.map((bucket) => [bucket.key, bucket]));
  const count = (key: string) => byKey.get(key)?.count ?? 0;
  const resolved = team.resolvedPackages;
  const bars: MiniBar[] = [
    { key: "1", label: "1个", tipLabel: "1 个版本", count: count("1"), className: "wx-weekly-v1" },
    { key: "2", label: "2个", tipLabel: "2 个版本", count: count("2"), className: "wx-weekly-v2" },
    { key: "3+", label: "3+", tipLabel: "3+ 个版本", count: count("3") + count("4+"), className: "wx-weekly-v3" },
  ].map((bar) => ({
    ...bar,
    share: sufficient && resolved > 0 ? bar.count / resolved : null,
  }));
  if (count("0") > 0) {
    bars.push({
      key: "0",
      label: "无记录",
      tipLabel: "无版本记录",
      count: count("0"),
      share: sufficient && resolved > 0 ? count("0") / resolved : null,
      className: "wx-weekly-v0",
    });
  }
  return bars;
}

function iapBars(team: WeeklyTeam, sufficient: boolean): MiniBar[] {
  return [
    { key: "yes", label: "有", tipLabel: "有内购", count: team.iap.yes, className: "wx-weekly-iap-yes" },
    { key: "no", label: "无", tipLabel: "无内购", count: team.iap.no, className: "wx-weekly-iap-no" },
  ].map((bar) => ({
    ...bar,
    share: sufficient && team.resolvedPackages > 0 ? bar.count / team.resolvedPackages : null,
  }));
}

function detail(bar: MiniBar, sufficient: boolean): string {
  if (!sufficient || bar.share === null) {
    return `${bar.tipLabel}：${bar.count} 包（样本不足，占比不计算）`;
  }
  return `${bar.tipLabel}：${bar.count} 包 · ${formatPercent(bar.share)}`;
}

function MiniColumns({
  chart,
  title,
  bars,
  sufficient,
  tip,
  bind,
}: {
  chart: "version" | "iap";
  title: string;
  bars: MiniBar[];
  sufficient: boolean;
  tip: ChartTipState;
  bind: ClickBind;
}) {
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const ownTip = tip?.id.startsWith(`${chart}:`) ? tip : null;

  return (
    <div className="wx-weekly-mini" data-role="weekly-card-chart" data-chart={chart}>
      <p className="wx-weekly-mini-title">{title}</p>
      <div className="wx-weekly-mini-columns">
        {bars.map((bar) => {
          const height = bar.share !== null
            ? bar.share * 100
            : (bar.count / maxCount) * 100;
          const text = detail(bar, sufficient);
          return (
            <button
              type="button"
              key={bar.key}
              className="wx-weekly-mini-column"
              aria-label={`${title} · ${text}`}
              data-role="weekly-card-bar"
              data-chart={chart}
              data-key={bar.key}
              data-count={bar.count}
              {...bind(`${chart}:${bar.key}`, text)}
            >
              <span className="wx-weekly-mini-column-plot" aria-hidden="true">
                <span
                  className="wx-weekly-mini-bar-wrap"
                  style={{ height: `${Math.max(height, 2)}%` }}
                >
                  <span className="wx-weekly-mini-value">
                    {bar.share === null ? "—" : formatPercent(bar.share)}
                  </span>
                  <span className={`wx-weekly-mini-bar ${bar.className}`} />
                </span>
              </span>
              <span className="wx-weekly-mini-label">{bar.label}</span>
            </button>
          );
        })}
        <span className="wx-weekly-mini-tip">
          <ChartTip tip={ownTip} id={tip?.id ?? ""} />
        </span>
      </div>
    </div>
  );
}

function MiniRows({
  chart,
  title,
  bars,
  sufficient,
  tip,
  bind,
}: {
  chart: "category" | "privacy";
  title: string;
  bars: MiniBar[];
  sufficient: boolean;
  tip: ChartTipState;
  bind: ClickBind;
}) {
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const ownTip = tip?.id.startsWith(`${chart}:`) ? tip : null;

  return (
    <div className="wx-weekly-mini wx-weekly-mini-block" data-role="weekly-card-chart" data-chart={chart}>
      <p className="wx-weekly-mini-title">{title}</p>
      {bars.length === 0 ? (
        <p className="wx-weekly-mini-empty">—</p>
      ) : (
        <div className="wx-weekly-mini-rows">
          {bars.map((bar) => {
            const text = detail(bar, sufficient);
            return (
              <button
                type="button"
                key={bar.key}
                className="wx-weekly-mini-row"
                aria-label={`${title} · ${text}`}
                data-role="weekly-card-bar"
                data-chart={chart}
                data-key={bar.key}
                data-count={bar.count}
                {...bind(`${chart}:${bar.key}`, text)}
              >
                <span className="wx-weekly-mini-row-label">{bar.label}</span>
                <span className="wx-weekly-mini-row-track" aria-hidden="true">
                  <span
                    className={`wx-weekly-mini-row-fill ${bar.className}`}
                    style={{ width: `${Math.max((bar.count / maxCount) * 100, 2)}%` }}
                  />
                </span>
                <span className="wx-weekly-mini-row-value">
                  {bar.count} · {bar.share === null ? "—" : formatPercent(bar.share)}
                </span>
              </button>
            );
          })}
          <span className="wx-weekly-mini-tip">
            <ChartTip tip={ownTip} id={tip?.id ?? ""} />
          </span>
        </div>
      )}
    </div>
  );
}

const METRIC_SHORT: Record<WeeklyMetricKey, string> = {
  avgVersionGapDays: "版本间隔",
  avgLatestVersionToAdDays: "最新→投放",
  avgAdToOfflineDays: "投放→下架",
};

function metricText(key: WeeklyMetricKey, point: WeeklyMetricPoint): string {
  const value = formatMetricPoint(key, point);
  return key === "avgAdToOfflineDays" ? value : `${value} 天`;
}

function MetricTrend({
  series,
  team,
  weeks,
  tip,
  bind,
}: {
  series: WeeklyMetricSeries;
  team: string;
  weeks: WeeklyTrendWeek[];
  tip: ChartTipState;
  bind: ClickBind;
}) {
  const points = new Map(
    series.points.filter((point) => point.team === team).map((point) => [point.weekStart, point]),
  );
  const values = weeks
    .map((week) => points.get(week.weekStart))
    .filter((point): point is WeeklyMetricPoint => point !== undefined);
  const min = Math.min(0, ...values.map((point) => point.value));
  const max = Math.max(0, ...values.map((point) => point.value));
  const span = max - min || 1;
  const percent = (value: number) => ((value - min) / span) * 100;
  const zeroPct = percent(0);
  const current = weeks.length > 0 ? points.get(weeks[weeks.length - 1]!.weekStart) : undefined;

  return (
    <div className="wx-weekly-card-metric" data-role="weekly-card-metric" data-metric={series.key}>
      <span className="wx-weekly-card-metric-label">{METRIC_SHORT[series.key]}</span>
      <span className="wx-weekly-card-metric-value">
        {current ? metricText(series.key, current) : "—"}
      </span>
      <span className="wx-weekly-card-metric-spark">
        {min < 0 ? (
          <span
            className="wx-weekly-card-metric-zero"
            style={{ bottom: `${zeroPct}%` }}
            aria-hidden="true"
          />
        ) : null}
        {weeks.map((week, index) => {
          const point = points.get(week.weekStart);
          const text = point
            ? `${week.weekStart}：${metricText(series.key, point)}`
            : `${week.weekStart}：无数据`;
          const valuePct = point ? percent(point.value) : 0;
          const bottom = Math.min(valuePct, zeroPct);
          return (
            <button
              type="button"
              key={week.weekStart}
              className="wx-weekly-card-metric-slot"
              aria-label={`${series.title} · ${text}`}
              data-role="weekly-card-metric-bar"
              data-metric={series.key}
              data-week={week.weekStart}
              data-value={point?.value ?? ""}
              {...bind(`trend:${series.key}:${week.weekStart}`, text)}
            >
              {point ? (
                <span
                  className={`wx-weekly-card-metric-bar${
                    index === weeks.length - 1 ? " wx-weekly-card-metric-current" : ""
                  }${point.value < 0 ? " wx-weekly-card-metric-negative" : ""}`}
                  style={{
                    bottom: `${bottom}%`,
                    height: `${Math.max(Math.abs(valuePct - zeroPct), 4)}%`,
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </span>
    </div>
  );
}

function MetricTrends({
  team,
  weeks,
  metrics,
  tip,
  bind,
}: {
  team: string;
  weeks: WeeklyTrendWeek[];
  metrics: WeeklyMetricSeries[];
  tip: ChartTipState;
  bind: ClickBind;
}) {
  if (metrics.length === 0) return null;

  return (
    <div className="wx-weekly-card-metrics" data-role="weekly-card-metrics">
      <p className="wx-weekly-mini-title">版本与投放（本周）</p>
      {metrics.map((series) => (
        <MetricTrend
          key={series.key}
          series={series}
          team={team}
          weeks={weeks}
          tip={tip}
          bind={bind}
        />
      ))}
      <span className="wx-weekly-card-metric-tip">
        <ChartTip tip={tip?.id.startsWith("trend:") ? tip : null} id={tip?.id ?? ""} />
      </span>
    </div>
  );
}

function TeamCard({
  team,
  total,
  weeks,
  metrics,
}: {
  team: WeeklyTeam;
  /** This week's ingested packages; the denominator for the card's share. */
  total: number;
  weeks: WeeklyTrendWeek[];
  metrics: WeeklyMetricSeries[];
}) {
  const sufficient = team.resolvedPackages >= 3;
  const { tip, bind } = useClickTip();

  return (
    <article className="wx-weekly-card" data-role="weekly-team-card" data-team={team.team}>
      <div className="wx-weekly-card-top">
        <p className="wx-weekly-team-name">
          <span className="wx-weekly-rank" aria-hidden="true">{String(team.rank).padStart(2, "0")}</span>
          <span className="visually-hidden">第 {team.rank} 名</span>
          <span className="wx-weekly-team-label" title={team.team}>{teamLabel(team.team)}</span>
        </p>
        <span
          className={`wx-weekly-change${team.change === 0 ? " wx-weekly-change-zero" : ""}`}
          data-role="weekly-team-change"
        >
          {formatChange(team.change, team.changePct)}
        </span>
      </div>

      <div className="wx-weekly-card-main">
        <p className="wx-weekly-team-count">
          <span className="wx-weekly-count-value">{team.ingestedPackages}</span>
          <span className="wx-weekly-count-unit">包</span>
        </p>
        <p className="wx-weekly-team-share">
          {team.ingestedPackages} / {total} · {formatPercent(team.share)}
        </p>
      </div>
      <div className="wx-weekly-share-track" aria-hidden="true">
        <span style={{ width: `${team.share * 100}%` }} />
      </div>

      <div className="wx-weekly-card-divider" />

      <div className="wx-weekly-mini-grid">
        <MiniColumns chart="version" title="版本数" bars={versionBars(team, sufficient)} sufficient={sufficient} tip={tip} bind={bind} />
        <MiniColumns chart="iap" title="内购" bars={iapBars(team, sufficient)} sufficient={sufficient} tip={tip} bind={bind} />
      </div>
      <MiniRows chart="category" title="品类 Top3" bars={topBars(team.topCategories, sufficient, 3)} sufficient={sufficient} tip={tip} bind={bind} />
      <MiniRows chart="privacy" title="隐私 Top3" bars={topBars(team.topPrivacies, sufficient, 3)} sufficient={sufficient} tip={tip} bind={bind} />

      {!sufficient ? <p className="wx-weekly-sample-note">样本不足（&lt;3 包），占比不计算。</p> : null}

      <div className="wx-weekly-facts">
        <p>
          <span className="wx-weekly-fact-label">iOS</span>{" "}
          {team.topIos
            ? <>{team.topIos.label} · <span className="wx-weekly-mono">{team.topIos.count}</span> 包</>
            : <span className="wx-weekly-muted">—</span>}
        </p>
      </div>

      <MetricTrends team={team.team} weeks={weeks} metrics={metrics} tip={tip} bind={bind} />
    </article>
  );
}

type TeamCardsProps = {
  teams: WeeklyTeam[];
  total: number;
  weeks: WeeklyTrendWeek[];
  metrics: WeeklyMetricSeries[];
};

export function TeamCards({ teams, total, weeks, metrics }: TeamCardsProps) {
  return (
    <div className="wx-weekly-section">
      <ul className="wx-weekly-cards" data-role="weekly-team-cards">
        {teams.map((team) => (
          <li key={team.team}>
            <TeamCard team={team} total={total} weeks={weeks} metrics={metrics} />
          </li>
        ))}
      </ul>
    </div>
  );
}
