const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekKeyForKstInstant(date) {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);
  const daysBack = (kstDate.getUTCDay() + 2) % 7;
  kstDate.setUTCDate(kstDate.getUTCDate() - daysBack);
  return formatDateKey(kstDate);
}

export function shiftWeekKey(weekKey, delta) {
  const date = new Date(`${weekKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid week key: ${weekKey}`);
  date.setUTCDate(date.getUTCDate() + delta * 7);
  return formatDateKey(date);
}

export function closedWeekForRun(date) {
  const newWeekKey = weekKeyForKstInstant(date);
  const weekKey = shiftWeekKey(newWeekKey, -1);
  const startMs = Date.parse(`${weekKey}T00:00:00.000+09:00`);
  return { weekKey, newWeekKey, startMs, endMs: startMs + WEEK_MS - 1 };
}

export function getRestView(settings = {}) {
  const active = settings.restActive === true;
  if (typeof settings.pendingRestActive === "boolean") {
    return settings.pendingRestActive ? "pending-rest" : "pending-return";
  }
  return active ? "resting" : "active";
}

export function scheduleRestChange(settings = {}, desired, effectiveWeek) {
  const confirmed = { restActive: settings.restActive === true };
  if (typeof desired !== "boolean") return confirmed;
  return {
    ...confirmed,
    pendingRestActive: desired,
    pendingEffectiveWeek: effectiveWeek,
  };
}

export function isMemberResting(weekRest, weekKey, member) {
  return weekRest?.[weekKey]?.[member] === true;
}
