import { Button } from "@astryxdesign/core";
import { addDays } from "../lib/reportDate";
import { batchStatusLabel, type BatchStatus, weekRange } from "./format";

type WeekHeaderProps = {
  weekStart: string | null;
  latestCompleteWeek: string | null;
  dataThrough: string | null;
  batchStatus: BatchStatus;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function WeekHeader({
  weekStart,
  latestCompleteWeek,
  dataThrough,
  batchStatus,
  isLoading,
  onPrevious,
  onNext,
}: WeekHeaderProps) {
  const previousWeek = weekStart ? addDays(weekStart, -7) : null;
  const nextWeek = weekStart ? addDays(weekStart, 7) : null;
  const isFuture = Boolean(weekStart && latestCompleteWeek && weekStart > latestCompleteWeek);
  const atLatest = Boolean(weekStart && latestCompleteWeek && weekStart === latestCompleteWeek);
  const nextDisabled = isLoading || !nextWeek || atLatest || isFuture;

  return (
    <header className="wx-weekly-header">
      <div className="wx-weekly-heading">
        <h1 className="wx-weekly-title">竞品周动态</h1>
        <p className="wx-weekly-week-range" data-role="weekly-week-range">
          {weekStart ? weekRange(weekStart) : "—"}
        </p>
      </div>
      <div className="wx-weekly-head-actions">
        <div className="wx-weekly-week-nav">
          <Button
            variant="secondary"
            size="sm"
            label={previousWeek ? `查看上一周：${weekRange(previousWeek)}` : "上一周"}
            isDisabled={isLoading || !previousWeek}
            data-role="weekly-previous"
            onClick={onPrevious}
          >
            ← 上一周
          </Button>
          <Button
            variant="secondary"
            size="sm"
            label={nextWeek ? `查看下一周：${weekRange(nextWeek)}` : "下一周"}
            isDisabled={nextDisabled}
            data-role="weekly-next"
            onClick={onNext}
          >
            下一周 →
          </Button>
          {atLatest || isFuture ? (
            <span className="wx-weekly-latest">
              {isFuture ? "已超过最新完整周" : "已是最新完整周"}
            </span>
          ) : null}
        </div>
        <p className="wx-weekly-data-through" data-role="weekly-data-through">
          数据截至 <span className="wx-weekly-mono">{dataThrough ?? "—"}</span>
          {" · "}
          批次{batchStatusLabel(batchStatus)}
        </p>
      </div>
    </header>
  );
}

/** Only partial/failed batches get a note; ok stays silent in the header meta. */
export function BatchNote({ status }: { status: BatchStatus }) {
  if (status !== "partial" && status !== "failed") return null;
  const isFailed = status === "failed";
  return (
    <p
      className={`wx-weekly-batch-note ${isFailed ? "wx-weekly-batch-failed" : "wx-weekly-batch-warning"}`}
      data-role="weekly-batch-note"
    >
      {isFailed ? "本批数据抓取失败，以下为已入库数据。" : "本批数据可能不完整，统计仅供参考。"}
    </p>
  );
}
