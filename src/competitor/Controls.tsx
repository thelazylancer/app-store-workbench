import { Button, DateInput, SegmentedControl, SegmentedControlItem, Selector, Tab, TabList, Text } from "@astryxdesign/core";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import type { DayDetail } from "../../shared/competitorTypes";
import type { QueryFilters } from "../app/useQueryFilters";
import { teamLabel } from "../lib/teamLabel";
import { statusFilterLabel, yesterdayUtc, type StatusFilter } from "./format";
import { categoryOf, dedupedPackages, scopedPackages, tabTeams, totals, uniqueSorted } from "./selectors";

type Props = {
  days: DayDetail[];
  loading: boolean;
  filters: QueryFilters;
  onChange: (patch: Partial<QueryFilters>) => void;
  onClear: () => void;
};

function Stat({ role, label, value, tone }: { role: string; label: string; value: number; tone?: string }) {
  return (
    <div className={`wx-stat${tone ? ` ${tone}` : ""}`}>
      <b className="wx-stat-value" data-role={role}>{value}</b>
      <Text type="supporting" as="span">{label}</Text>
    </div>
  );
}

export function Controls({ days, loading, filters, onChange, onClear }: Props) {
  const counts = totals(days, filters);
  const hasData = !loading && scopedPackages(days, filters).length > 0;
  const categoryOptions = [
    { value: "", label: "全部" },
    ...uniqueSorted(dedupedPackages(days).map(categoryOf)).map((value) => ({ value, label: value })),
  ];
  const teams = tabTeams(days, filters);
  const filtered = Boolean(filters.team || filters.category || filters.status !== "all" || filters.date);
  const shown = filters.status === "hit"
    ? counts.hit
    : filters.status === "exception"
      ? counts.exception
      : counts.total;
  const bits = [
    filters.team,
    filters.date,
    filters.category,
    filters.status !== "all" ? statusFilterLabel(filters.status) : null,
  ].filter(Boolean);

  return (
    <>
      <h1 className="visually-hidden">竞品日报</h1>
      <div className="wx-toolbar">
        <TabList
          className="wx-team-tabs"
          aria-label="团队"
          size="sm"
          value={filters.team ?? ""}
          onChange={(value) => onChange({ team: value || null })}
        >
          <Tab value="" label="全部" data-role="team-tab" data-team="" />
          {teams.map((team) => (
            <Tab key={team} value={team} label={teamLabel(team)} data-role="team-tab" data-team={team} />
          ))}
        </TabList>

        <div className="wx-controls">
          <div className="wx-control">
            <Text type="supporting" as="span">类目</Text>
            <Selector
              label="类目"
              isLabelHidden
              size="sm"
              options={categoryOptions}
              value={filters.category ?? ""}
              onChange={(value) => onChange({ category: value || null })}
              data-role="category-filter"
            />
          </div>
          <div className="wx-control">
            <Text type="supporting" as="span">状态</Text>
            <SegmentedControl
              label="命中状态"
              size="sm"
              value={filters.status}
              onChange={(value) => onChange({ status: value as StatusFilter })}
            >
              {(["all", "hit", "exception"] as const).map((value) => {
                const count = value === "all" ? counts.total : value === "hit" ? counts.hit : counts.exception;
                return (
                  <SegmentedControlItem
                    key={value}
                    value={value}
                    label={hasData ? `${statusFilterLabel(value)} ${count}` : statusFilterLabel(value)}
                    data-role="status"
                    data-value={value}
                  />
                );
              })}
            </SegmentedControl>
          </div>
          <div className="wx-control">
            <Text type="supporting" as="span">日期</Text>
            <DateInput
              label="日期"
              isLabelHidden
              size="sm"
              format="system_date"
              placeholder="选择日期"
              max={yesterdayUtc() as ISODateString}
              value={(filters.date ?? undefined) as ISODateString | undefined}
              onChange={(value) => onChange({ date: value ?? null })}
              data-role="date-filter"
            />
          </div>
        </div>
      </div>

      <div className="wx-stats">
        <Stat role="stat-total" label="包总数" value={counts.total} />
        <Stat role="stat-competitors" label="竞品数" value={counts.competitors} />
        <Stat role="stat-hit" label="命中" value={counts.hit} tone="wx-stat-hit" />
        <Stat role="stat-exception" label="异常" value={counts.exception} tone="wx-stat-exception" />
      </div>

      {filtered && hasData ? (
        <p className="wx-filter-note" data-role="filter-note">
          <Text type="supporting" as="span">
            当前为筛选结果 · {bits.join(" · ")} · {shown} 包
          </Text>
          <Button
            variant="ghost"
            size="sm"
            label="清除筛选"
            data-role="empty-clear-filter"
            onClick={onClear}
          />
        </p>
      ) : null}
    </>
  );
}
