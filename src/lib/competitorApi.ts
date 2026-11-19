import type {
  DateKind,
  DayDetail,
  DaySummary,
  GroupBy,
  PackageDetail,
  SnapshotEntry,
  SummaryGroup,
  SummaryResponse,
} from "../../shared/competitorTypes";

export class CompetitorApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "CompetitorApiError";
  }
}

async function request<T>(input: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input);
  } catch {
    throw new CompetitorApiError("网络请求失败，请检查服务是否可用", null);
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new CompetitorApiError("竞品数据暂不可用：服务端未配置数据库", 503);
    }
    if (response.status === 404) {
      throw new CompetitorApiError("未找到该日期的数据", 404);
    }
    throw new CompetitorApiError(`请求失败（HTTP ${response.status}）`, response.status);
  }

  return (await response.json()) as T;
}

export async function getCompetitorSummary(
  date: string,
  dateKind: DateKind,
  groupBy: GroupBy,
): Promise<SummaryGroup[]> {
  const params = new URLSearchParams({ date, date_kind: dateKind, group_by: groupBy });
  const data = await request<SummaryGroup[] | SummaryResponse>(
    `/api/competitor/summary?${params.toString()}`,
  );
  return Array.isArray(data) ? data : data.groups ?? [];
}

export function getCompetitorDay(date: string, dateKind: DateKind): Promise<DayDetail> {
  const params = new URLSearchParams({ date_kind: dateKind });
  return request<DayDetail>(`/api/competitor/day/${encodeURIComponent(date)}?${params.toString()}`);
}

export function getCompetitorDays(start: string, end: string): Promise<DaySummary[]> {
  const params = new URLSearchParams({ start, end });
  return request<{ days: DaySummary[] }>(`/api/competitor/days?${params.toString()}`).then(
    (data) => data.days ?? [],
  );
}

export function getCompetitorPackage(packageCode: string): Promise<PackageDetail> {
  return request<PackageDetail>(`/api/competitor/package/${encodeURIComponent(packageCode)}`);
}

export async function getCompetitorPackageHistory(
  packageCode: string,
  from: string,
  to: string,
): Promise<SnapshotEntry[]> {
  const params = new URLSearchParams({ from, to });
  const data = await request<{ packageCode: string; snapshots: SnapshotEntry[] }>(
    `/api/competitor/package/${encodeURIComponent(packageCode)}/history?${params.toString()}`,
  );
  return data.snapshots ?? [];
}

/** Local asset paths are stored relative to the static route root. */
export function competitorAssetUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  const segments = localPath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return `/competitor-assets/${segments.map(encodeURIComponent).join("/")}`;
}
