import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiLabClient, pairLabSession } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function jsonResponse(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("ExamServer lab API namespace", () => {
  it("pairs and reads state through /api/lab", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);

    await pairLabSession("ABCD23");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/lab/session/pair",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/lab/session/state",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends state actions through /api/lab", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiLabClient();

    await client.selectHypothesis("hyp-web");
    await client.unlockHint("hint-web-1");
    await client.applyGuidance("preset.hard");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/lab/session/hypotheses/hyp-web/select",
      "/api/lab/session/hints/hint-web-1/unlock",
      "/api/lab/session/guidance/preset.hard/apply",
    ]);
  });
});
