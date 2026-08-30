export const TARGET_MEMBERS = [
  { siteMemberName: "dazero", initialBandName: "dazero" },
  { siteMemberName: "비모", initialBandName: "ビモ" },
  { siteMemberName: "모모루", initialBandName: "모모루" },
  { siteMemberName: "시안", initialBandName: "시안" },
  { siteMemberName: "쫑", initialBandName: "쫑" },
  { siteMemberName: "하루끝", initialBandName: "하루끝" },
  { siteMemberName: "햅복", initialBandName: "햅복" },
  { siteMemberName: "연월일", initialBandName: "연월일" },
  { siteMemberName: "날", initialBandName: "날" },
];

const targetByBandName = new Map(TARGET_MEMBERS.map((member) => [member.initialBandName, member]));
const targetBySiteName = new Map(TARGET_MEMBERS.map((member) => [member.siteMemberName, member]));
const REQUIRED_SYNC_ENV = [
  "BAND_ACCESS_TOKEN",
  "BAND_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "FIREBASE_DATABASE_URL",
];

export function requireSyncEnv(env) {
  const missing = REQUIRED_SYNC_ENV.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing sync env vars: ${missing.join(", ")}`);
  return Object.fromEntries(REQUIRED_SYNC_ENV.map((name) => [name, env[name]]));
}

export async function collectBandPosts(fetchPage) {
  const posts = [];
  let params;
  do {
    const page = await fetchPage(params);
    if (!page || !Array.isArray(page.items)) throw new Error("Invalid BAND page items");
    posts.push(...page.items);
    params = page.next_params || undefined;
  } while (params);
  return posts;
}

function storedSiteName(mapping) {
  return typeof mapping === "string" ? mapping : mapping?.siteMemberName;
}

export function resolveMemberMappings(posts, storedMappings = {}) {
  const resolved = Object.fromEntries(
    Object.entries(storedMappings).map(([userKey, mapping]) => [userKey, storedSiteName(mapping)]),
  );
  const userBySiteName = new Map(Object.entries(resolved).map(([userKey, siteName]) => [siteName, userKey]));

  for (const post of posts) {
    const userKey = post?.author?.user_key;
    const bandName = post?.author?.name;
    const target = targetByBandName.get(bandName);
    if (!target) continue;
    if (!userKey) throw new Error(`Target member ${bandName} has no user_key`);

    const existingSiteName = resolved[userKey];
    if (existingSiteName && existingSiteName !== target.siteMemberName) {
      throw new Error(`Stored BAND user ${userKey} conflicts with ${target.siteMemberName}`);
    }
    const existingUserKey = userBySiteName.get(target.siteMemberName);
    if (existingUserKey && existingUserKey !== userKey) {
      throw new Error(`Target member ${target.siteMemberName} has multiple BAND user keys`);
    }
    resolved[userKey] = target.siteMemberName;
    userBySiteName.set(target.siteMemberName, userKey);
  }

  return Object.fromEntries(Object.entries(resolved).filter(([, siteName]) => targetBySiteName.has(siteName)));
}

function assertValidPost(post) {
  if (!post || typeof post.post_key !== "string" || !post.post_key) throw new Error("Invalid post_key");
  if (typeof post.created_at !== "number" || !Number.isFinite(post.created_at)) throw new Error("Invalid created_at");
  if (!post.author || typeof post.author.user_key !== "string" || !post.author.user_key) throw new Error("Invalid author.user_key");
}

export function countPostsForWeek(posts, range, mappings, restingMembers = new Set()) {
  if (!Number.isFinite(range?.startMs) || !Number.isFinite(range?.endMs) || range.endMs < range.startMs) {
    throw new Error("Invalid weekly range");
  }
  const counts = Object.fromEntries(
    TARGET_MEMBERS
      .map(({ siteMemberName }) => siteMemberName)
      .filter((siteName) => !restingMembers.has(siteName))
      .map((siteName) => [siteName, 0]),
  );
  const seen = new Set();

  for (const post of posts) {
    assertValidPost(post);
    if (seen.has(post.post_key)) continue;
    seen.add(post.post_key);
    if (post.created_at < range.startMs || post.created_at > range.endMs) continue;
    const siteName = storedSiteName(mappings[post.author.user_key]);
    if (Object.hasOwn(counts, siteName)) counts[siteName] += 1;
  }
  return counts;
}

export function rollRestSettings(settings, newWeekKey) {
  const appliedSettings = {};
  const newWeekRestSnapshot = {};
  for (const { siteMemberName } of TARGET_MEMBERS) {
    const current = settings[siteMemberName] || {};
    const appliesNow = current.pendingEffectiveWeek === newWeekKey
      && typeof current.pendingRestActive === "boolean";
    const restActive = appliesNow ? current.pendingRestActive : current.restActive === true;
    const next = { restActive };
    if (!appliesNow && typeof current.pendingRestActive === "boolean" && current.pendingEffectiveWeek) {
      next.pendingRestActive = current.pendingRestActive;
      next.pendingEffectiveWeek = current.pendingEffectiveWeek;
    }
    appliedSettings[siteMemberName] = next;
    if (restActive) newWeekRestSnapshot[siteMemberName] = true;
  }
  return { appliedSettings, newWeekRestSnapshot };
}

export function buildAtomicUpdates({
  closedWeekKey,
  newWeekKey,
  counts,
  closedWeekRestSnapshot,
  newWeekRestSnapshot,
  appliedSettings,
  mappings,
  completedAt,
  totalPostsScanned,
  matchedPosts,
}) {
  const updates = {
    [`weekData/${closedWeekKey}`]: counts,
    [`weekRest/${newWeekKey}`]: newWeekRestSnapshot,
    [`syncMeta/${closedWeekKey}`]: {
      status: "success",
      completedAt,
      totalPostsScanned,
      matchedPosts,
    },
  };
  if (closedWeekRestSnapshot) {
    updates[`weekRest/${closedWeekKey}`] = closedWeekRestSnapshot;
  }
  for (const [member, setting] of Object.entries(appliedSettings)) {
    updates[`memberSettings/${member}`] = setting;
  }
  for (const [userKey, mapping] of Object.entries(mappings)) {
    const siteMemberName = storedSiteName(mapping);
    const target = targetBySiteName.get(siteMemberName);
    updates[`bandMembers/${userKey}`] = {
      siteMemberName,
      initialBandName: mapping?.initialBandName || target?.initialBandName || siteMemberName,
    };
  }
  return updates;
}
