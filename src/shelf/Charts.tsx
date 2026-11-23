import { useEffect, useRef, useState } from "react";
import { OTHER_KEY, foldWeekGroups, isUnknownKey, type ShelfSegment } from "./buckets";
import type { ShelfGroupBy, ShelfTrendWeek } from "../../shared/shelfTypes";

const DIMENSION_LABELS: Record<ShelfGroupBy, string> = {
  category: "类目",
  ios_version: "最低 iOS",
  iap: "内购",
};

function maxCount(weeks: ShelfTrendWeek[]): number {
  return Math.max(1, ...weeks.map((week) => week.packageCount));
}

function barHeight(count: number, max: number): string {
  return `${(count / max) * 100}%`;
}

function segmentClass(key: string, knownIndex: number, groupBy: ShelfGroupBy): string {
  if (isUnknownKey(key)) return "wx-seg-unknown";
  if (key === OTHER_KEY) return "wx-seg-other";
  if (groupBy === "iap" && key === "no") return "wx-seg-ink";
  return `wx-seg-${Math.min(knownIndex, 5)}`;
}

function WeekLabels({ weeks }: { weeks: ShelfTrendWeek[] }) {
  return (
    <div className="wx-chart-labels" aria-hidden="true">
      {weeks.map((week) => (
        <div className="wx-chart-slot" key={week.weekStart}>
          <span>{week.weekStart}</span>
          <span>~ {week.weekEnd}</span>
        </div>
      ))}
    </div>
  );
}

function activeSegments(segments: ShelfSegment[]): ShelfSegment[] {
  return segments.filter((segment) => segment.count > 0);
}

/** Chart is a tab stop only while its inner canvas overflows the viewport. */
function useScrollRegion(weekCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [focusable, setFocusable] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setFocusable(element.scrollWidth > element.clientWidth + 1);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [weekCount]);
  return { ref, tabIndex: focusable ? 0 : undefined };
}

export function WeeklyBarChart({ weeks }: { weeks: ShelfTrendWeek[] }) {
  const max = maxCount(weeks);
  const scroll = useScrollRegion(weeks.length);
  const summary = `每周入库包数柱状图。${weeks
    .map((week) => `${week.weekStart} ~ ${week.weekEnd}：${week.packageCount} 包`)
    .join("；")}。`;

  return (
    <figure className="wx-chart-figure" data-role="weekly-chart">
      <div className="wx-chart-scroll" role="img" aria-label={summary} ref={scroll.ref} tabIndex={scroll.tabIndex}>
        <div className="wx-chart-canvas" aria-hidden="true">
          <div className="wx-chart-plot">
            {weeks.map((week) => (
              <div className="wx-chart-slot" key={week.weekStart}>
                <div className="wx-chart-track">
                  <div className="wx-chart-bar-wrap" style={{ height: barHeight(week.packageCount, max) }}>
                    <span className="wx-chart-value">{week.packageCount}</span>
                    <div
                      className="wx-chart-bar wx-bar-total"
                      data-role="week-bar"
                      data-week={week.weekStart}
                      data-count={week.packageCount}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <WeekLabels weeks={weeks} />
        </div>
      </div>
      <table className="visually-hidden">
        <caption>每周入库包数</caption>
        <thead>
          <tr>
            <th scope="col">周</th>
            <th scope="col">包数</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.weekStart}>
              <th scope="row">{`${week.weekStart} ~ ${week.weekEnd}`}</th>
              <td>{week.packageCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function StackedBarChart({
  weeks,
  groupBy,
  segments,
}: {
  weeks: ShelfTrendWeek[];
  groupBy: ShelfGroupBy;
  segments: ShelfSegment[];
}) {
  const max = maxCount(weeks);
  const scroll = useScrollRegion(weeks.length);
  const shown = activeSegments(segments);
  const legend = shown.map((segment) => `${segment.label} ${segment.count}`).join("、");
  const summary = `入库包分布堆叠图，当前维度：${DIMENSION_LABELS[groupBy]}。图例：${legend}。每周分项数值见数据表。`;
  const dimension = DIMENSION_LABELS[groupBy];

  return (
    <figure className="wx-chart-figure" data-role="stacked-chart">
      <div className="wx-chart-scroll" role="img" aria-label={summary} ref={scroll.ref} tabIndex={scroll.tabIndex}>
        <div className="wx-chart-canvas" aria-hidden="true">
          <div className="wx-chart-plot">
            {weeks.map((week) => {
              const counts = foldWeekGroups(groupBy, week.groups, segments);
              return (
                <div className="wx-chart-slot" key={week.weekStart}>
                  <div className="wx-chart-track">
                    <div className="wx-chart-bar-wrap" style={{ height: barHeight(week.packageCount, max) }}>
                      <span className="wx-chart-value">{week.packageCount}</span>
                      <div className="wx-chart-bar wx-chart-stack">
                        {segments.map((segment, index) => {
                          const count = counts[segment.key] ?? 0;
                          if (count === 0) return null;
                          return (
                            <div
                              key={segment.key}
                              className={`wx-chart-segment ${segmentClass(segment.key, index, groupBy)}`}
                              style={{ flexGrow: count }}
                              data-role="segment"
                              data-week={week.weekStart}
                              data-key={segment.key}
                              data-count={count}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <WeekLabels weeks={weeks} />
        </div>
      </div>
      <ul className="wx-chart-legend">
        {segments.map((segment, index) => ({ segment, index }))
          .filter(({ segment }) => segment.count > 0)
          .map(({ segment, index }) => (
            <li key={segment.key} className={isUnknownKey(segment.key) ? "wx-legend-unknown" : undefined}>
              <span className={`wx-legend-swatch ${segmentClass(segment.key, index, groupBy)}`} aria-hidden="true" />
              <span className="wx-legend-name">{segment.label}</span>
              <b className="wx-legend-count">{segment.count}</b>
            </li>
          ))}
      </ul>
      <table className="visually-hidden">
        <caption>{`每周入库包分布 · ${dimension}`}</caption>
        <thead>
          <tr>
            <th scope="col">周</th>
            {segments.map((segment) => (
              <th scope="col" key={segment.key}>{segment.label}</th>
            ))}
            <th scope="col">合计</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const counts = foldWeekGroups(groupBy, week.groups, segments);
            return (
              <tr key={week.weekStart}>
                <th scope="row">{`${week.weekStart} ~ ${week.weekEnd}`}</th>
                {segments.map((segment) => (
                  <td key={segment.key}>{counts[segment.key] ?? 0}</td>
                ))}
                <td>{week.packageCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}
