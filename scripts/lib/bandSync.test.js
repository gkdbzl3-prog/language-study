import { describe, expect, it, vi } from "vitest";
import {
  buildAtomicUpdates,
  collectBandPosts,
  countPostsForWeek,
  requireSyncEnv,
  resolveMemberMappings,
  rollRestSettings,
} from "./bandSync";

const mappings = { u1: "dazero", u2: "비모", u3: "날" };

describe("BAND weekly count", () => {
  it("counts only target members and de-duplicates post_key", () => {
    const posts = [
      { post_key: "p1", created_at: 100, author: { user_key: "u1", name: "dazero" } },
      { post_key: "p1", created_at: 100, author: { user_key: "u1", name: "dazero" } },
      { post_key: "p2", created_at: 200, author: { user_key: "u2", name: "ビモ" } },
      { post_key: "p3", created_at: 200, author: { user_key: "outsider", name: "기타" } },
    ];
    expect(countPostsForWeek(posts, { startMs: 0, endMs: 999 }, mappings, new Set())).toEqual({
      dazero: 1,
      비모: 1,
      모모루: 0,
      시안: 0,
      쫑: 0,
      하루끝: 0,
      햅복: 0,
      연월일: 0,
      날: 0,
    });
  });

  it("omits resting members completely", () => {
    const posts = [{ post_key: "p1", created_at: 100, author: { user_key: "u3", name: "날" } }];
    expect(countPostsForWeek(posts, { startMs: 0, endMs: 999 }, mappings, new Set(["날"]))).not.toHaveProperty("날");
  });

  it("uses created_at boundaries and ignores an old post returned after editing", () => {
    const posts = [
      { post_key: "start", created_at: 100, author: { user_key: "u1", name: "dazero" } },
      { post_key: "end", created_at: 200, author: { user_key: "u1", name: "dazero" } },
      { post_key: "old", created_at: 99, author: { user_key: "u1", name: "dazero" } },
      { post_key: "new", created_at: 201, author: { user_key: "u1", name: "dazero" } },
    ];
    expect(countPostsForWeek(posts, { startMs: 100, endMs: 200 }, mappings, new Set()).dazero).toBe(2);
  });

  it("rejects malformed target post fields instead of writing partial counts", () => {
    expect(() => countPostsForWeek([{ post_key: "p1", created_at: "bad", author: { user_key: "u1" } }], { startMs: 0, endMs: 999 }, mappings, new Set())).toThrow(/created_at/);
  });
});

describe("member mapping", () => {
  it("maps ビモ to the site member 비모", () => {
    expect(resolveMemberMappings([{ author: { user_key: "u2", name: "ビモ" } }], {})).toMatchObject({ u2: "비모" });
  });

  it("leaves a never-posted member unmapped without failing", () => {
    expect(resolveMemberMappings([], {})).toEqual({});
  });

  it("rejects two user keys claiming the same target nickname", () => {
    const posts = [
      { author: { user_key: "u1", name: "날" } },
      { author: { user_key: "u2", name: "날" } },
    ];
    expect(() => resolveMemberMappings(posts, {})).toThrow(/날/);
  });

  it("rejects a stored user key mapped to another site member", () => {
    const posts = [{ author: { user_key: "u1", name: "날" } }];
    expect(() => resolveMemberMappings(posts, { u1: { siteMemberName: "시안", initialBandName: "시안" } })).toThrow(/u1/);
  });
});

describe("BAND pagination", () => {
  it("merges every page until next_params is absent", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ post_key: "p1" }], next_params: { after: "p1" } })
      .mockResolvedValueOnce({ items: [{ post_key: "p2" }] });

    await expect(collectBandPosts(fetchPage)).resolves.toEqual([{ post_key: "p1" }, { post_key: "p2" }]);
    expect(fetchPage.mock.calls).toEqual([[undefined], [{ after: "p1" }]]);
  });

  it("rejects without returning partial posts when a later page fails", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ post_key: "p1" }], next_params: { after: "p1" } })
      .mockRejectedValueOnce(new Error("BAND unavailable"));
    await expect(collectBandPosts(fetchPage)).rejects.toThrow("BAND unavailable");
  });

  it("rejects malformed page items", async () => {
    await expect(collectBandPosts(async () => ({ items: null }))).rejects.toThrow(/items/);
  });
});

describe("atomic Firebase updates", () => {
  it("builds one multi-path payload for counts, rest rollover, mappings and metadata", () => {
    const updates = buildAtomicUpdates({
      closedWeekKey: "2026-08-28",
      newWeekKey: "2026-09-04",
      counts: { 날: 3 },
      newWeekRestSnapshot: { 날: true },
      appliedSettings: { 날: { restActive: true } },
      mappings: { u1: { siteMemberName: "날", initialBandName: "날" } },
      completedAt: 1234,
      totalPostsScanned: 8,
      matchedPosts: 3,
    });
    expect(updates).toEqual({
      "weekData/2026-08-28": { 날: 3 },
      "weekRest/2026-09-04": { 날: true },
      "memberSettings/날": { restActive: true },
      "bandMembers/u1": { siteMemberName: "날", initialBandName: "날" },
      "syncMeta/2026-08-28": { status: "success", completedAt: 1234, totalPostsScanned: 8, matchedPosts: 3 },
    });
  });

  it("initializes a missing closed-week rest snapshot in the same atomic payload", () => {
    expect(buildAtomicUpdates({
      closedWeekKey: "2026-08-28",
      newWeekKey: "2026-09-04",
      counts: {},
      closedWeekRestSnapshot: { 날: true },
      newWeekRestSnapshot: { 날: true },
      appliedSettings: {},
      mappings: {},
      completedAt: 1,
      totalPostsScanned: 0,
      matchedPosts: 0,
    })).toHaveProperty("weekRest/2026-08-28", { 날: true });
  });
});

describe("sync environment", () => {
  it("returns the four required secret values", () => {
    const env = {
      BAND_ACCESS_TOKEN: "token",
      BAND_KEY: "band",
      FIREBASE_SERVICE_ACCOUNT: "{}",
      FIREBASE_DATABASE_URL: "https://example.test",
    };
    expect(requireSyncEnv(env)).toEqual(env);
  });

  it("names every missing secret without exposing present values", () => {
    expect(() => requireSyncEnv({ BAND_ACCESS_TOKEN: "secret" })).toThrow(
      "Missing sync env vars: BAND_KEY, FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL",
    );
  });
});

describe("weekly rest rollover", () => {
  it("applies only reservations effective for the new week", () => {
    expect(rollRestSettings({
      날: { restActive: false, pendingRestActive: true, pendingEffectiveWeek: "2026-09-04" },
      비모: { restActive: true, pendingRestActive: false, pendingEffectiveWeek: "2026-09-11" },
    }, "2026-09-04")).toMatchObject({
      appliedSettings: {
        날: { restActive: true },
        비모: { restActive: true, pendingRestActive: false, pendingEffectiveWeek: "2026-09-11" },
      },
      newWeekRestSnapshot: { 날: true, 비모: true },
    });
  });
});
