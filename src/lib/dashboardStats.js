const FINE_BY_COUNT = { 0: 1000, 1: 700, 2: 400 };
const BASE_BONUS = 800;

export function buildMemberStats({ members, weeks, weekData, weekRest }) {
  return members.map((member) => {
    let fine = 0;
    let bonus = 0;
    let completedWeeks = 0;
    let totalCount = 0;
    const details = [];

    for (const week of weeks) {
      if (weekRest?.[week]?.[member] === true) continue;
      const count = weekData?.[week]?.[member];
      if (count === null || count === undefined) continue;
      const weekFine = FINE_BY_COUNT[count] || 0;
      const weekBonus = count >= 3 ? BASE_BONUS + (count - 3) * 100 : 0;
      fine += weekFine;
      bonus += weekBonus;
      totalCount += count;
      if (count >= 3) completedWeeks += 1;
      details.push({ week, count, fine: weekFine, bonus: weekBonus });
    }

    return { member, fine, bonus, completedWeeks, totalCount, details };
  });
}
