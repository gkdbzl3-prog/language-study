import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { closedWeekForRun } from "../src/lib/studyRules.js";
import {
  TARGET_MEMBERS,
  buildAtomicUpdates,
  collectBandPosts,
  countPostsForWeek,
  requireSyncEnv,
  resolveMemberMappings,
  rollRestSettings,
} from "./lib/bandSync.js";

const env = requireSyncEnv(process.env);

function parseServiceAccount(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must be valid JSON");
  }
}

async function fetchBandPage(nextParams) {
  const params = new URLSearchParams({
    access_token: env.BAND_ACCESS_TOKEN,
    band_key: env.BAND_KEY,
    locale: "ko_KR",
  });
  for (const [key, value] of Object.entries(nextParams || {})) params.set(key, String(value));

  const response = await fetch(`https://openapi.band.us/v2/band/posts?${params}`);
  if (!response.ok) throw new Error(`BAND API request failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body?.result_code !== 1 || !body.result_data) {
    throw new Error(`BAND API rejected the request (result_code: ${body?.result_code ?? "missing"})`);
  }
  return {
    items: body.result_data.items,
    next_params: body.result_data.paging?.next_params,
  };
}

async function main() {
  const now = new Date();
  const range = closedWeekForRun(now);
  const serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const app = getApps()[0] || initializeApp({
    credential: cert(serviceAccount),
    databaseURL: env.FIREBASE_DATABASE_URL,
  });
  const root = getDatabase(app).ref();

  const [mappingSnap, settingsSnap, closedRestSnap] = await Promise.all([
    root.child("bandMembers").get(),
    root.child("memberSettings").get(),
    root.child(`weekRest/${range.weekKey}`).get(),
  ]);
  const storedMappings = mappingSnap.val() || {};
  const settings = settingsSnap.val() || {};
  const closedRest = closedRestSnap.val()
    || Object.fromEntries(
      TARGET_MEMBERS
        .filter(({ siteMemberName }) => settings[siteMemberName]?.restActive === true)
        .map(({ siteMemberName }) => [siteMemberName, true]),
    );

  const posts = await collectBandPosts(fetchBandPage);
  const mappings = resolveMemberMappings(posts, storedMappings);
  const restingMembers = new Set(Object.keys(closedRest).filter((member) => closedRest[member] === true));
  const counts = countPostsForWeek(posts, range, mappings, restingMembers);
  const { appliedSettings, newWeekRestSnapshot } = rollRestSettings(settings, range.newWeekKey);
  const updates = buildAtomicUpdates({
    closedWeekKey: range.weekKey,
    newWeekKey: range.newWeekKey,
    counts,
    closedWeekRestSnapshot: closedRestSnap.exists() ? undefined : closedRest,
    newWeekRestSnapshot,
    appliedSettings,
    mappings,
    completedAt: now.getTime(),
    totalPostsScanned: posts.length,
    matchedPosts: Object.values(counts).reduce((sum, count) => sum + count, 0),
  });

  await root.update(updates);
  console.log(`BAND sync completed for ${range.weekKey}: ${posts.length} scanned, ${updates[`syncMeta/${range.weekKey}`].matchedPosts} matched`);
}

main().catch((error) => {
  console.error(`BAND sync failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
