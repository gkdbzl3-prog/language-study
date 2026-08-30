import { describe, expect, it } from "vitest";
import {
  closedWeekForRun,
  getRestView,
  isMemberResting,
  scheduleRestChange,
  shiftWeekKey,
  weekKeyForKstInstant,
} from "./studyRules";

describe("KST week rules", () => {
  it("keeps Thursday 23:59:59 in the ending Friday-keyed week", () => {
    expect(weekKeyForKstInstant(new Date("2026-09-03T14:59:59.999Z"))).toBe("2026-08-28");
  });

  it("moves Friday 00:00 to the new week", () => {
    expect(weekKeyForKstInstant(new Date("2026-09-03T15:00:00.000Z"))).toBe("2026-09-04");
  });

  it("selects the just-closed week at Friday 00:10", () => {
    expect(closedWeekForRun(new Date("2026-09-03T15:10:00.000Z"))).toEqual({
      weekKey: "2026-08-28",
      newWeekKey: "2026-09-04",
      startMs: Date.parse("2026-08-27T15:00:00.000Z"),
      endMs: Date.parse("2026-09-03T14:59:59.999Z"),
    });
  });

  it("shifts Friday week keys without depending on the machine timezone", () => {
    expect(shiftWeekKey("2026-12-25", 1)).toBe("2027-01-01");
  });
});

describe("rest scheduling", () => {
  it("shows a pending rest without changing the active state", () => {
    const next = scheduleRestChange({ restActive: false }, true, "2026-09-04");
    expect(next).toEqual({ restActive: false, pendingRestActive: true, pendingEffectiveWeek: "2026-09-04" });
    expect(getRestView(next)).toBe("pending-rest");
  });

  it("shows a pending return without changing the active state", () => {
    const next = scheduleRestChange({ restActive: true }, false, "2026-09-04");
    expect(next).toEqual({ restActive: true, pendingRestActive: false, pendingEffectiveWeek: "2026-09-04" });
    expect(getRestView(next)).toBe("pending-return");
  });

  it("cancels a pending change while preserving the confirmed state", () => {
    expect(scheduleRestChange({ restActive: true, pendingRestActive: false, pendingEffectiveWeek: "2026-09-04" }, null, null)).toEqual({ restActive: true });
  });

  it("uses the immutable weekly snapshot for historical rest state", () => {
    expect(isMemberResting({ "2026-08-28": { 날: true } }, "2026-08-28", "날")).toBe(true);
    expect(isMemberResting({ "2026-08-28": { 날: true } }, "2026-09-04", "날")).toBe(false);
  });
});
