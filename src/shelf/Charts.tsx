import { Fragment, useEffect, useRef, useState } from "react";
import { teamLabel } from "../lib/teamLabel";
import type { ShelfGroupBy, ShelfTrendWeek } from "../../shared/shelfTypes";
import { OTHER_KEY, foldWeekGroups, isUnknownKey, type ShelfSegment } from "./buckets";
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

type ChartTipState = { id: string; text: string } | null;

/** One hovered value at a time, shown above its own column. */
function useChartTip() {
  const [tip, setTip] = useState<ChartTipState>(null);
  const bind = (id: string, text: string) => ({
    onMouseEnter: () => setTip({ id, text }),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip({ id, text }),
    onBlur: () => setTip(null),
  });
  return { tip, bind };
}

function ChartTip({ tip, id }: { tip: ChartTipState; id: string }) {
  // Screen readers already get the same detail from each button's aria-label.
  return tip?.id === id ? <div className="wx-chart-tip" aria-hidden="true">{tip.text}</div> : null;
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

type DistributionRowProps = {
  title: string;
  groupBy: ShelfGroupBy;
  segments: ShelfSegment[];
  weeks: ShelfTrendWeek[];
  from: string;
  to: string;
  team: string | null;
  onSelect: (selection: ShelfSelection) => void;
};

/** One dimension as a row of cards; each value card is a mini weekly bar chart. */
export function DistributionRow({ title, groupBy, segments, weeks, from, to, team, onSelect }: DistributionRowProps) {
  const { tip, bind } = useChartTip();
  const shown = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.count > 0);
  const topKeys = segments
    .map((segment) => segment.key)
    .filter((key) => key !== OTHER_KEY && !isUnknownKey(key));
  // Each week folded into the same segment keys the cards use.
  const weekCounts = weeks.map((week) => (
    groupBy === "category"
      ? foldWeekGroups(week.distributions.category, segments)
      : Object.fromEntries(week.distributions[groupBy].map((group) => [group.key, group.count]))
  ));
  // One shared scale per row, so card heights stay comparable.
  const max = Math.max(1, ...shown.flatMap(({ segment }) => (
    weekCounts.map((counts) => counts[segment.key] ?? 0)
  )));

  return (
    <div className="wx-dist-row" data-role="distribution-row" data-dimension={groupBy}>
      <h3 className="wx-dist-title">{title}</h3>
      <ul className="wx-dist-cards">
        {shown.map(({ segment, index }) => (
          <li key={segment.key} className="wx-dist-card" data-role="dist-card" data-key={segment.key}>
            <button
              type="button"
              className="wx-dist-head"
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
              <span className="wx-dist-label">{segment.label}</span>
              <b className="wx-dist-total">{segment.count}</b>
            </button>
            <div className="wx-dist-bars">
              {weeks.map((week, weekIndex) => {
                const count = weekCounts[weekIndex]?.[segment.key] ?? 0;
                const id = `${segment.key}-${week.weekStart}`;
                return (
                  <Fragment key={week.weekStart}>
                    <span className="wx-dist-bar-wrap">
                      <button
                        type="button"
                        className={`wx-dist-bar ${segmentClass(segment.key, index, groupBy)}`}
                        style={{ height: `${(count / max) * 100}%` }}
                        aria-label={`${week.weekStart} ~ ${week.weekEnd}，${segment.label} ${count} 包`}
                        data-role="dist-bar"
                        data-week={week.weekStart}
                        data-count={count}
                        disabled={count === 0}
                        {...(count > 0 ? bind(id, `${segment.label} ${count} 包`) : {})}
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
                    </span>
                    <ChartTip tip={tip} id={id} />
                  </Fragment>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
