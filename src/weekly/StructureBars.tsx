import {
  SHELF_IOS_BUCKET_ORDER,
  SHELF_UNKNOWN_KEY,
} from "../../shared/shelfTypes";
import type { WeeklyBucket } from "../../shared/weeklyReportTypes";
import { formatPercent, versionClassName } from "./format";

type StructureKey = "category" | "ios" | "iap" | "privacy";

type RowSegment = {
  key: string;
  label: string;
  count: number;
  share: number;
  className: string;
};

const OTHER_KEY = "__other__";

function blueClass(index: number): string {
  return `wx-weekly-blue-${Math.min(index, 5) + 1}`;
}

function foldKnown(buckets: WeeklyBucket[], total: number, topN: number, otherLabel = "其他"): RowSegment[] {
  const known = buckets.filter((bucket) => bucket.key !== SHELF_UNKNOWN_KEY && bucket.count > 0);
  const top = known.slice(0, topN).map((bucket, index) => ({
    key: bucket.key,
    label: bucket.label,
    count: bucket.count,
    share: bucket.share,
    className: blueClass(index),
  }));
  const otherCount = known.slice(topN).reduce((sum, bucket) => sum + bucket.count, 0);
  if (otherCount > 0) {
    top.push({
      key: OTHER_KEY,
      label: otherLabel,
      count: otherCount,
      share: total > 0 ? otherCount / total : 0,
      className: "wx-weekly-other",
    });
  }
  const unknown = buckets.find((bucket) => bucket.key === SHELF_UNKNOWN_KEY);
  if (unknown && unknown.count > 0) {
    top.push({
      key: SHELF_UNKNOWN_KEY,
      label: unknown.label,
      count: unknown.count,
      share: unknown.share,
      className: "wx-weekly-unknown",
    });
  }
  return top;
}

function iosSegments(buckets: WeeklyBucket[]): RowSegment[] {
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const segments: RowSegment[] = [];
  SHELF_IOS_BUCKET_ORDER.forEach((key, index) => {
    const bucket = byKey.get(key);
    if (!bucket || bucket.count === 0) return;
    segments.push({
      key,
      label: bucket.label,
      count: bucket.count,
      share: bucket.share,
      className: key === SHELF_UNKNOWN_KEY ? "wx-weekly-unknown" : blueClass(index),
    });
  });
  return segments;
}

function iapSegments(buckets: WeeklyBucket[]): RowSegment[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: bucket.count,
    share: bucket.share,
    className: bucket.key === "yes"
      ? "wx-weekly-iap-yes"
      : bucket.key === "no" ? "wx-weekly-iap-no" : "wx-weekly-unknown",
  }));
}

function versionStructureLabel(key: string): string {
  if (key === "0") return "无记录";
  if (key === "4+") return "4+";
  return `${key}个版本`;
}

function versionSegments(buckets: WeeklyBucket[]): RowSegment[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: versionStructureLabel(bucket.key),
    count: bucket.count,
    share: bucket.share,
    className: versionClassName(bucket.key),
  }));
}

function StructureRow({
  id,
  title,
  total,
  segments,
}: {
  id: string;
  title: string;
  total: number;
  segments: RowSegment[];
}) {
  return (
    <div className="wx-weekly-structure-row" role="group" aria-labelledby={id} data-role="weekly-structure-row">
      <div className="wx-weekly-structure-head">
        <h3 className="wx-weekly-structure-title" id={id}>{title}</h3>
        <span className="wx-weekly-structure-denominator">
          分母 <span className="wx-weekly-mono">{total}</span> 包
        </span>
      </div>
      <div className="wx-weekly-bar" aria-hidden="true">
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <span
              key={segment.key}
              className={segment.className}
              style={{ width: `${segment.share * 100}%` }}
            />
          ))}
      </div>
      <ul className="wx-weekly-structure-legend">
        {segments.map((segment) => (
          <li key={segment.key} className={segment.count === 0 ? "wx-weekly-muted" : undefined}>
            <span className={`wx-weekly-swatch ${segment.className}`} aria-hidden="true" />
            <span>{segment.label}</span>{" "}
            <span className="wx-weekly-mono">
              {segment.count} · {formatPercent(segment.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROW_DEFS: { key: StructureKey; title: string }[] = [
  { key: "category", title: "类目" },
  { key: "ios", title: "iOS" },
  { key: "iap", title: "IAP" },
  { key: "privacy", title: "隐私" },
];

type StructureBarsProps = {
  versionCounts: WeeklyBucket[];
  distributions: Record<StructureKey, WeeklyBucket[]>;
  total: number;
};

export function StructureBars({ versionCounts, distributions, total }: StructureBarsProps) {
  const rows = ROW_DEFS.map(({ key, title }) => ({
    key,
    title,
    segments: key === "ios" ? iosSegments(distributions.ios)
      : key === "iap" ? iapSegments(distributions.iap)
        : foldKnown(distributions[key], total, 6),
  }));

  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-structure-title">
      <div className="wx-weekly-section-head">
        <h2 id="weekly-structure-title" className="wx-weekly-h2">单周结构</h2>
        <p className="wx-weekly-section-meta">
          分母 <span className="wx-weekly-mono">{total}</span> 个已解析包
        </p>
      </div>
      {rows.map((row) => (
        <StructureRow
          key={row.key}
          id={`weekly-structure-${row.key}`}
          title={row.title}
          total={total}
          segments={row.segments}
        />
      ))}
      <StructureRow
        id="weekly-structure-versions"
        title="版本数分布"
        total={total}
        segments={versionSegments(versionCounts)}
      />
    </section>
  );
}
