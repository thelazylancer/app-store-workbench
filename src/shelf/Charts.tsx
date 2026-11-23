import { Fragment, useEffect, useRef, useState } from "react";
import { teamLabel } from "../lib/teamLabel";
import type { ShelfDistributions, ShelfGroupBy, ShelfTrendWeek } from "../../shared/shelfTypes";
import {
  OTHER_KEY,
  foldTopCategories,
  foldWeekGroups,
  isUnknownKey,
  segmentGroups,
  type ShelfSegment,
} from "./buckets";
import type { ShelfSelection } from "./selection";

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

/** Index into the seven categorical team colours; unknown teams fall back to the first. */
export function teamClass(team: string, teams: string[]): string {
  const index = teams.indexOf(team);
  return `wx-team-${index < 0 ? 0 : index % 7}`;
}

function weekLabel(week: ShelfTrendWeek): string {
  return `${week.weekStart} ~ ${week.weekEnd}`;
}

export type ChartTipState = { id: string; text: string } | null;

/** One hovered value at a time, shown above its own column. */
export function useChartTip() {
  const [tip, setTip] = useState<ChartTipState>(null);
  const bind = (id: string, text: string) => ({
    onMouseEnter: () => setTip({ id, text }),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip({ id, text }),
    onBlur: () => setTip(null),
  });
  return { tip, bind };
}

export function ChartTip({ tip, id }: { tip: ChartTipState; id: string }) {
  // Screen readers already get the same detail from each button's aria-label.
  return tip?.id === id ? <div className="wx-chart-tip" aria-hidden="true">{tip.text}</div> : null;
}

