import type { WeeklyReportResponse } from "../../shared/weeklyReportTypes";

export class WeeklyApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "WeeklyApiError";
  }
}

async function request(input: string): Promise<WeeklyReportResponse> {
  let response: Response;
  try {
    response = await fetch(input);
  } catch {
    throw new WeeklyApiError("网络请求失败，请检查服务是否可用", null);
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new WeeklyApiError("周报服务暂不可用：服务端未配置数据库", 503);
    }
    if (response.status === 400) {
      throw new WeeklyApiError("周参数无效：请选择一个完整的 ISO 周", 400);
    }
    throw new WeeklyApiError(`请求失败（HTTP ${response.status}）`, response.status);
  }

  return (await response.json()) as WeeklyReportResponse;
}

/** `week` is a Monday `YYYY-MM-DD`; omitted means the server's latest complete data week. */
export function getWeeklyReport(week?: string): Promise<WeeklyReportResponse> {
  const query = week ? `?week=${encodeURIComponent(week)}` : "";
  return request(`/api/competitor/weekly-report${query}`);
}
