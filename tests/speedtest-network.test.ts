import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSpeedTest, type SpeedTestProgress } from "@/lib/speedtest";
import { validateMeasurement } from "@/lib/measurements";

function network(bytes = 10_485_760, uploadStatus = 200) {
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "HEAD") return new Response(null, { status: 200 });
    if (init?.method === "POST") return new Response(null, { status: uploadStatus });
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("speed test network failures", () => {
  beforeEach(() => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 100));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("completes only with a full download and successful uploads", async () => {
    const fetcher = network();
    const progress: SpeedTestProgress[] = [];
    const result = await runSpeedTest((value) => progress.push(value));
    expect(result.downloadBytes).toBe(10_485_760);
    expect(result.downloadDurationMs).toBeGreaterThan(0);
    expect(validateMeasurement(result)).toBeNull();
    expect(progress.at(-1)?.phase).toBe("done");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
  });

  it.each([500, 429])("rejects upload HTTP %i without reporting completion", async (status) => {
    const fetcher = network(10_485_760, status);
    const progress: SpeedTestProgress[] = [];
    await expect(runSpeedTest((value) => progress.push(value)))
      .rejects.toThrow(`upload failed: HTTP ${status}`);
    expect(progress.some((value) => value.phase === "done")).toBe(false);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("rejects a truncated download before uploading or reporting completion", async () => {
    const fetcher = network(1024);
    const progress: SpeedTestProgress[] = [];
    await expect(runSpeedTest((value) => progress.push(value))).rejects.toThrow("download incomplete");
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(progress.some((value) => value.phase === "done")).toBe(false);
  });
});
