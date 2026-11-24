import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";

// Pins the mocked surface to the installed @modelcontextprotocol/sdk 1.32.2.
// The route constructs its transport inline, so module mocking is the only non-invasive seam.
const { transportState } = vi.hoisted(() => ({
  transportState: {
    start: null as null | (() => Promise<void>),
    handleRequest: null as null | ((req: unknown, res: unknown, body: unknown) => Promise<void>),
    close: null as null | (() => Promise<void>),
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: class {
    async start(): Promise<void> {
      if (transportState.start) await transportState.start();
    }
    async close(): Promise<void> {
      if (transportState.close) await transportState.close();
    }
    async handleRequest(req: unknown, res: unknown, body: unknown): Promise<void> {
      if (transportState.handleRequest) await transportState.handleRequest(req, res, body);
    }
  },
}));

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

const rpcBody = (id: unknown, argumentsValue: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "search_apps", arguments: argumentsValue },
});

describe("/mcp route fallback", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    transportState.start = null;
    transportState.handleRequest = null;
    transportState.close = null;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a JSON-RPC internal error with the request id when headers are open", async () => {
    transportState.handleRequest = async () => {
      throw new Error("transport failed");
    };
    // A close failure must not mask the original error or its response.
    transportState.close = async () => {
      throw new Error("close failed");
    };
    const app = await createTestApp(baseDeps);

    const response = await request(app.server).post("/mcp").send(rpcBody(42));

    expect(response.status).toBe(500);
    expect(String(response.headers["content-type"])).toContain("application/json");
    expect(response.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: 42,
    });
  });

  it("destroys the connection when the transport already sent headers", async () => {
    transportState.handleRequest = async (_req, res) => {
      (res as import("node:http").ServerResponse).writeHead(200, { "content-type": "application/json" });
      throw new Error("late failure");
    };
    const app = await createTestApp(baseDeps);

    const outcome: unknown = await request(app.server)
      .post("/mcp")
      .send(rpcBody(7))
      .catch((error: unknown) => error);

    if (outcome instanceof Error) {
      expect(outcome.message).toMatch(/socket hang up|ECONNRESET|aborted/i);
    } else {
      expect((outcome as { text?: string }).text ?? "").toBe("");
    }
  });

  it("logs only the error type and stack frames, never request values", async () => {
    const sentinel = "SENTINEL-483920";
    transportState.handleRequest = async () => {
      throw new Error(`transport failed with ${sentinel}`);
    };
    const app = await createTestApp(baseDeps);

    await request(app.server).post("/mcp").send(rpcBody(1, { code: sentinel }));

    const logged = errorSpy.mock.calls.flat().map((value: unknown) => String(value)).join(" ");
    expect(logged).toContain("Error");
    expect(logged).not.toContain(sentinel);
  });

  it("drops non-frame lines from a multi-line error message before logging", async () => {
    const sentinel = "SENTINEL-LEAK-123";
    transportState.handleRequest = async () => {
      throw new Error(`validation failed\n${sentinel}`);
    };
    const app = await createTestApp(baseDeps);

    await request(app.server).post("/mcp").send(rpcBody(1, { code: sentinel }));

    const logged = errorSpy.mock.calls.flat().map((value: unknown) => String(value)).join(" ");
    expect(logged).toContain("Error");
    expect(logged).not.toContain(sentinel);
  });

  it("returns a JSON-RPC internal error when the transport start fails during connect", async () => {
    const closeSpy = vi.fn(async () => {});
    transportState.start = async () => {
      throw new Error("start failed");
    };
    transportState.close = closeSpy;
    const app = await createTestApp(baseDeps);

    const response = await request(app.server).post("/mcp").send(rpcBody(42));

    expect(response.status).toBe(500);
    expect(String(response.headers["content-type"])).toContain("application/json");
    expect(response.body).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: 42,
    });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("keeps GET and DELETE at 405 with allow: POST", async () => {
    const app = await createTestApp(baseDeps);

    for (const method of ["get", "delete"] as const) {
      const response = method === "get"
        ? await request(app.server).get("/mcp")
        : await request(app.server).delete("/mcp");
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe("POST");
    }
  });
});
