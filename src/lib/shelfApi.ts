import type {
  ShelfGroupBy,
  ShelfPackagesResponse,
  ShelfTrendResponse,
} from "../../shared/shelfTypes";

export class ShelfApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ShelfApiError";
  }
}

async function request<T>(input: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input);
  } catch {
    throw new ShelfApiError("网络请求失败，请检查服务是否可用", null);
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new ShelfApiError("竞品趋势暂不可用：服务端未配置数据库", 503);
    }
    if (response.status === 400) {
      throw new ShelfApiError("筛选参数无效：请检查日期、团队或分布维度", 400);
    }
    throw new ShelfApiError(`请求失败（HTTP ${response.status}）`, response.status);
  }

  return (await response.json()) as T;
}

function rangeParams(from: string, to: string, team: string | null): URLSearchParams {
  const params = new URLSearchParams({ from, to });
  if (team) params.set("team", team);
  return params;
}

export type ShelfTrendQuery = {
  from: string;
  to: string;
  team: string | null;
  groupBy: ShelfGroupBy;
};

export function getShelfTrend({ from, to, team, groupBy }: ShelfTrendQuery): Promise<ShelfTrendResponse> {
  const params = rangeParams(from, to, team);
  params.set("group_by", groupBy);
  return request<ShelfTrendResponse>(`/api/public/shelf/trend?${params.toString()}`);
}

export type ShelfPackagesQuery = {
  from: string;
  to: string;
  team: string | null;
  limit?: number;
};

export function getShelfPackages({ from, to, team, limit }: ShelfPackagesQuery): Promise<ShelfPackagesResponse> {
  const params = rangeParams(from, to, team);
  if (limit !== undefined) params.set("limit", String(limit));
  return request<ShelfPackagesResponse>(`/api/public/shelf/packages?${params.toString()}`);
}
