import { useEffect, useRef, useState } from "react";
import { teamLabel } from "../lib/teamLabel";
import type { ShelfGroupBy, ShelfTrendWeek } from "../../shared/shelfTypes";
import { OTHER_KEY, foldWeekGroups, isUnknownKey, type ShelfSegment } from "./buckets";
import type { ShelfSelection } from "./selection";

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

/** Index into the six categorical team colours; unknown teams fall back to the first. */
function teamClass(team: string, teams: string[]): string {
  const index = teams.indexOf(team);
  return `wx-team-${index < 0 ? 0 : index % 6}`;
}

function weekLabel(week: ShelfTrendWeek): string {
  return `${week.weekStart} ~ ${week.weekEnd}`;
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

export function WeeklyBarChart({ weeks, teams, team, onSelect }: WeeklyProps) {
  const max = maxCount(weeks);
  const scroll = useScrollRegion(weeks.length);
  const stacked = team === null;
  const teamTotals = new Map<string, number>();
  for (const week of weeks) {
    for (const entry of week.teams) teamTotals.set(entry.key, (teamTotals.get(entry.key) ?? 0) + entry.count);
  }

  return (
    <figure className="wx-chart-figure" data-role="weekly-chart">
      <div className="wx-chart-scroll" ref={scroll.ref} tabIndex={scroll.tabIndex}>
        <div className="wx-chart-canvas">
          <div className="wx-chart-plot">
            {weeks.map((week) => (
              <div className="wx-chart-slot" key={week.weekStart}>
                <div className="wx-chart-track">
                  <div className="wx-chart-bar-wrap" style={{ height: barHeight(week.packageCount, max) }}>
                    <span className="wx-chart-value">{week.packageCount}</span>
                    {stacked ? (
                      <div className="wx-chart-bar wx-chart-stack">
                        {week.teams.map((entry) => (
                          <button
                            type="button"
                            key={entry.key}
                            className={`wx-chart-segment ${teamClass(entry.key, teams)}`}
                            style={{ flexGrow: entry.count }}
                            aria-label={`${weekLabel(week)}，${teamLabel(entry.key)} ${entry.count} 包`}
                            data-role="team-segment"
                            data-week={week.weekStart}
                            data-team={entry.key}
                            data-count={entry.count}
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
                        className="wx-chart-bar wx-bar-total"
                        aria-label={`${weekLabel(week)}，${week.packageCount} 包`}
                        data-role="week-bar"
                        data-week={week.weekStart}
                        data-count={week.packageCount}
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
              </div>
            ))}
          </div>
          <WeekLabels weeks={weeks} />
        </div>
      </div>
      {stacked ? (
        <ul className="wx-chart-legend" data-role="team-legend">
          {teams.map((name) => (
            <li key={name}>
              <span className={`wx-legend-swatch ${teamClass(name, teams)}`} aria-hidden="true" />
              <span className="wx-legend-name">{teamLabel(name)}</span>
              <b className="wx-legend-count">{teamTotals.get(name) ?? 0}</b>
            </li>
          ))}
        </ul>
      ) : null}
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

type StackedProps = {
  weeks: ShelfTrendWeek[];
  groupBy: ShelfGroupBy;
  segments: ShelfSegment[];
  team: string | null;
  onSelect: (selection: ShelfSelection) => void;
};

export function StackedBarChart({ weeks, groupBy, segments, team, onSelect }: StackedProps) {
  const max = maxCount(weeks);
  const scroll = useScrollRegion(weeks.length);
  const shown = segments.filter((segment) => segment.count > 0);
  const legend = shown.map((segment) => `${segment.label} ${segment.count}`).join("、");
  const summary = `入库包分布堆叠图，当前维度：${DIMENSION_LABELS[groupBy]}。图例：${legend}。每周分项数值见数据表。`;
  const dimension = DIMENSION_LABELS[groupBy];
  const topKeys = segments
    .map((segment) => segment.key)
    .filter((key) => key !== OTHER_KEY && !isUnknownKey(key));

  return (
    <figure className="wx-chart-figure" data-role="stacked-chart">
      <p className="visually-hidden">{summary}</p>
      <div className="wx-chart-scroll" ref={scroll.ref} tabIndex={scroll.tabIndex}>
        <div className="wx-chart-canvas">
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
                            <button
                              type="button"
                              key={segment.key}
                              className={`wx-chart-segment ${segmentClass(segment.key, index, groupBy)}`}
                              style={{ flexGrow: count }}
                              aria-label={`${weekLabel(week)}，${segment.label} ${count} 包`}
                              data-role="segment"
                              data-week={week.weekStart}
                              data-key={segment.key}
                              data-count={count}
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
                <th scope="row">{weekLabel(week)}</th>
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
