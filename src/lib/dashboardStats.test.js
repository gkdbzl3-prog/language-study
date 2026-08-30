import { expect, it } from "vitest";
import { buildMemberStats } from "./dashboardStats";

it("excludes a rest week from count, fine, bonus and completed weeks", () => {
  const stats = buildMemberStats({
    members: ["날"],
    weeks: ["2026-08-28", "2026-09-04"],
    weekData: { "2026-08-28": { 날: 1 }, "2026-09-04": { 날: 4 } },
    weekRest: { "2026-08-28": { 날: true } },
  });
  expect(stats[0]).toMatchObject({ member: "날", fine: 0, bonus: 900, completedWeeks: 1, totalCount: 4 });
  expect(stats[0].details).toEqual([{ week: "2026-09-04", count: 4, fine: 0, bonus: 900 }]);
});

it("keeps existing fine and bonus rules for active weeks", () => {
  const [stats] = buildMemberStats({
    members: ["비모"],
    weeks: ["w0", "w1", "w2", "w3", "w5"],
    weekData: { w0: { 비모: 0 }, w1: { 비모: 1 }, w2: { 비모: 2 }, w3: { 비모: 3 }, w5: { 비모: 5 } },
    weekRest: {},
  });
  expect(stats).toMatchObject({ fine: 2100, bonus: 1800, completedWeeks: 2, totalCount: 11 });
});

it("does not charge for a missing active-week count", () => {
  const [stats] = buildMemberStats({ members: ["날"], weeks: ["2026-08-28"], weekData: {}, weekRest: {} });
  expect(stats).toMatchObject({ fine: 0, bonus: 0, completedWeeks: 0, totalCount: 0, details: [] });
});
