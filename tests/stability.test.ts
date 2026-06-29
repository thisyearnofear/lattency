import { describe, it, expect } from "vitest";
import { assessStability } from "@/lib/stability";

describe("assessStability", () => {
  it("treats jitter=0 + loss=0 as no-data, not perfect", () => {
    const r = assessStability(0, 0);
    expect(r.hasData).toBe(false);
  });
  it("marks low jitter + low loss as stable", () => {
    const r = assessStability(5, 0.4);
    expect(r.hasData).toBe(true);
    expect(r.stability).toBe("stable");
  });
  it("marks moderate jitter as variable", () => {
    expect(assessStability(20, 0).stability).toBe("variable");
  });
  it("marks high jitter as unstable", () => {
    expect(assessStability(60, 0).stability).toBe("unstable");
  });
  it("loss > 3% also drives unstable regardless of jitter", () => {
    expect(assessStability(2, 5).stability).toBe("unstable");
  });
});
