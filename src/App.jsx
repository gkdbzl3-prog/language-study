import { useState, useEffect } from "react";

const STATUS = {
  0: { color: "#ef4444", bg: "#3f0f0f", border: "#7f1d1d", emoji: "😴", text: "미인증" },
  1: { color: "#f97316", bg: "#431407", border: "#7c2d12", emoji: "🔥", text: "1회" },
  2: { color: "#84cc16", bg: "#1a2e05", border: "#3f6212", emoji: "✅", text: "2회" },
  3: { color: "#22c55e", bg: "#052e16", border: "#14532d", emoji: "🏆", text: "완료" },
};

function weekKeyToMonday(weekKey) {
  const [year, wkStr] = weekKey.split("-W");
  const wk = parseInt(wkStr);
  const jan1 = new Date(parseInt(year), 0, 1);
  const dayOfWeek = jan1.getDay() || 7;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + (8 - dayOfWeek) % 7);
  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + (wk - 1) * 7);
  return monday;
}

function dateToWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function getCurrentWeekKey() { return dateToWeekKey(new Date()); }

function getWeekLabel(weekKey) {
  const monday = weekKeyToMonday(weekKey);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const isCur = weekKey === getCurrentWeekKey();
  return `${monday.getFullYear()}년 ${fmt(monday)}~${fmt(sunday)}${isCur ? " (이번주)" : ""}`;
}

function shiftWeek(weekKey, delta) {
  const monday = weekKeyToMonday(weekKey);
  monday.setDate(monday.getDate() + delta * 7);
  return dateToWeekKey(monday);
}

// localStorage 헬퍼
const storage = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

