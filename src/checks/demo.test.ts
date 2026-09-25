import { describe, expect, it } from "vitest";
import { makeDemoProject } from "../model/demo";
import { runChecks, scoreFor } from "./index";

// The demo is the first thing people see, so pin down that each layout keeps
// showing off a different set of checks.
describe("demo project", () => {
  const p = makeDemoProject();
  const [current, a, b] = p.layouts.map((l) => ({ l, issues: runChecks(p.room, l.items) }));
  const codes = (x: typeof current) => new Set(x.issues.map((i) => i.code));

  it("Current: door blocked, window and radiator covered, wardrobe squeezed", () => {
    for (const c of ["doorBlocked", "windowCovered", "radiatorBlocked", "clearanceBlocked", "walkwayNarrow"]) expect(codes(current)).toContain(c);
  });
  it("A: nightstand in the door swing and a narrow walkway", () => {
    const door = a.issues.find((i) => i.code === "doorBlocked")!;
    expect(a.l.items.find((i) => i.id === door.params.a)?.category).toBe("nightstand");
    expect(codes(a)).toContain("walkwayNarrow");
    expect(codes(a)).not.toContain("windowCovered");
  });
  it("B is clean apart from notes, and scores best", () => {
    expect(b.issues.every((i) => i.severity === "info")).toBe(true);
    expect(scoreFor(b.issues)).toBeGreaterThan(scoreFor(a.issues));
    expect(scoreFor(a.issues)).toBeGreaterThan(scoreFor(current.issues));
  });
});
