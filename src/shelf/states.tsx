import { Button, EmptyState, Skeleton, Text } from "@astryxdesign/core";

export function ShelfLoading() {
  return (
    <div className="wx-shelf-state wx-shelf-loading" data-role="shelf-loading" aria-busy="true">
      <Text type="supporting" as="p">正在加载趋势数据…</Text>
      <div className="wx-shelf-skeleton-bars" aria-hidden="true">
        <Skeleton height={40} radius={0} index={0} />
        <Skeleton height={80} radius={0} index={1} />
        <Skeleton height={120} radius={0} index={2} />
      </div>
      <Skeleton height={16} radius={0} index={3} />
      {[4, 5, 6, 7, 8, 9].map((index) => <Skeleton key={index} height={16} radius={0} index={index} />)}
    </div>
  );
}

export function DistributionLoading() {
  return (
    <div className="wx-shelf-state wx-shelf-loading" data-role="distribution-loading" aria-busy="true">
      <Text type="supporting" as="p">正在切换分布维度…</Text>
      <Skeleton height={120} radius={0} index={0} />
    </div>
  );
}

export function ShelfError({
  message,
  onRetry,
  title = "趋势数据加载失败",
}: {
  message: string;
  onRetry: () => void;
  title?: string;
}) {
  return (
    <section className="wx-shelf-state wx-shelf-error" data-role="shelf-error">
      <h2 className="wx-shelf-error-title">{title}</h2>
      <Text type="code" as="p" className="wx-shelf-error-reason">{message}</Text>
      <div className="wx-shelf-state-actions">
        <Button variant="secondary" size="sm" label="重试" data-role="shelf-retry" onClick={onRetry} />
      </div>
    </section>
  );
}

export function ShelfEmpty({
  title,
  description,
  actionLabel,
  actionRole,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionRole: string;
  onAction: () => void;
}) {
  return (
    <EmptyState
      className="wx-shelf-state"
      data-role="shelf-empty"
      headingLevel={2}
      title={title}
      description={description}
      actions={(
        <div className="wx-shelf-state-actions">
          <Button
            variant="secondary"
            size="sm"
            label={actionLabel}
            data-role={actionRole}
            onClick={onAction}
          />
        </div>
      )}
    />
  );
}
