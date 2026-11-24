import { Button, EmptyState, Skeleton, Text } from "@astryxdesign/core";

export function WeeklyLoading({ week, weekEnd }: { week?: string | null; weekEnd?: string | null }) {
  const label = week && weekEnd
    ? `正在加载 ${week} 至 ${weekEnd} 的周报`
    : "正在加载周报";

  return (
    <div className="wx-weekly-body" aria-busy="true" data-role="weekly-loading">
      <p className="visually-hidden" role="status">{label}</p>
      <div className="wx-weekly-loading" aria-hidden="true">
        <Skeleton height={16} width="60%" radius={0} index={0} />
        <div className="wx-weekly-skeleton-cards">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <Skeleton key={index} height={320} radius={2} index={index} />
          ))}
        </div>
        <Skeleton height={96} radius={0} index={7} />
        <Skeleton height={20} radius={0} index={8} />
        <Skeleton height={140} radius={0} index={9} />
      </div>
    </div>
  );
}

export function WeeklyError({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="wx-weekly-body wx-weekly-state wx-weekly-error" data-role="weekly-error">
      <h2 className="wx-weekly-error-title">{title}</h2>
      <Text type="code" as="p" className="wx-weekly-error-reason">{description}</Text>
      <div className="wx-weekly-state-actions">
        <Button variant="secondary" size="sm" label={actionLabel} data-role="weekly-retry" onClick={onAction} />
      </div>
    </section>
  );
}

export function WeeklyEmpty({
  description,
  onPrevious,
}: {
  description: string;
  onPrevious: () => void;
}) {
  return (
    <div className="wx-weekly-body" data-role="weekly-empty">
      <EmptyState
        className="wx-weekly-state"
        headingLevel={2}
        title="该周没有已解析入库包"
        description={description}
        actions={(
          <div className="wx-weekly-state-actions">
            <Button
              variant="secondary"
              size="sm"
              label="查看上一周"
              data-role="weekly-previous-empty"
              onClick={onPrevious}
            />
          </div>
        )}
      />
    </div>
  );
}