export function WeekLabels({ weeks }: { weeks: ShelfTrendWeek[] }) {
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

/** Chart is a tab stop only while its inner canvas overflows the viewport. */
export function useScrollRegion(weekCount: number) {
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

type WeeklyProps = {
  weeks: ShelfTrendWeek[];
  teams: string[]; // all teams in range, stable order → stable colours
  team: string | null; // current team filter
  onSelect: (selection: ShelfSelection) => void;
};

/** Weekly totals as a polyline over the bars; both share the week-total scale. */
function TrendLine({ weeks, max }: { weeks: ShelfTrendWeek[]; max: number }) {
  if (weeks.length < 2) return null;
  const points = weeks
    .map((week, index) => {
      const x = ((index + 0.5) / weeks.length) * 100;
      const y = (1 - week.packageCount / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      className="wx-chart-line"
      style={{ width: `calc(var(--wx-chart-slot-w) * ${weeks.length})` }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function WeeklyBarChart({ weeks, teams, team, onSelect }: WeeklyProps) {
  const scroll = useScrollRegion(weeks.length);
  const { tip, bind } = useChartTip();
  const stacked = team === null;
  const max = maxCount(weeks);

  return (
    <figure className="wx-chart-figure" data-role="weekly-chart">
      <div className="wx-chart-scroll" ref={scroll.ref} tabIndex={scroll.tabIndex}>
        <div className="wx-chart-canvas">
          <div className="wx-chart-plot">
            {weeks.map((week) => {
              const top = Math.max(1, week.packageCount);
              return (
                <div className="wx-chart-slot" key={week.weekStart}>
                  <div className="wx-chart-track">
                    <div className="wx-chart-bar-wrap" style={{ height: barHeight(week.packageCount, max) }}>
                      <span className="wx-chart-value">{week.packageCount}</span>
                      {stacked ? (
                        <div className="wx-chart-group">
                          {week.teams.map((entry) => (
                            <button
                              type="button"
                              key={entry.key}
                              className={`wx-chart-segment ${teamClass(entry.key, teams)}`}
                              style={{ height: barHeight(entry.count, top) }}
                              aria-label={`${weekLabel(week)}，${teamLabel(entry.key)} ${entry.count} 包`}
                              data-role="team-segment"
                              data-week={week.weekStart}
                              data-team={entry.key}
                              data-count={entry.count}
                              {...bind(week.weekStart, `${teamLabel(entry.key)} ${entry.count} 包`)}
                              onClick={() => onSelect({
                                weekStart: week.weekStart,
                                weekEnd: week.weekEnd,
                                team: entry.key,
                                groupBy: null,
                                key: null,
                                topKeys: [],
                                label: "",
                              })}
                            />
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`wx-chart-bar wx-bar-total ${team ? teamClass(team, teams) : ""}`}
                          aria-label={`${weekLabel(week)}，${week.packageCount} 包`}
                          data-role="week-bar"
                          data-week={week.weekStart}
                          data-count={week.packageCount}
                          {...bind(week.weekStart, `${week.packageCount} 包`)}
                          onClick={() => onSelect({
                            weekStart: week.weekStart,
                            weekEnd: week.weekEnd,
                            team,
                            groupBy: null,
                            key: null,
                            topKeys: [],
                            label: "",
                          })}
                        />
                      )}
                    </div>
                  </div>
                  <ChartTip tip={tip} id={week.weekStart} />
                </div>
              );
            })}
            {stacked ? <TrendLine weeks={weeks} max={max} /> : null}
          </div>
          <WeekLabels weeks={weeks} />
        </div>
      </div>
      <table className="visually-hidden">
        <caption>每周入库包数</caption>
        <thead>
          <tr>
            <th scope="col">周</th>
            <th scope="col">团队</th>
            <th scope="col">包数</th>
          </tr>
        </thead>
        <tbody>
          {weeks.flatMap((week) => week.teams.map((entry) => (
            <tr key={`${week.weekStart}-${entry.key}`}>
              <th scope="row">{weekLabel(week)}</th>
              <td>{teamLabel(entry.key)}</td>
              <td>{entry.count}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </figure>
  );
}

type DistributionBoardProps = {
  distributions: ShelfDistributions;
  weeks: ShelfTrendWeek[];
  from: string;
  to: string;
  team: string | null;
  onSelect: (selection: ShelfSelection) => void;
};

const DISTRIBUTION_ROWS: { title: string; groupBy: ShelfGroupBy }[] = [
  { title: "类目", groupBy: "category" },
  { title: "最低 iOS", groupBy: "ios_version" },
  { title: "内购", groupBy: "iap" },
];

/**
 * The three dimensions as weekly grouped charts sharing one scroll region, so
 * every row stays week-aligned and there is a single scrollbar to drive.
 */
export function DistributionBoard({ distributions, weeks, from, to, team, onSelect }: DistributionBoardProps) {
  const scroll = useScrollRegion(weeks.length);
  const { tip, bind } = useChartTip();

  return (
    <div className="wx-dist-rows">
      <div className="wx-chart-scroll wx-dist-scroll" ref={scroll.ref} tabIndex={scroll.tabIndex}>
        <div className="wx-chart-canvas wx-dist-canvas">
          {DISTRIBUTION_ROWS.map(({ title, groupBy }) => (
            <DistributionRow
              key={groupBy}
              title={title}
              groupBy={groupBy}
              segments={(groupBy === "category"
                ? foldTopCategories(distributions.category)
                : segmentGroups(groupBy, distributions[groupBy])
              ).filter((segment) => !isUnknownKey(segment.key))}
              weeks={weeks}
              from={from}
              to={to}
              team={team}
              tip={tip}
              bind={bind}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type DistributionRowProps = {
  title: string;
  groupBy: ShelfGroupBy;
  segments: ShelfSegment[];
  weeks: ShelfTrendWeek[];
  from: string;
  to: string;
  team: string | null;
  tip: ChartTipState;
  bind: ReturnType<typeof useChartTip>["bind"];
  onSelect: (selection: ShelfSelection) => void;
};

/**
 * One dimension as a weekly grouped chart: one bar per type inside each week.
 * Bars share a row-wide scale so a type's week-to-week trend fills the plot;
 * week totals and composition live in the stacked chart above.
 */
function DistributionRow({ title, groupBy, segments, weeks, from, to, team, tip, bind, onSelect }: DistributionRowProps) {
  const shown = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.count > 0);
  const topKeys = segments
    .map((segment) => segment.key)
    .filter((key) => key !== OTHER_KEY && !isUnknownKey(key));
  // Each week folded into the same segment keys the legend uses.
  const weekCounts = weeks.map((week) => (
    groupBy === "category"
      ? foldWeekGroups(week.distributions.category, segments)
      : Object.fromEntries(week.distributions[groupBy].map((group) => [group.key, group.count]))
  ));
  const rowMax = Math.max(1, ...weekCounts.flatMap((counts) =>
    segments.map((segment) => counts[segment.key] ?? 0)));

  return (
    <div className="wx-dist-row" data-role="distribution-row" data-dimension={groupBy}>
      <div className="wx-dist-head">
        <h3 className="wx-dist-title">{title}</h3>
        <ul className="wx-dist-legend">
          {shown.map(({ segment, index }) => (
            <li key={segment.key}>
              <button
                type="button"
                className="wx-dist-legend-btn"
                data-role="dist-legend"
                data-key={segment.key}
                aria-label={`${title}：${segment.label} 全区间 ${segment.count} 包`}
                onClick={() => onSelect({
                  weekStart: from,
                  weekEnd: to,
                  team,
                  groupBy,
                  key: segment.key,
                  topKeys,
                  label: segment.label,
                })}
              >
                <span className={`wx-dist-swatch ${segmentClass(segment.key, index, groupBy)}`} />
                <span className="wx-dist-legend-label">{segment.label}</span>
                <b className="wx-dist-legend-count">{segment.count}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="wx-chart-plot wx-dist-plot">
        {weeks.map((week, weekIndex) => {
          const tipId = `${groupBy}:${week.weekStart}`;
          return (
            <div className="wx-chart-slot" key={week.weekStart}>
              <div className="wx-chart-track">
                <div className="wx-chart-bar-wrap" style={{ height: "100%" }}>
                  <div className="wx-chart-group">
                    {shown.map(({ segment, index }) => {
                      const count = weekCounts[weekIndex]?.[segment.key] ?? 0;
                      if (count === 0) return null;
                      return (
                        <button
                          type="button"
                          key={segment.key}
                          className={`wx-chart-segment ${segmentClass(segment.key, index, groupBy)}`}
                          style={{ height: barHeight(count, rowMax) }}
                          aria-label={`${week.weekStart} ~ ${week.weekEnd}，${segment.label} ${count} 包`}
                          data-role="dist-bar"
                          data-week={week.weekStart}
                          data-key={segment.key}
                          data-count={count}
                          {...bind(tipId, `${segment.label} ${count} 包`)}
                          onClick={() => onSelect({
                            weekStart: week.weekStart,
                            weekEnd: week.weekEnd,
                            team,
                            groupBy,
                            key: segment.key,
                            topKeys,
                            label: segment.label,
                          })}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <ChartTip tip={tip} id={tipId} />
            </div>
          );
        })}
      </div>
      <WeekLabels weeks={weeks} />
    </div>
  );
}
