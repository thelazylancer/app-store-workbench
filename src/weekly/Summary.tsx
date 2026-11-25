import type { WeeklyReportResponse } from "../../shared/weeklyReportTypes";
import { formatSigned, formatSignedPercent, shortDate } from "./format";

type SummaryProps = {
  summary: WeeklyReportResponse["summary"];
  weekStart: string;
  weekEnd: string;
};

/** One fixed-template sentence; counts every new package, resolved or not. */
export function Summary({ summary, weekStart, weekEnd }: SummaryProps) {
  const hasPrevious = summary.previousIngestedPackages > 0;

  return (
    <section className="wx-weekly-summary" aria-labelledby="weekly-summary-label">
      <p className="wx-weekly-eyebrow" id="weekly-summary-label">本周摘要</p>
      <p className="wx-weekly-summary-line" data-role="weekly-summary">
        <span className="wx-weekly-mono">{weekStart}</span>
        {" 至 "}
        <span className="wx-weekly-mono">{shortDate(weekEnd)}</span>
        ：新增 <span className="wx-weekly-mono">{Math.round(summary.ingestedPackages)}</span> 个包，
        来自 <span className="wx-weekly-mono">{summary.teamCount}</span> 个团队；
        {hasPrevious ? (
          <>
            环比 <span className="wx-weekly-mono">{formatSigned(summary.ingestedChange)}</span>
            （<span className="wx-weekly-mono">{formatSignedPercent(summary.ingestedChangePct)}</span>）。
          </>
        ) : (
          <>
            环比新增 <span className="wx-weekly-mono">{Math.round(summary.ingestedPackages)}</span> 个包。
          </>
        )}
      </p>
    </section>
  );
}
