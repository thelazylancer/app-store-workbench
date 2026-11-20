import { Button, EmptyState, Skeleton, Text } from "@astryxdesign/core";

export function LoadingTimeline() {
  return (
    <div className="wx-skeleton" data-role="loading">
      <Text type="supporting" as="p" className="wx-skeleton-label">正在加载时间线…</Text>
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} height={44} radius={0} index={index} />
      ))}
    </div>
  );
}

export function LoadError({
  focused,
  message,
  onRetry,
}: {
  focused: string | null;
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="wx-error" data-role="error">
      <h2 className="wx-error-title">报告加载失败</h2>
      <Text type="supporting" as="p">
        {focused ? `无法获取 ${focused} 的竞品快照` : "无法获取竞品数据"}
      </Text>
      <Text type="code" as="p" className="wx-error-reason">{message}</Text>
      <div className="wx-empty-actions">
        <Button variant="secondary" size="sm" label="重试" data-role="retry-load" onClick={onRetry} />
      </div>
    </section>
  );
}

export function EmptyCard({
  role,
  title,
  lines = [],
  actions = [],
}: {
  role: string;
  title: string;
  lines?: string[];
  actions?: Array<{ label: string; role: string; onClick: () => void }>;
}) {
  return (
    <EmptyState
      className="wx-empty"
      data-role={role}
      headingLevel={2}
      title={title}
      description={lines.join(" ")}
      actions={actions.length > 0 ? (
        <div className="wx-empty-actions">
          {actions.map((action) => (
            <Button
              key={action.role}
              variant="secondary"
              size="sm"
              label={action.label}
              data-role={action.role}
              onClick={action.onClick}
            />
          ))}
        </div>
      ) : undefined}
    />
  );
}
