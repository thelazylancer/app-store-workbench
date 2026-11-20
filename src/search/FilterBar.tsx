import { Button, SegmentedControl, SegmentedControlItem, Stack } from "@astryxdesign/core";
import type { StoreCountry } from "../../shared/types";
import type { ResultFilters, ResultStatusFilter } from "../lib/filterResults";
import type { StatusCounts } from "./format";
import "./styles/results.css";

type FilterBarProps = {
  filters: ResultFilters;
  counts: StatusCounts;
  country: StoreCountry;
  visible: boolean;
  onStatusChange: (status: ResultStatusFilter) => void;
  onToggleScreenshots: () => void;
  onToggleIap: () => void;
};

const STATUS_ITEMS: { value: ResultStatusFilter; label: string; count: keyof StatusCounts }[] = [
  { value: "all", label: "全部", count: "all" },
  { value: "matched", label: "已匹配", count: "matched" },
  { value: "uncertain_match", label: "待确认", count: "uncertain_match" },
  { value: "unresolved", label: "未解决", count: "unresolved" },
];

export function FilterBar({
  filters,
  counts,
  country,
  visible,
  onStatusChange,
  onToggleScreenshots,
  onToggleIap,
}: FilterBarProps) {
  const iapLabel = country === "us" ? "命中 4.99 / 9.99" : "美元价格筛选仅美国区";

  return (
    <div className="filter-bar" hidden={!visible}>
      <section className="wx-filter-cluster">
        <SegmentedControl
          label="匹配状态筛选"
          size="sm"
          value={filters.status}
          onChange={(value) => onStatusChange(value as ResultStatusFilter)}
        >
          {STATUS_ITEMS.map((item) => (
            <SegmentedControlItem
              key={item.value}
              value={item.value}
              label={`${item.label} ${counts[item.count]}`}
            />
          ))}
        </SegmentedControl>
      </section>

      <section className="wx-filter-cluster wx-filter-cluster-secondary">
        <Stack direction="horizontal" gap={2} wrap="wrap">
          <Button
            type="button"
            size="sm"
            variant={filters.screenshotsOnly ? "primary" : "secondary"}
            label="仅看有截图"
            onClick={onToggleScreenshots}
          />
          <Button
            type="button"
            size="sm"
            variant={filters.iapMatchedOnly ? "primary" : "secondary"}
            label={iapLabel}
            isDisabled={country !== "us"}
            onClick={onToggleIap}
          />
        </Stack>
      </section>
    </div>
  );
}
