import { SHELF_UNKNOWN_KEY } from "../../shared/shelfTypes";
import type { WeeklyBucket } from "../../shared/weeklyReportTypes";
import { ChartTip } from "../shelf/Charts";
import { formatPercent } from "./format";
import { useClickTip } from "./useClickTip";

type Bar = {
  key: string;
  label: string;
  /** Spoken / tooltip label, e.g. `3+ 个版本`. */
  tipLabel: string;
  count: number;
  share: number;
  className: string;
};

const BLUE_CLASSES = [
  "wx-weekly-blue-1",
  "wx-weekly-blue-2",
  "wx-weekly-blue-3",
  "wx-weekly-blue-4",
  "wx-weekly-blue-5",
  "wx-weekly-blue-6",
];

function blueClass(index: number): string {
  return BLUE_CLASSES[Math.min(index, BLUE_CLASSES.length - 1)]!;
}

function shareOf(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

const VERSION_LABELS: Record<string, string> = {
  "1": "1 个",
  "2": "2 个",
  "3+": "3+",
  "0": "无记录",
};

/** 1 / 2 / 3+ (3 and 4+ merged); a non-zero no-record bucket stays visible. */
function versionBars(buckets: WeeklyBucket[], total: number): Bar[] {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const count = (key: string) => byKey.get(key)?.count ?? 0;
  const bars: Bar[] = [
    { key: "1", count: count("1"), className: "wx-weekly-v1" },
    { key: "2", count: count("2"), className: "wx-weekly-v2" },
    { key: "3+", count: count("3") + count("4+"), className: "wx-weekly-v3" },
  ].map((bar) => ({
    ...bar,
    label: VERSION_LABELS[bar.key]!,
    tipLabel: bar.key === "3+" ? "3+ 个版本" : `${bar.key} 个版本`,
    share: shareOf(bar.count, total),
  }));
  const none = byKey.get("0");
  if (none && none.count > 0) {
    bars.push({
      key: "0",
      label: VERSION_LABELS["0"]!,
      tipLabel: "无版本记录",
      count: none.count,
      share: shareOf(none.count, total),
      className: "wx-weekly-v0",
    });
  }
  return bars;
}

/** Yes before no, both visible even at zero (binary composition). */
function iapBars(buckets: WeeklyBucket[], total: number): Bar[] {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const bars = ["yes", "no"].map((key) => {
    const bucket = byKey.get(key);
    const count = bucket?.count ?? 0;
    return {
      key,
      label: bucket?.label ?? (key === "yes" ? "有" : "无"),
      tipLabel: bucket?.label ?? (key === "yes" ? "有内购" : "无内购"),
      count,
      share: shareOf(count, total),
      className: key === "yes" ? "wx-weekly-iap-yes" : "wx-weekly-iap-no",
    };
  });
  for (const bucket of buckets) {
    if (bucket.key === "yes" || bucket.key === "no") continue;
    bars.push({
      key: bucket.key,
      label: bucket.label,
      tipLabel: bucket.label,
      count: bucket.count,
      share: shareOf(bucket.count, total),
      className: "wx-weekly-unknown",
    });
  }
  return bars;
}

/** Top N known buckets; the unknown bucket is not a category or a host. */
function topBars(buckets: WeeklyBucket[], total: number, limit: number): Bar[] {
  return buckets
    .filter((bucket) => bucket.key !== SHELF_UNKNOWN_KEY && bucket.count > 0)
    .slice(0, limit)
    .map((bucket, index) => ({
      key: bucket.key,
      label: bucket.label,
      tipLabel: bucket.label,
      count: bucket.count,
      share: shareOf(bucket.count, total),
      className: blueClass(index),
    }));
}

/** Fixed-order iOS buckets with data; no zero buckets. */
function iosBars(buckets: WeeklyBucket[], total: number): Bar[] {
  return buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket, index) => ({
      key: bucket.key,
      label: bucket.label,
      tipLabel: bucket.label,
      count: bucket.count,
      share: shareOf(bucket.count, total),
      className: bucket.key === SHELF_UNKNOWN_KEY ? "wx-weekly-unknown" : blueClass(index),
    }));
}

function PanelHead({ id, title, total }: { id: string; title: string; total: number }) {
  return (
    <div className="wx-weekly-structure-head">
      <h4 className="wx-weekly-structure-title" id={`weekly-structure-${id}`}>{title}</h4>
      <span className="wx-weekly-structure-denominator">分母 {total} 包</span>
    </div>
  );
}

function barText(bar: Bar): string {
  return `${bar.tipLabel}：${bar.count} 包 · ${formatPercent(bar.share)}`;
}

