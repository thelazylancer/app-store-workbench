import { Banner, EmptyState, Skeleton, Stack, Text } from "@astryxdesign/core";

export function SearchEmptyState({ title, filtered = false }: { title: string; filtered?: boolean }) {
  return (
    <EmptyState
      className={`empty-state wx-empty-state${filtered ? " is-filtered" : ""}`}
      headingLevel={3}
      icon={<span className="wx-empty-mark" />}
      title={title}
    />
  );
}

export function SearchError() {
  return (
    <Banner
      status="error"
      container="section"
      title="检索失败"
      description="请求失败，请稍后重试"
      role="alert"
    />
  );
}

export function SearchLoading() {
  return (
    <div className="wx-loading">
      <Text as="p" className="empty" color="secondary">
        检索中...
      </Text>
      <Stack gap={2} width="100%">
        <Skeleton height={14} />
        <Skeleton height={14} index={1} />
        <Skeleton height={14} index={2} />
      </Stack>
    </div>
  );
}
