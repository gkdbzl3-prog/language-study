import { useState, useEffect, useRef } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "./firebase";

// 뱃지는 📝 하나로 통일하고 숫자만 변함. 색은 3단계(미달/진행/완료)로 구분
const TIER = {
  fail: { color: "#ef4444", bg: "#3f0f0f", border: "#7f1d1d" }, // 0개: 미달
  prog: { color: "#f59e0b", bg: "#431407", border: "#7c2d12" }, // 1~2개: 진행
  done: { color: "#22c55e", bg: "#052e16", border: "#14532d" }, // 3개 이상: 완료
};
const statusText = (n) =>
  n === 0 ? "미인증" : n < 3 ? `${n}회` : n === 3 ? "완료" : `${n}회 +${(n - 3) * 100}`;
const STATUS = Object.fromEntries(
  Array.from({ length: 15 }, (_, n) => {
    const tier = n === 0 ? TIER.fail : n < 3 ? TIER.prog : TIER.done;
    return [n, { ...tier, emoji: "📝", text: statusText(n) }];
  })
);

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 주차 기준: 금요일~목요일
// weekKey = "YYYY-MM-DD" (해당 주 금요일 날짜 문자열)

function weekKeyToFriday(weekKey) {
  const [y, m, d] = weekKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getCurrentWeekKey() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const daysBack = (now.getDay() + 2) % 7;
  now.setDate(now.getDate() - daysBack);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekLabel(weekKey) {
  const friday = weekKeyToFriday(weekKey);
  const thursday = new Date(friday); thursday.setDate(friday.getDate() + 6);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const isCur = weekKey === getCurrentWeekKey();
  return `${friday.getFullYear()}년 ${fmt(friday)}~${fmt(thursday)}${isCur ? " (이번주)" : ""}`;
}

function shiftWeek(weekKey, delta) {
  const friday = weekKeyToFriday(weekKey);
  friday.setDate(friday.getDate() + delta * 7);
  const y = friday.getFullYear();
  const m = String(friday.getMonth() + 1).padStart(2, "0");
  const d = String(friday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatFullDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_LABELS[date.getDay()]})`;
}

function getMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function sanitizeAmount(value) {
  const amount = Math.floor(Number(value) || 0);
  return amount > 0 ? amount : 0;
}

function dateToWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysBack = (d.getDay() + 2) % 7;
  d.setDate(d.getDate() - daysBack);
  return formatDateKey(d);
}

function getWeeksInMonth(year, month) {
  const weeks = [];
  const d = new Date(year, month, 1);
  d.setHours(0, 0, 0, 0);
  const daysUntilFriday = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilFriday);

  while (d.getMonth() === month) {
    weeks.push(formatDateKey(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

const FINE_MAP = { 0: 1000, 1: 700, 2: 400, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0 };
const BONUS_3 = 800; // 3회 이상 달성 시 기본 적립금 (4회부터 100원씩 추가)

// Firebase 쓰기 헬퍼
const fbSet = (path, val) => set(ref(db, path), val);

export default function StudyDashboard() {
  const [members, setMembers] = useState([]);
  const [weekData, setWeekData] = useState({});
  const [rewardDecisions, setRewardDecisions] = useState({});
  const [dbLoaded, setDbLoaded] = useState(false);
  const loadedRef = useRef({ members: false, weekData: false, rewardDecisions: false });

  const [viewWeek, setViewWeek] = useState(getCurrentWeekKey());
  const [newMember, setNewMember] = useState("");
  const [tab, setTab] = useState("current");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const [settleMonth, setSettleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Firebase 실시간 구독
  useEffect(() => {
    const markLoaded = (key) => {
      loadedRef.current[key] = true;
      if (Object.values(loadedRef.current).every(Boolean)) setDbLoaded(true);
    };

    const unsubMembers = onValue(ref(db, "members"), (snap) => {
      setMembers(snap.val() || []);
      markLoaded("members");
    });
    const unsubWeekData = onValue(ref(db, "weekData"), (snap) => {
      setWeekData(snap.val() || {});
      markLoaded("weekData");
    });
    const unsubRewardDecisions = onValue(ref(db, "rewardDecisions"), (snap) => {
      setRewardDecisions(snap.val() || {});
      markLoaded("rewardDecisions");
    });

    return () => { unsubMembers(); unsubWeekData(); unsubRewardDecisions(); };
  }, []);

  const settleMonthKey = getMonthKey(settleMonth.year, settleMonth.month);
  const settleWeeks = getWeeksInMonth(settleMonth.year, settleMonth.month);
  const settleMonthLabel = `${settleMonth.year}년 ${settleMonth.month + 1}월`;
  const settleRewardDate = (() => {
    const lastWeek = settleWeeks[settleWeeks.length - 1];
    if (!lastWeek) return null;
    const rewardDate = weekKeyToFriday(lastWeek);
    rewardDate.setDate(rewardDate.getDate() + 7);
    return rewardDate;
  })();
  const settleCloseDate = settleRewardDate ? new Date(settleRewardDate) : null;
  if (settleCloseDate) settleCloseDate.setDate(settleCloseDate.getDate() - 1);

  const updateRewardDecision = (monthKey, slotKey, decision) => {
    const next = {
      ...rewardDecisions,
      [monthKey]: {
        ...(rewardDecisions[monthKey] || {}),
        [slotKey]: decision,
      },
    };
    setRewardDecisions(next);
    fbSet("rewardDecisions", next);
  };

  const carryoverTotals = Object.values(rewardDecisions).reduce((acc, monthData) => {
    Object.values(monthData || {}).forEach((decision) => {
      if (!decision || !decision.member) return;
      if (decision.status === "carry") {
        const amount = sanitizeAmount(decision.amount);
        if (amount > 0) acc[decision.member] = (acc[decision.member] || 0) + amount;
      }
      if (decision.status === "paid" && decision.consumedCarryover) {
        const consumed = sanitizeAmount(decision.consumedCarryover);
        if (consumed > 0) acc[decision.member] = (acc[decision.member] || 0) - consumed;
      }
    });
    return acc;
  }, {});

  const carryoverMembers = Object.entries(carryoverTotals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const addMember = () => {
    const name = newMember.trim();
    if (!name || members.includes(name)) return;
    const next = [...members, name];
    setMembers(next);
    fbSet("members", next);
    setNewMember(""); setShowAdd(false);
    showToast(`✓ ${name} 추가됨`);
  };

  const removeMember = (name) => {
    if (!confirm(`${name}을(를) 삭제할까요?`)) return;
    const next = members.filter((m) => m !== name);
    setMembers(next);
    fbSet("members", next);
    showToast(`${name} 삭제됨`);
  };

  const setCount = (week, member, count) => {
    const next = { ...weekData, [week]: { ...(weekData[week] || {}), [member]: count } };
    setWeekData(next);
    fbSet("weekData", next);
  };

  const getCount = (week, member) => weekData[week]?.[member] ?? null;

  const allWeeks = Array.from(new Set([
    getCurrentWeekKey(),
    ...Object.keys(weekData).filter((w) => Object.keys(weekData[w] || {}).length > 0),
  ])).sort().reverse();

  const heatmapWeeks = (() => {
    const weeks = []; let w = getCurrentWeekKey();
    for (let i = 0; i < 8; i++) { weeks.unshift(w); w = shiftWeek(w, -1); }
    return weeks;
  })();

  const filledCount = members.filter((m) => getCount(viewWeek, m) !== null).length;
  const isCurrentWeek = viewWeek === getCurrentWeekKey();

  const NavBtn = ({ children, onClick, disabled }) => (
    <button onClick={disabled ? undefined : onClick} style={{ background: disabled ? "#0f172a" : "#1e293b", border: `1px solid ${disabled ? "#1e293b" : "#475569"}`, borderRadius: 8, width: 36, height: 36, color: disabled ? "#334155" : "#e2e8f0", cursor: disabled ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
      {children}
    </button>
  );

  // Firebase 연결 전 로딩 화면
  if (!dbLoaded) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0f1e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Noto Sans KR', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet" />
        <div style={{ fontSize: 40 }}>📚</div>
        <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: 18 }}>데이터 불러오는 중...</div>
        <div style={{ color: "#475569", fontSize: 13 }}>Firebase 연결 중</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1e", color: "#e2e8f0", fontFamily: "'Noto Sans KR', sans-serif", paddingBottom: 80, maxWidth: "100vw", overflowX: "hidden", boxSizing: "border-box" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet" />

      <div style={{ background: "#111827", padding: "28px 20px 18px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 10, color: "#475569", letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>Language Study Group</div>
        <div style={{ fontSize: 24, fontWeight: 900, background: "linear-gradient(90deg,#38bdf8,#818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          스터디 대시보드
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>멤버 {members.length}명 관리 중</div>
      </div>

      <div style={{ display: "flex", background: "#111827", borderBottom: "1px solid #1e293b", position: "sticky", top: 0, zIndex: 10, width: "100%", maxWidth: "100vw", boxSizing: "border-box" }}>
        {[["current", "📋", "주차입력"], ["heatmap", "🗓", "현황판"], ["settle", "💰", "정산"], ["history", "📊", "기록"], ["members", "👥", "멤버"]].map(([key, icon, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flex: "1 1 0", padding: "9px 0", background: "none", border: "none", borderBottom: tab === key ? "2px solid #38bdf8" : "2px solid transparent", color: tab === key ? "#38bdf8" : "#475569", fontWeight: tab === key ? 700 : 400, fontSize: 10, cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit" }}>
            <div style={{ fontSize: 14 }}>{icon}</div>
            <div>{label}</div>
          </button>
        ))}
      </div>

      <div style={{ padding: "18px 14px", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }}>

        {tab === "current" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, background: "#111827", borderRadius: 14, padding: "12px 14px", border: `1px solid ${isCurrentWeek ? "#1e293b" : "#7c2d12"}` }}>
              <NavBtn onClick={() => setViewWeek((w) => shiftWeek(w, -1))}>◀</NavBtn>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>{getWeekLabel(viewWeek)}</div>
                {!isCurrentWeek && <div style={{ fontSize: 11, color: "#f97316", marginTop: 2 }}>● 소급 입력 중</div>}
              </div>
              <NavBtn onClick={() => setViewWeek((w) => shiftWeek(w, 1))} disabled={isCurrentWeek}>▶</NavBtn>
            </div>

            {!isCurrentWeek && (
              <button onClick={() => setViewWeek(getCurrentWeekKey())}
                style={{ width: "100%", marginBottom: 12, padding: "9px", background: "none", border: "1px solid #38bdf8", borderRadius: 10, color: "#38bdf8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                이번 주로 돌아가기 →
              </button>
            )}

            {members.length > 0 && (
              <div style={{ background: "#111827", borderRadius: 12, padding: "11px 14px", marginBottom: 14, border: "1px solid #1e293b" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 7 }}>
                  <span style={{ color: "#64748b" }}>입력 완료</span>
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>{filledCount} / {members.length}명</span>
                </div>
                <div style={{ background: "#0a0f1e", borderRadius: 99, height: 6 }}>
                  <div style={{ width: members.length ? `${(filledCount / members.length) * 100}%` : "0%", height: "100%", background: "linear-gradient(90deg,#38bdf8,#818cf8)", borderRadius: 99, transition: "width 0.4s" }} />
                </div>
              </div>
            )}

            {members.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>👥</div>
                <div>멤버 탭에서 멤버를 추가해주세요</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {members.map((member) => {
                  const count = getCount(viewWeek, member);
                  const cfg = count !== null ? STATUS[count] : null;
                  return (
                    <div key={member} style={{ background: cfg ? cfg.bg : "#111827", borderRadius: 14, padding: "14px", border: `1px solid ${cfg ? cfg.border : "#1e293b"}`, transition: "all 0.2s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{member}</span>
                        {cfg && <span style={{ color: cfg.color, fontSize: 13, fontWeight: 700 }}>{cfg.emoji} {cfg.text}</span>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14]].map((row, ri) => (
                          <div key={ri} style={{ display: "flex", gap: 7 }}>
                            {row.map((n) => {
                              const s = STATUS[n];
                              const sel = count === n;
                              return (
                                <button key={n} onClick={() => setCount(viewWeek, member, n)}
                                  style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `2px solid ${sel ? s.color : "#334155"}`, background: sel ? s.bg : "#0a0f1e", color: sel ? s.color : "#475569", fontWeight: sel ? 700 : 400, cursor: "pointer", fontSize: 14, transition: "all 0.15s", fontFamily: "inherit" }}>
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "heatmap" && (
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>최근 8주 · 멤버별 인증 현황 (셀 클릭 → 해당 주 입력)</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {[14,13,12,11,10,9,8,7,6,5,4,3,2,1,0].map(n => {
                const s = STATUS[n];
                return (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 5, background: s.bg, borderRadius: 8, padding: "5px 10px", border: `1px solid ${s.border}` }}>
                    <span style={{ fontSize: 14 }}>{s.emoji}</span>
                    <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{n}개</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#111827", borderRadius: 8, padding: "5px 10px", border: "1px solid #1e293b" }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: "#1e293b", border: "1px solid #334155" }} />
                <span style={{ fontSize: 12, color: "#475569" }}>미입력</span>
              </div>
            </div>

            {members.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>🗓</div>
                <div>멤버를 먼저 추가해주세요</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, color: "#475569", fontWeight: 500, minWidth: 65 }}></th>
                      {heatmapWeeks.map((w) => {
                        const fri = weekKeyToFriday(w);
                        const isCur = w === getCurrentWeekKey();
                        return (
                          <th key={w} style={{ padding: "4px 3px", fontSize: 10, color: isCur ? "#38bdf8" : "#475569", fontWeight: isCur ? 700 : 400, textAlign: "center", minWidth: 38 }}>
                            <div>{`${fri.getMonth()+1}/${fri.getDate()}`}</div>
                            {isCur && <div style={{ fontSize: 8, color: "#38bdf8", marginTop: 1 }}>●</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member}>
                        <td style={{ padding: "5px 10px", fontSize: 13, fontWeight: 600, color: "#cbd5e1", whiteSpace: "nowrap" }}>{member}</td>
                        {heatmapWeeks.map((w) => {
                          const c = getCount(w, member);
                          const s = c !== null ? STATUS[c] : null;
                          const isCur = w === getCurrentWeekKey();
                          return (
                            <td key={w} style={{ padding: "3px", textAlign: "center" }}>
                              <div
                                onClick={() => { setViewWeek(w); setTab("current"); }}
                                style={{ width: 34, height: 34, borderRadius: 8, background: s ? s.color : "#1e293b", margin: "0 auto", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: isCur ? "2px solid #38bdf8" : "2px solid transparent", opacity: s ? 1 : 0.35, transition: "transform 0.1s" }}
                                onMouseOver={e => e.currentTarget.style.transform = "scale(1.2)"}
                                onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                              >
                                {s ? s.emoji : ""}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {members.length > 0 && (
              <div style={{ marginTop: 20, background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b" }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>이번 주 요약</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                  {[14,13,12,11,10,9,8,7,6,5,4,3,2,1,0].map(n => {
                    const s = STATUS[n];
                    const cnt = members.filter(m => getCount(getCurrentWeekKey(), m) === n).length;
                    return (
                      <div key={n} style={{ textAlign: "center", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "10px 4px" }}>
                        <div style={{ fontSize: 18 }}>{s.emoji}</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{cnt}</div>
                        <div style={{ fontSize: 10, color: s.color, opacity: 0.8 }}>{n}개</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "settle" && (() => {
          const memberStats = members.map((member) => {
            let fine = 0, bonus = 0, details = [];
            settleWeeks.forEach((w) => {
              const c = getCount(w, member);
              if (c === null) return;
              const weekFine = FINE_MAP[c] ?? 0;
              const weekBonus = c >= 3 ? BONUS_3 + (c - 3) * 100 : 0;
              fine += weekFine;
              bonus += weekBonus;
              details.push({ week: w, count: c, fine: weekFine, bonus: weekBonus });
            });
            return { member, fine, bonus, details };
          });
          const totalFine = memberStats.reduce((s, m) => s + m.fine, 0);
          const totalBonus = memberStats.reduce((s, m) => s + m.bonus, 0);
          const totalPool = totalFine + totalBonus;
          // 2026년 5월부터: 순위(1·2등) 없이 각자 정산 누적액(적립금-벌금)을 지급
          const useNewSettle = settleMonthKey >= "2026-05";
          // 5월부터: 누적액(적립금) = 기본 상금 + 게시글 수 상금. 멤버별로 수령/이월 선택
          const payoutMonthDecisions = rewardDecisions[settleMonthKey] || {};
          const payoutByMember = {};
          // 벌금은 매주 따로 걷으므로 월 정산 지급은 누적액(bonus)만 대상
          memberStats.forEach(({ member, fine, bonus }) => {
            const slotKey = `payout_${member}`;
            const stored = payoutMonthDecisions[slotKey];
            const sameMember = stored?.member === member;
            const status = sameMember ? (stored?.status || null) : null;
            const consumedCarryover = sameMember ? sanitizeAmount(stored?.consumedCarryover) : 0;
            const currentCarry = status === "carry" ? bonus : 0;
            const previousCarryover = Math.max((carryoverTotals[member] || 0) - currentCarry, 0);
            payoutByMember[member] = { member, fine, bonus, slotKey, status, consumedCarryover, previousCarryover };
          });
          const savePayoutDecision = (row, status) => {
            updateRewardDecision(settleMonthKey, row.slotKey, status === "paid"
              ? { member: row.member, amount: row.bonus + row.previousCarryover, status: "paid", consumedCarryover: row.previousCarryover }
              : { member: row.member, amount: row.bonus, status: "carry", consumedCarryover: 0 });
          };

          const monthlyPerfect = members.map((member, index) => ({
            member,
            index,
            count: settleWeeks.filter((w) => (getCount(w, member) ?? -1) >= 3).length,
            totalCount: settleWeeks.reduce((sum, w) => sum + (getCount(w, member) ?? 0), 0),
          })).sort((a, b) => (b.count - a.count) || (b.totalCount - a.totalCount) || (a.index - b.index));
          const rankedMembers = monthlyPerfect.filter((m) => m.count > 0);
          const top1 = rankedMembers[0] || null;
          const top2 = rankedMembers[1] || null;
          const top1Count = top1?.count || 0;
          const top2Count = top2?.count || 0;
          const rewardSlots = [
            top1 ? { slotKey: "top1", rank: 1, badge: "🥇", title: "1등", member: top1.member, count: top1.count, colors: { bg: "linear-gradient(135deg,#fbbf24,#f59e0b)", text: "#451a03", sub: "#78350f" } } : null,
            totalPool >= 10000 && top2 ? { slotKey: "top2", rank: 2, badge: "🥈", title: "2등", member: top2.member, count: top2.count, colors: { bg: "linear-gradient(135deg,#94a3b8,#cbd5e1)", text: "#1e293b", sub: "#334155" } } : null,
          ].filter(Boolean);
          const splitBase = rewardSlots.length ? Math.floor(totalPool / rewardSlots.length) : 0;
          const splitRemainder = rewardSlots.length ? totalPool % rewardSlots.length : 0;
          const monthRewardDecisions = rewardDecisions[settleMonthKey] || {};
          const rewardRecipients = rewardSlots.map((slot, index) => {
            const stored = monthRewardDecisions[slot.slotKey];
            const sameMember = stored?.member === slot.member;
            const defaultAmount = rewardSlots.length === 1
              ? totalPool
              : splitBase + (index === 0 ? splitRemainder : 0);
            const amount = sameMember && sanitizeAmount(stored?.amount) > 0
              ? sanitizeAmount(stored.amount)
              : defaultAmount;
            const status = sameMember ? (stored?.status || null) : null;
            const consumedCarryover = sameMember ? sanitizeAmount(stored?.consumedCarryover) : 0;
            const currentCarry = status === "carry" ? amount : 0;
            const previousCarryover = Math.max((carryoverTotals[slot.member] || 0) - currentCarry, 0);
            return { ...slot, amount, status, previousCarryover, consumedCarryover };
          });
          const saveRewardDecision = (slot, patch = {}) => {
            const newStatus = "status" in patch ? patch.status : slot.status;
            updateRewardDecision(settleMonthKey, slot.slotKey, {
              member: slot.member,
              rank: slot.rank,
              count: slot.count,
              amount: "amount" in patch ? sanitizeAmount(patch.amount) : slot.amount,
              status: newStatus,
              consumedCarryover: "consumedCarryover" in patch
                ? sanitizeAmount(patch.consumedCarryover)
                : (newStatus === "carry" ? 0 : (slot.consumedCarryover || 0)),
            });
          };

          return (
            <div>
              {/* 월 네비게이션 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, background: "#111827", borderRadius: 14, padding: "12px 14px", border: "1px solid #1e293b" }}>
                <NavBtn onClick={() => setSettleMonth((p) => {
                  const m = p.month - 1;
                  return m < 0 ? { year: p.year - 1, month: 11 } : { ...p, month: m };
                })}>◀</NavBtn>
                <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>{settleMonthLabel}</div>
                <NavBtn onClick={() => setSettleMonth((p) => {
                  const m = p.month + 1;
                  return m > 11 ? { year: p.year + 1, month: 0 } : { ...p, month: m };
                })}>▶</NavBtn>
              </div>

              {settleRewardDate && settleCloseDate && (
                <div style={{ marginBottom: 12, background: "#0a0f1e", borderRadius: 12, padding: "12px 14px", border: "1px solid #334155" }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>금요일 시작 주차 기준</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#cbd5e1" }}>누계 마감 {formatFullDate(settleCloseDate)}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>{useNewSettle ? "💸 정산 지급" : "🎁 상품 증정"} {formatFullDate(settleRewardDate)}</span>
                  </div>
                </div>
              )}

              {/* 💰 벌금 & 적립금 상세 */}
              <div style={{ background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 14 }}>💰 {settleMonthLabel} 정산</div>

                {/* 총액 요약 카드 */}
                <div style={{ display: "grid", gridTemplateColumns: useNewSettle ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  <div style={{ textAlign: "center", background: "#3f0f0f", border: "1px solid #7f1d1d", borderRadius: 12, padding: "12px 4px" }}>
                    <div style={{ fontSize: 11, color: "#f87171", marginBottom: 4 }}>벌금 총액</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>{totalFine.toLocaleString()}원</div>
                  </div>
                  <div style={{ textAlign: "center", background: "#052e16", border: "1px solid #14532d", borderRadius: 12, padding: "12px 4px" }}>
                    <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 4 }}>{useNewSettle ? "누적액 합계" : "완료 적립금"}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>{totalBonus.toLocaleString()}원</div>
                  </div>
                  {!useNewSettle && (
                    <div style={{ textAlign: "center", background: "#1e1b4b", border: "1px solid #3730a3", borderRadius: 12, padding: "12px 4px" }}>
                      <div style={{ fontSize: 11, color: "#a5b4fc", marginBottom: 4 }}>상품 예산</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#818cf8" }}>{totalPool.toLocaleString()}원</div>
                    </div>
                  )}
                </div>

                {/* 멤버별 내역 */}
                {memberStats.map(({ member, fine, bonus, details }) => {
                  const payout = payoutByMember[member];
                  return (
                  <div key={member} style={{ marginBottom: 10, background: "#0a0f1e", borderRadius: 12, padding: "12px", border: "1px solid #1e293b" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{member}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {bonus > 0 && (
                          <span title="누적액 = 기본 상금 + 게시글 수 상금" style={{ fontSize: 13, fontWeight: 900, color: "#22c55e", cursor: "help" }}>
                            {useNewSettle ? "" : "+"}{bonus.toLocaleString()}원
                          </span>
                        )}
                        {fine > 0 ? (
                          <span title="이번 달 벌금 합계" style={{ fontSize: 13, fontWeight: 900, color: "#ef4444", cursor: "help" }}>
                            -{fine.toLocaleString()}원
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>
                            벌금 0원 🎉
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {details.map(({ week, count, fine: wf }) => {
                        const s = STATUS[count];
                        const friday = weekKeyToFriday(week);
                        const label = `${friday.getMonth()+1}/${friday.getDate()}`;
                        const tip = `${label} 주 · 게시글 ${count}개${wf > 0 ? ` · 벌금 ${wf.toLocaleString()}원` : " · 벌금 없음"}`;
                        return (
                          <div key={week} title={tip} style={{ display: "flex", alignItems: "center", gap: 4, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "4px 8px", fontSize: 11, cursor: "help" }}>
                            <span style={{ color: "#64748b" }}>{label}</span>
                            <span style={{ color: s.color, fontWeight: 600 }}>{s.emoji}{count}</span>
                            {wf > 0 && <span style={{ color: "#f87171", fontWeight: 600 }}>{wf}</span>}
                          </div>
                        );
                      })}
                    </div>

                    {useNewSettle && payout && bonus > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e293b" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }} title="이번 달 받을 누적액 (벌금은 매주 별도)">받을 누적액 <b style={{ color: "#22c55e" }}>{bonus.toLocaleString()}원</b></span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => savePayoutDecision(payout, "paid")}
                              style={{ padding: "6px 12px", borderRadius: 8, border: payout.status === "paid" ? "1px solid #14532d" : "1px solid #1e293b", background: payout.status === "paid" ? "#052e16" : "#0f172a", color: payout.status === "paid" ? "#22c55e" : "#94a3b8", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                              수령
                            </button>
                            <button onClick={() => savePayoutDecision(payout, "carry")}
                              style={{ padding: "6px 12px", borderRadius: 8, border: payout.status === "carry" ? "1px solid #92400e" : "1px solid #1e293b", background: payout.status === "carry" ? "#3a2a05" : "#0f172a", color: payout.status === "carry" ? "#fbbf24" : "#94a3b8", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                              이월
                            </button>
                          </div>
                        </div>
                        {(payout.status || payout.previousCarryover > 0) && (
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: 600 }}>
                            {payout.status === "carry"
                              ? `이월 누계 ${(carryoverTotals[member] || 0).toLocaleString()}원`
                              : payout.status === "paid"
                                ? (payout.consumedCarryover > 0 ? `이전 이월 ${payout.consumedCarryover.toLocaleString()}원 포함 수령` : "수령 완료")
                                : `기존 이월 누계 ${payout.previousCarryover.toLocaleString()}원`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
                {useNewSettle && (
                  <div style={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 12, padding: "12px 14px", marginTop: 4 }}>
                    <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700, marginBottom: 8 }}>📦 이월 누계</div>
                    {carryoverMembers.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {carryoverMembers.map(([m, amount]) => (
                          <div key={m} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                            <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{m}</span>
                            <span style={{ color: "#fbbf24", fontWeight: 800 }}>{amount.toLocaleString()}원</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#475569" }}>아직 이월된 금액이 없어요</div>
                    )}
                  </div>
                )}
              </div>

              {/* 🎁 예상 상품증정 (4월 이전 월) */}
              {!useNewSettle && (
              <div style={{ background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 14 }}>🎁 예상 상품증정</div>
                {top1 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>예상 상품 예산 {totalPool.toLocaleString()}원</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>수상 금액은 직접 수정 가능하고, 이월 선택 시 멤버별 누계에 바로 반영돼요</div>
                    </div>

                    {rewardRecipients.map((slot) => (
                      <div key={slot.slotKey} style={{ background: slot.colors.bg, borderRadius: 14, padding: "16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                          <div>
                            <div style={{ fontSize: 12, color: slot.colors.sub, fontWeight: 700, marginBottom: 4 }}>{slot.badge} {slot.title}</div>
                            <div style={{ fontSize: 22, fontWeight: 900, color: slot.colors.text }}>{slot.member}</div>
                            <div style={{ fontSize: 12, color: slot.colors.sub, marginTop: 4 }}>이달 {slot.count}주 완료 달성</div>
                          </div>
                          <div style={{ minWidth: 120 }}>
                            <div style={{ fontSize: 11, color: slot.colors.sub, marginBottom: 4 }}>지급 금액</div>
                            <input
                              type="number"
                              min="0"
                              value={slot.amount}
                              onChange={(e) => saveRewardDecision(slot, { amount: e.target.value })}
                              style={{ width: "100%", background: "rgba(255,255,255,0.72)", border: "1px solid rgba(15,23,42,0.18)", borderRadius: 10, padding: "8px 10px", color: "#0f172a", fontSize: 14, fontWeight: 800, boxSizing: "border-box", fontFamily: "inherit" }}
                            />
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <button
                            onClick={() => saveRewardDecision(slot, {
                              status: "paid",
                              amount: slot.amount + slot.previousCarryover,
                              consumedCarryover: slot.previousCarryover,
                            })}
                            style={{ padding: "8px 12px", borderRadius: 10, border: slot.status === "paid" ? "1px solid #065f46" : "1px solid rgba(15,23,42,0.18)", background: slot.status === "paid" ? "#ecfdf5" : "rgba(255,255,255,0.72)", color: "#065f46", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            증정
                          </button>
                          <button
                            onClick={() => saveRewardDecision(slot, {
                              status: "carry",
                              amount: Math.max(slot.amount - (slot.consumedCarryover || 0), 0),
                              consumedCarryover: 0,
                            })}
                            style={{ padding: "8px 12px", borderRadius: 10, border: slot.status === "carry" ? "1px solid #92400e" : "1px solid rgba(15,23,42,0.18)", background: slot.status === "carry" ? "#fef3c7" : "rgba(255,255,255,0.72)", color: "#92400e", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            이월
                          </button>
                        </div>

                        <div style={{ fontSize: 12, color: slot.colors.sub, fontWeight: 700 }}>
                          {slot.status === "carry"
                            ? `이월 누계 ${(carryoverTotals[slot.member] || 0).toLocaleString()}원`
                            : slot.status === "paid" && slot.consumedCarryover > 0
                              ? `이전 이월 ${slot.consumedCarryover.toLocaleString()}원 포함 지급`
                              : slot.previousCarryover > 0
                                ? `기존 이월 누계 ${slot.previousCarryover.toLocaleString()}원`
                                : "이월 누계 없음"}
                        </div>
                      </div>
                    ))}

                    {totalPool < 10000 ? (
                      <div style={{ background: "#0a0f1e", border: "1px dashed #334155", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                        <div style={{ fontSize: 12, color: "#475569" }}>상품 예산 10,000원 이상 시 2등도 선정</div>
                        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, marginTop: 4 }}>현재 {totalPool.toLocaleString()}원 / 10,000원</div>
                        <div style={{ background: "#1e293b", borderRadius: 99, height: 6, marginTop: 8 }}>
                          <div style={{ width: `${Math.min((totalPool / 10000) * 100, 100)}%`, height: "100%", background: "linear-gradient(90deg,#94a3b8,#cbd5e1)", borderRadius: 99, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    ) : null}

                    <div style={{ background: "#0a0f1e", border: "1px solid #334155", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700, marginBottom: 8 }}>이월 누계</div>
                      {carryoverMembers.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {carryoverMembers.map(([member, amount]) => (
                            <div key={member} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                              <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{member}</span>
                              <span style={{ color: "#fbbf24", fontWeight: 800 }}>{amount.toLocaleString()}원</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#475569" }}>아직 이월된 상품 금액이 없어요</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#334155" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
                    <div style={{ fontSize: 13 }}>이달 3회 완료 달성자가 아직 없어요</div>
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })()}

        {tab === "history" && (
          <div>
            {allWeeks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#334155" }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>📊</div>
                <div>아직 입력된 기록이 없어요</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allWeeks.map((week) => {
                  const isCur = week === getCurrentWeekKey();
                  return (
                    <div key={week} style={{ background: "#111827", borderRadius: 14, padding: 14, border: `1px solid ${isCur ? "#38bdf8" : "#1e293b"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isCur ? "#38bdf8" : "#f1f5f9" }}>{getWeekLabel(week)}</div>
                        <button onClick={() => { setViewWeek(week); setTab("current"); }}
                          style={{ background: "none", border: "1px solid #334155", borderRadius: 8, color: "#64748b", padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>편집</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {members.map((m) => {
                          const c = getCount(week, m);
                          if (c === null) return <div key={m} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "4px 9px", fontSize: 12, color: "#475569" }}>{m} · -</div>;
                          const s = STATUS[c];
                          return <div key={m} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "4px 9px", fontSize: 12, color: s.color, fontWeight: 600 }}>{m} {s.emoji}{c}</div>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "members" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {members.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
                  <div>아직 멤버가 없어요</div>
                </div>
              )}
              {members.map((m) => (
                <div key={m} style={{ background: "#111827", borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #1e293b" }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>👤 {m}</span>
                  <button onClick={() => removeMember(m)}
                    style={{ background: "#3f0f0f", border: "1px solid #7f1d1d", borderRadius: 8, color: "#f87171", padding: "6px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>삭제</button>
                </div>
              ))}
            </div>
            {!showAdd ? (
              <button onClick={() => setShowAdd(true)}
                style={{ width: "100%", padding: "15px", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
                + 멤버 추가
              </button>
            ) : (
              <div style={{ background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b" }}>
                <input value={newMember} onChange={(e) => setNewMember(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMember()}
                  placeholder="이름 입력 후 Enter"
                  autoFocus
                  style={{ width: "100%", background: "#0a0f1e", border: "1px solid #334155", borderRadius: 10, padding: "13px 14px", color: "#f1f5f9", fontSize: 16, marginBottom: 10, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={addMember} style={{ flex: 1, padding: "12px", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>추가</button>
                  <button onClick={() => { setShowAdd(false); setNewMember(""); }} style={{ padding: "12px 16px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, color: "#94a3b8", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "12px 20px", color: "#f1f5f9", fontSize: 14, fontWeight: 600, zIndex: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