// 해당 월에 속하는 주차 키 목록 반환 (월요일 기준)
function getWeeksInMonth(year, month) {
  const weeks = [];
  const d = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  while (d <= lastDay) {
    const wk = dateToWeekKey(d);
    if (!weeks.includes(wk)) weeks.push(wk);
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

const FINE_MAP = { 0: 1000, 1: 700, 2: 400, 3: 0 };
const BONUS_3 = 700; // 3회 달성 시 적립금

export default function StudyDashboard() {
  const [members, setMembers] = useState(() => storage.get("study-members") || []);
  const [weekData, setWeekData] = useState(() => storage.get("study-weekdata") || {});
  const [exemptions, setExemptions] = useState(() => storage.get("stamp-exemptions") || {});
  const [viewWeek, setViewWeek] = useState(getCurrentWeekKey());
  const [newMember, setNewMember] = useState("");
  const [tab, setTab] = useState("current");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);
  const [settleMonth, setSettleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useEffect(() => { storage.set("study-members", members); }, [members]);
  useEffect(() => { storage.set("study-weekdata", weekData); }, [weekData]);
  useEffect(() => { storage.set("stamp-exemptions", exemptions); }, [exemptions]);

  // 멤버별 전체 도장 수 (3회 달성 주 수)
  const getStamps = (member) =>
    Object.keys(weekData).filter((w) => weekData[w]?.[member] === 3).length;

  // 멤버별 사용한 면제권 수
  const getUsedExemptions = (member) => (exemptions[member]?.usedExemptions || []).length;

  // 멤버별 보유 면제권 수 = 도장 10개당 1장 - 사용한 장수
  const getAvailableExemptions = (member) => Math.floor(getStamps(member) / 10) - getUsedExemptions(member);

  // 면제권 사용 토글
  const toggleExemption = (member, weekKey) => {
    setExemptions((prev) => {
      const memberData = prev[member] || { usedExemptions: [] };
      const used = memberData.usedExemptions || [];
      if (used.includes(weekKey)) {
        return { ...prev, [member]: { ...memberData, usedExemptions: used.filter((w) => w !== weekKey) } };
      } else {
        if (getAvailableExemptions(member) <= 0) return prev;
        return { ...prev, [member]: { ...memberData, usedExemptions: [...used, weekKey] } };
      }
    });
  };

  const isExempted = (member, weekKey) => (exemptions[member]?.usedExemptions || []).includes(weekKey);

  // 정산월의 주차들
  const settleWeeks = getWeeksInMonth(settleMonth.year, settleMonth.month);
  const settleMonthLabel = `${settleMonth.year}년 ${settleMonth.month + 1}월`;

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const addMember = () => {
    const name = newMember.trim();
    if (!name || members.includes(name)) return;
    setMembers((p) => [...p, name]);
    setNewMember(""); setShowAdd(false);
    showToast(`✓ ${name} 추가됨`);
  };

  const removeMember = (name) => {
    if (!confirm(`${name}을(를) 삭제할까요?`)) return;
    setMembers((p) => p.filter((m) => m !== name));
    showToast(`${name} 삭제됨`);
  };

  const setCount = (week, member, count) =>
    setWeekData((prev) => ({ ...prev, [week]: { ...(prev[week] || {}), [member]: count } }));

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

  const NavBtn = ({ children, onClick }) => (
    <button onClick={onClick} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, width: 36, height: 36, color: "#94a3b8", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {children}
    </button>
  );

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
              <NavBtn onClick={() => setViewWeek((w) => shiftWeek(w, 1))}>▶</NavBtn>
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
                      <div style={{ display: "flex", gap: 7 }}>
                        {[0, 1, 2, 3].map((n) => {
                          const s = STATUS[n];
                          const sel = count === n;
                          return (
                            <button key={n} onClick={() => setCount(viewWeek, member, n)}
                              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${sel ? s.color : "#334155"}`, background: sel ? s.bg : "#0a0f1e", color: sel ? s.color : "#475569", fontWeight: sel ? 700 : 400, cursor: "pointer", fontSize: 15, transition: "all 0.15s", fontFamily: "inherit" }}>
                              {n}
                            </button>
                          );
                        })}
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
              {[3,2,1,0].map(n => {
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
                        const monday = weekKeyToMonday(w);
                        const isCur = w === getCurrentWeekKey();
                        return (
                          <th key={w} style={{ padding: "4px 3px", fontSize: 10, color: isCur ? "#38bdf8" : "#475569", fontWeight: isCur ? 700 : 400, textAlign: "center", minWidth: 38 }}>
                            <div>{`${monday.getMonth()+1}/${monday.getDate()}`}</div>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[3,2,1,0].map(n => {
                    const s = STATUS[n];
                    const cnt = members.filter(m => getCount(getCurrentWeekKey(), m) === n).length;
                    return (
                      <div key={n} style={{ textAlign: "center", background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "12px 4px" }}>
                        <div style={{ fontSize: 22 }}>{s.emoji}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{cnt}</div>
                        <div style={{ fontSize: 11, color: s.color, opacity: 0.8 }}>{n}개</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "settle" && (() => {
          // 월별 벌금 & 적립금 계산
          const memberStats = members.map((member) => {
            let fine = 0, bonus = 0, details = [];
            settleWeeks.forEach((w) => {
              const c = getCount(w, member);
              if (c === null) return;
              const exempted = isExempted(member, w);
              const weekFine = exempted ? 0 : FINE_MAP[c];
              const weekBonus = c === 3 ? BONUS_3 : 0;
              fine += weekFine;
              bonus += weekBonus;
              details.push({ week: w, count: c, fine: weekFine, bonus: weekBonus, exempted });
            });
            return { member, fine, bonus, total: fine + bonus, stamps: getStamps(member), available: getAvailableExemptions(member), details };
          });
          const totalFine = memberStats.reduce((s, m) => s + m.fine, 0);
          const totalBonus = memberStats.reduce((s, m) => s + m.bonus, 0);
          const totalPool = totalFine + totalBonus;

          // 이달 3회 달성 횟수 기준 순위
          const monthlyPerfect = members.map((member) => ({
            member,
            count: settleWeeks.filter((w) => getCount(w, member) === 3).length,
          })).sort((a, b) => b.count - a.count);
          const top1Count = monthlyPerfect[0]?.count || 0;
          const top1 = monthlyPerfect.filter((m) => m.count === top1Count && m.count > 0);
          const top2Count = monthlyPerfect.find((m) => m.count < top1Count)?.count || 0;
          const top2 = monthlyPerfect.filter((m) => m.count === top2Count && m.count > 0);

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

              {/* 🏅 칭찬도장 모음판 */}
              <div style={{ background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 14 }}>🏅 칭찬도장 모음판</div>
                {members.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#334155", fontSize: 13 }}>멤버를 추가해주세요</div>
                ) : members.map((member) => {
                  const stamps = getStamps(member);
                  const available = getAvailableExemptions(member);
                  const totalExemptionsEarned = Math.floor(stamps / 10);
                  const progress = stamps % 10;
                  return (
                    <div key={member} style={{ marginBottom: 10, padding: "12px 14px", background: "#0a0f1e", borderRadius: 12, border: "1px solid #1e293b" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 22 }}>🏅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{member}</span>
                              <span style={{ fontSize: 12, color: "#64748b" }}>×{stamps}</span>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {available > 0 && <span style={{ background: "#052e16", border: "1px solid #14532d", borderRadius: 8, padding: "3px 8px", fontSize: 11, color: "#22c55e", fontWeight: 700 }}>🎫 {available}장</span>}
                              <span style={{ fontSize: 11, color: "#475569" }}>다음 면제권까지 {10 - progress}개</span>
                            </div>
                          </div>
                          <div style={{ background: "#1e293b", borderRadius: 99, height: 8, overflow: "hidden" }}>
                            <div style={{ width: `${(progress / 10) * 100}%`, height: "100%", background: "linear-gradient(90deg, #22c55e, #4ade80)", borderRadius: 99, transition: "width 0.4s" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                            <span style={{ fontSize: 10, color: "#475569" }}>{progress}/10</span>
                            {totalExemptionsEarned > 0 && <span style={{ fontSize: 10, color: "#475569" }}>누적 {totalExemptionsEarned}장 획득 · {getUsedExemptions(member)}장 사용</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 💰 벌금 & 적립금 상세 */}
              <div style={{ background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b", marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 14 }}>💰 {settleMonthLabel} 정산</div>

                {/* 총액 요약 카드 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  <div style={{ textAlign: "center", background: "#3f0f0f", border: "1px solid #7f1d1d", borderRadius: 12, padding: "12px 4px" }}>
                    <div style={{ fontSize: 11, color: "#f87171", marginBottom: 4 }}>벌금 총액</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444" }}>{totalFine.toLocaleString()}원</div>
                  </div>
                  <div style={{ textAlign: "center", background: "#052e16", border: "1px solid #14532d", borderRadius: 12, padding: "12px 4px" }}>
                    <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 4 }}>3회 적립금</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e" }}>{totalBonus.toLocaleString()}원</div>
                  </div>
                  <div style={{ textAlign: "center", background: "#1e1b4b", border: "1px solid #3730a3", borderRadius: 12, padding: "12px 4px" }}>
                    <div style={{ fontSize: 11, color: "#a5b4fc", marginBottom: 4 }}>상품 예산</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#818cf8" }}>{totalPool.toLocaleString()}원</div>
                  </div>
                </div>

                {/* 멤버별 벌금 내역 */}
                {memberStats.map(({ member, fine, bonus, details, available }) => (
                  <div key={member} style={{ marginBottom: 10, background: "#0a0f1e", borderRadius: 12, padding: "12px", border: "1px solid #1e293b" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{member}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {bonus > 0 && <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>+{bonus.toLocaleString()}</span>}
                        <span style={{ fontSize: 14, fontWeight: 900, color: fine > 0 ? "#ef4444" : "#22c55e" }}>{fine > 0 ? `${fine.toLocaleString()}원` : "0원 🎉"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {details.map(({ week, count, fine: wf, exempted }) => {
                        const s = STATUS[count];
                        const monday = weekKeyToMonday(week);
                        const label = `${monday.getMonth()+1}/${monday.getDate()}`;
                        return (
                          <div key={week} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, background: exempted ? "#1a2e05" : s.bg, border: `1px solid ${exempted ? "#3f6212" : s.border}`, borderRadius: 8, padding: "4px 8px", fontSize: 11 }}>
                            <span style={{ color: "#64748b" }}>{label}</span>
                            <span style={{ color: s.color, fontWeight: 600 }}>{s.emoji}{count}</span>
                            {exempted ? (
                              <span style={{ color: "#22c55e", fontWeight: 700, cursor: "pointer" }} onClick={() => toggleExemption(member, week)}>🎫</span>
                            ) : (
                              <span style={{ color: "#f87171", fontWeight: 600 }}>{wf > 0 ? `${wf}` : ""}</span>
                            )}
                            {!exempted && count < 3 && available > 0 && (
                              <span onClick={() => toggleExemption(member, week)}
                                style={{ cursor: "pointer", fontSize: 10, color: "#38bdf8", textDecoration: "underline" }}>면제</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 🎁 예상 상품증정 유저 */}
              <div style={{ background: "#111827", borderRadius: 14, padding: 16, border: "1px solid #1e293b" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 14 }}>🎁 예상 상품증정</div>

                {top1.length > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", borderRadius: 14, padding: "16px", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, color: "#78350f", fontWeight: 700, marginBottom: 4 }}>🥇 1등</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: "#451a03" }}>{top1.map(m => m.member).join(", ")}</div>
                      <div style={{ fontSize: 12, color: "#78350f", marginTop: 4 }}>이달 {top1Count}주 완료 달성</div>
                    </div>

                    {totalPool >= 10000 && top2.length > 0 ? (
                      <div style={{ background: "linear-gradient(135deg,#94a3b8,#cbd5e1)", borderRadius: 14, padding: "14px" }}>
                        <div style={{ fontSize: 12, color: "#334155", fontWeight: 700, marginBottom: 4 }}>🥈 2등</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#1e293b" }}>{top2.map(m => m.member).join(", ")}</div>
                        <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>이달 {top2Count}주 완료 달성</div>
                      </div>
                    ) : totalPool < 10000 ? (
                      <div style={{ background: "#0a0f1e", border: "1px dashed #334155", borderRadius: 12, padding: "12px", textAlign: "center" }}>
                        <div style={{ fontSize: 12, color: "#475569" }}>상품 예산 10,000원 이상 시 2등도 선정</div>
                        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700, marginTop: 4 }}>현재 {totalPool.toLocaleString()}원 / 10,000원</div>
                        <div style={{ background: "#1e293b", borderRadius: 99, height: 6, marginTop: 8 }}>
                          <div style={{ width: `${Math.min((totalPool / 10000) * 100, 100)}%`, height: "100%", background: "linear-gradient(90deg,#94a3b8,#cbd5e1)", borderRadius: 99, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#334155" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
                    <div style={{ fontSize: 13 }}>이달 3회 완료 달성자가 아직 없어요</div>
                  </div>
                )}
              </div>
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
