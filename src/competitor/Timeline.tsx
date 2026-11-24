import type { DayDetail, PackageDetail } from "../../shared/competitorTypes";
import type { QueryFilters } from "../app/useQueryFilters";
import type { ViewMode } from "./format";
import { TeamBlock } from "./TeamBlock";
import { groupsFrom, groupShown, scopedPackages, scopeDays } from "./selectors";

export function Timeline({ days, filters, view }: { days: DayDetail[]; filters: QueryFilters; view: ViewMode }) {
  const packages = new Map<string, PackageDetail>(scopedPackages(days, filters).map((pkg) => [pkg.packageCode, pkg]));
  const rangeDays = filters.date ? 1 : 0;

  return (
    <>
      {scopeDays(days, filters).map((day) => {
        const groups = groupsFrom([day], filters, true).sort(
          (a, b) => b.packageCount - a.packageCount || a.groupKey.localeCompare(b.groupKey, "zh"),
        );
        const shown = groups.reduce((sum, group) => sum + groupShown(group, filters.status), 0);
        if (shown === 0) return null;
        return (
          <section className="wx-tl-day" data-role="timeline-day" data-date={day.date} key={day.date}>
            <div className="wx-tl-date">
              <span className="wx-tl-when">{day.date}</span>
              <span className="wx-tl-n">{shown} 包</span>
            </div>
            {groups.map((group) => (
              <TeamBlock
                key={group.groupKey}
                group={group}
                packages={packages}
                status={filters.status}
                rangeDays={rangeDays}
                view={view}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}