function VerticalPanel({
  id,
  title,
  bars,
  total,
}: {
  id: string;
  title: string;
  bars: Bar[];
  total: number;
}) {
  const { tip, bind } = useClickTip();

  return (
    <section
      className="wx-weekly-structure-panel"
      data-role="weekly-structure-panel"
      data-chart={id}
      aria-labelledby={`weekly-structure-${id}`}
    >
      <PanelHead id={id} title={title} total={total} />
      <div className="wx-weekly-columns" data-role="weekly-structure-chart" data-chart={id}>
        {bars.map((bar) => {
          const tipId = `${id}:${bar.key}`;
          const text = barText(bar);
          return (
            <button
              type="button"
              key={bar.key}
              className="wx-weekly-column"
              aria-label={`${title}：${text}`}
              data-role="weekly-structure-bar"
              data-chart={id}
              data-key={bar.key}
              data-count={bar.count}
              data-share={bar.share}
              {...bind(tipId, text)}
            >
              <span className="wx-weekly-column-plot" aria-hidden="true">
                <span
                  className="wx-weekly-column-bar-wrap"
                  style={{ height: `${Math.max(bar.share * 100, 2)}%` }}
                >
                  <span className="wx-weekly-column-value">
                    {bar.count} · {formatPercent(bar.share)}
                  </span>
                  <span className={`wx-weekly-column-bar ${bar.className}`} />
                </span>
              </span>
              <span className="wx-weekly-column-label">{bar.label}</span>
            </button>
          );
        })}
        <span className="wx-weekly-structure-tip">
          <ChartTip tip={tip} id={tip?.id ?? ""} />
        </span>
      </div>
    </section>
  );
}

function HorizontalPanel({
  id,
  title,
  bars,
  total,
  wide = false,
}: {
  id: string;
  title: string;
  bars: Bar[];
  total: number;
  wide?: boolean;
}) {
  const { tip, bind } = useClickTip();
  const max = Math.max(1, ...bars.map((bar) => bar.count));

  return (
    <section
      className={`wx-weekly-structure-panel${wide ? " wx-weekly-structure-panel-wide" : ""}`}
      data-role="weekly-structure-panel"
      data-chart={id}
      aria-labelledby={`weekly-structure-${id}`}
    >
      <PanelHead id={id} title={title} total={total} />
      {bars.length === 0 ? (
        <p className="wx-weekly-chart-empty">无可用数据。</p>
      ) : (
        <div className="wx-weekly-hbars" data-role="weekly-structure-chart" data-chart={id}>
          {bars.map((bar) => {
            const tipId = `${id}:${bar.key}`;
            const text = barText(bar);
            return (
              <button
                type="button"
                key={bar.key}
                className="wx-weekly-hbar"
                aria-label={`${title}：${text}`}
                data-role="weekly-structure-bar"
                data-chart={id}
                data-key={bar.key}
                data-count={bar.count}
                data-share={bar.share}
                {...bind(tipId, text)}
              >
                <span className="wx-weekly-hbar-label">{bar.label}</span>
                <span className="wx-weekly-hbar-track" aria-hidden="true">
                  <span
                    className={`wx-weekly-hbar-fill ${bar.className}`}
                    style={{ width: `${Math.max((bar.count / max) * 100, 1)}%` }}
                  />
                </span>
                <span className="wx-weekly-hbar-value">
                  {bar.count} · {formatPercent(bar.share)}
                </span>
              </button>
            );
          })}
          <span className="wx-weekly-structure-tip">
            <ChartTip tip={tip} id={tip?.id ?? ""} />
          </span>
        </div>
      )}
    </section>
  );
}

type StructureBarsProps = {
  versionCounts: WeeklyBucket[];
  distributions: Record<"category" | "ios" | "iap" | "privacy", WeeklyBucket[]>;
  total: number;
};

export function StructureBars({ versionCounts, distributions, total }: StructureBarsProps) {
  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-structure-title">
      <div className="wx-weekly-section-head">
        <h3 id="weekly-structure-title" className="wx-weekly-h3">本周结构</h3>
        <p className="wx-weekly-section-meta">
          分母 <span className="wx-weekly-mono">{total}</span> 个已解析包 · 点击图表查看明细
        </p>
      </div>
      <div className="wx-weekly-structure-grid">
        <VerticalPanel id="version" title="版本数" bars={versionBars(versionCounts, total)} total={total} />
        <VerticalPanel id="iap" title="内购" bars={iapBars(distributions.iap, total)} total={total} />
        <HorizontalPanel id="category" title="品类 Top5" bars={topBars(distributions.category, total, 5)} total={total} />
        <HorizontalPanel id="privacy" title="隐私域名 Top5" bars={topBars(distributions.privacy, total, 5)} total={total} />
        <HorizontalPanel id="ios" title="iOS" bars={iosBars(distributions.ios, total)} total={total} wide />
      </div>
    </section>
  );
}
