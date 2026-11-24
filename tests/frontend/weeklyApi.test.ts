import { afterEach, describe, expect, it, vi } from "vitest";
import { WeeklyApiError, getWeeklyReport } from "../../src/lib/weeklyApi";
import { json, weeklyReport } from "./weeklyFixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weekly API", () => {
  it("omits the week parameter by default", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => json(weeklyReport()));
    vi.stubGlobal("fetch", fetchMock);

    const report = await getWeeklyReport();

    expect(report.weekStart).toBe("2026-11-16");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/competitor/weekly-report");
  });

  it("passes an explicit week through the query string", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => json(weeklyReport()));
    vi.stubGlobal("fetch", fetchMock);

    await getWeeklyReport("2026-11-09");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "/api/competitor/weekly-report?week=2026-11-09",
    );
  });

  it("maps a 503 response to the weekly service message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Competitor data is unavailable" }, 503)));

    const error = await getWeeklyReport().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WeeklyApiError);
    expect(error).toMatchObject({
      status: 503,
      message: "周报服务暂不可用：服务端未配置数据库",
    });
  });

  it("maps a 400 response to the invalid-week message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "A valid week is required" }, 400)));

    const error = await getWeeklyReport("bad").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WeeklyApiError);
    expect(error).toMatchObject({
      status: 400,
      message: "周参数无效：请选择一个完整的 ISO 周",
    });
  });

  it("maps network failures to a status-less error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    const error = await getWeeklyReport().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WeeklyApiError);
    expect(error).toMatchObject({
      status: null,
      message: "网络请求失败，请检查服务是否可用",
    });
  });
});
