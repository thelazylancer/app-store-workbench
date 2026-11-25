import type { WeeklyHighlight } from "../../shared/weeklyReportTypes";
import { teamLabel } from "../lib/teamLabel";
import { formatChange, formatPercent, formatPp, formatSigned } from "./format";

function teamHighlight(highlight: Extract<WeeklyHighlight, { kind: "team_change" }>) {
  const direction = highlight.previous === 0
    ? "新增"
    : highlight.direction === "up" ? "增幅" : "降幅";
  return (
    <div className="wx-weekly-highlight" data-role="weekly-highlight" data-kind="team_change">
      <p className="wx-weekly-highlight-label">团队变化</p>
      <p className="wx-weekly-highlight-line">
        {direction} · <span title={highlight.team}>{teamLabel(highlight.team)}</span>{" "}
        <span className="wx-weekly-mono">{highlight.previous}</span>
        {" → "}
        <span className="wx-weekly-mono">{highlight.current}</span>
      </p>
      <p className="wx-weekly-highlight-change">
        {highlight.previous === 0
          ? formatSigned(highlight.change)
          : formatChange(highlight.change, highlight.changePct)}
      </p>
    </div>
  );
}

function categoryHighlight(highlight: Extract<WeeklyHighlight, { kind: "category_change" }>) {
  return (
    <div className="wx-weekly-highlight" data-role="weekly-highlight" data-kind="category_change">
      <p className="wx-weekly-highlight-label">品类变化</p>
      <p className="wx-weekly-highlight-line">
        {highlight.direction === "up" ? "增幅" : "降幅"} · {highlight.category}{" "}
        <span className="wx-weekly-mono">{formatPercent(highlight.previousShare)}</span>
        {" → "}
        <span className="wx-weekly-mono">{formatPercent(highlight.currentShare)}</span>
      </p>
      <p className="wx-weekly-highlight-change">{formatPp(highlight.deltaPp)}</p>
    </div>
  );
}

export function Highlights({ highlights }: { highlights: WeeklyHighlight[] }) {
  return (
    <section className="wx-weekly-section" aria-labelledby="weekly-highlights-title">
      <div className="wx-weekly-section-head">
        <h2 id="weekly-highlights-title" className="wx-weekly-h2">本周值得关注</h2>
        <p className="wx-weekly-section-meta">最多 2 条 · 规则生成</p>
      </div>
      {highlights.length === 0 ? (
        <p className="wx-weekly-no-highlights" data-role="weekly-no-highlights">本周无明显变化。</p>
      ) : (
        <div className="wx-weekly-highlights" data-role="weekly-highlights">
          {highlights.slice(0, 2).map((highlight) => (
            highlight.kind === "team_change"
              ? <div key={`team-${highlight.team}`}>{teamHighlight(highlight)}</div>
              : <div key={`category-${highlight.category}`}>{categoryHighlight(highlight)}</div>
          ))}
        </div>
      )}
    </section>
  );
}
