/* 가족 대시보드 — 🎮 우리가족 놀이방 (20만들기·코딩 로봇·우주 수식 사령관·맞춤법 몬스터 배틀)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 들어갈 때 이름을 고른다 (첫째·둘째·아빠·엄마, 로그인 없음 — 아이별 할 일 화면처럼).
   - 점수·도전 진행도는 사람마다 서버에 저장한다 (POST /api/playroom → 위키 밖 playroom.json).
   - 게임 점수는 토큰·포켓몬 레벨에 영향이 없다.
   - 단, 아이가 게임 화면에서 노는 시간은 10분마다 토큰 1개가 된다 (아이만, 받을 때 팝업).
   - 종목별 랭킹: 단계가 먼저, 점수는 다음 (숫자=도전 숫자, 로봇=단계, 우주=최고 점수).
   - 메뉴·이름 선택은 도트 스타일, 게임 화면 3개는 세련된 요즘 스타일 (.pr-modern).
   - 게임 4개는 대시보드 안의 작은 칸이 아니라 화면 대부분을 차지하는 팝업(모달)으로 열린다.
     #fit이 fit-mode에서 scale을 걸 수 있어서 팝업은 body에 직접 붙인다 (카드 안에 두면 틀어진다).
     토큰 팝업(z-60)보다 아래(z-40)에 둬서 토큰 팝업이 게임 팝업 위에 뜬다. */
"use strict";
/* ── 상태 ── */
const PR_NAME_KEY = "playroomName";
let prData = {};                 // 서버에서 받은 사람마다 기록 {이름: {number:{target,best,clears}, robot:{stage,clears}, space:{best,plays}, spell:{stage,best,clears}}}
let prDataLoaded = false;
let prName = null;               // 지금 선택한 사람
let prScreen = "picker";         // picker | lobby | number | robot | space | race | spell | ranking
let prLastHash = "";
let prTimers = [];               // 게임 타이머들 — 화면을 떠나면 모두 끈다
let prNum = null;                // 숫자 게임 상태
let prRobot = null;              // 로봇 게임 상태
let prSpace = null;              // 우주 게임 상태
let prRace = null;               // 경마 게임 상태
let prSpell = null;              // 맞춤법 몬스터 배틀 상태
let prSpellPick = null;          // 맞춤법 고르기 화면 상태 {choices, picked} — 배틀 시작 전만 쓴다
let prPaused = false;            // 토큰 팝업이 떠 있는 동안 게임 멈춤
let prPlay = null;               // 놀이 시간 누적 {secs, synced, timer}
const PR_PLAY_TOKEN_SECS = 600;  // 10분마다 토큰 1개
const PR_PLAY_SYNC_SECS = 30;    // 30초마다 서버에 시간 보냄

function prPeople(data) {
  const kids = (data && data.kids ? data.kids : []).map((k) => k.name);
  const parents = (typeof PARENT_NAMES !== "undefined" && PARENT_NAMES) ? PARENT_NAMES : ["아빠", "엄마"];
  return [...kids, ...parents];
}
function prPersonColor(data, name) {
  const k = (data && data.kids ? data.kids : []).find((x) => x.name === name);
  if (k && k.skin && k.skin.bar) return k.skin.bar;
  return name === "아빠" ? "#4a90d9" : "#e26d9d";
}
function prRec(name) { return (prData && prData[name]) || {}; }
function prIsAdult(name) { return name === "아빠" || name === "엄마"; }   // 어른만 난이도 다르게 (아이와 동일 화면·동일 기록 구조)
function prNumBase(name) { return prIsAdult(name) ? 100 : 20; }   // 숫자 만들기 시작 목표 — 어른 100, 아이 20
function prNumStep(name) { return prIsAdult(name) ? 50 : 10; }     // 클리어할 때마다 오르는 폭 — 어른 +50, 아이 +10
function prNumRec(name) { const r = prRec(name).number || {}; const base = prNumBase(name); return { target: r.target ? Math.max(r.target, base) : base, best: r.best || 0, clears: r.clears || 0 }; }
function prRobotRec(name) { const r = prRec(name).robot || {}; return { stage: r.stage || 1, clears: r.clears || 0 }; }
function prSpaceRec(name) { const r = prRec(name).space || {}; return { best: r.best || 0, plays: r.plays || 0 }; }
function prSpellRec(name) { const r = prRec(name).spell || {}; const stage = r.stage || 1; return { stage: prIsAdult(name) ? Math.max(stage, 3) : stage, best: r.best || 0, clears: r.clears || 0, level: r.level || 1, levelUpDate: r.levelUpDate || "" }; }   // 어른은 저장된 단계가 3보다 낮아도 최소 3단계(B)부터 — 절대 낮추지 않는다
/* 오늘 날짜 (로컬, YYYY-MM-DD) — 맞춤법 레벨업 "매일 최초 1회" 판단용 */
function prTodayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function prTimer(fn, ms) { const id = setInterval(fn, ms); prTimers.push(id); return id; }
function prTimeout(fn, ms) { const id = setTimeout(fn, ms); prTimers.push(id); return id; }
function prStopAll() {
  prModalHide();                 // 게임 팝업이 떠 있으면 닫는다 (닫을 때 body 스크롤도 풀린다)
  if (prScreen === "number" && prNum && !prNum.over) prNumSaveBest();  // 숫자 게임 도중에 나가도 이번 판 최고 점수는 저장
  if (prScreen === "spell" && prSpell) prSpellSave();   // 맞춤법 배틀 도중에 나가도 지금까지의 단계·점수·처치는 저장
  prPlayFlush();                 // 남은 놀이 시간도 서버에 보낸다
  prTokenClose();                // 떠 있는 토큰 팝업이 있으면 닫는다
  const lp = document.querySelector(".pr-level-pop");   // 떠 있는 레벨업 팝업이 있으면 닫는다
  if (lp) lp.remove();
  prTimers.forEach((id) => { clearInterval(id); clearTimeout(id); });
  prTimers = [];
  if (prNum) prNum.tick = null;
  if (prSpace) prSpace.keyHandler = null;
  document.removeEventListener("keydown", prSpaceKey);
  prPlay = null;
  prSpellPick = null;            // 고르기 화면을 떠나면 고른 것도 버린다 (다음에 다시 고른다)
}
window.addEventListener("hashchange", () => { if (location.hash !== "#playroom") prStopAll(); });
async function prLoad() {
  if (typeof DEMO !== "undefined" && DEMO) { prDataLoaded = true; return; }
  try {
    const r = await fetch("/api/playroom", { cache: "no-store" });
    const j = await r.json();
    if (j && j.ok) prData = j.data || {};
  } catch (e) { /* 못 읽으면 빈 기록으로 시작 — 게임은 된다 */ }
  prDataLoaded = true;
}
async function prSave(game, patch) {
  if (!prName) return;
  const rec = prRec(prName);
  const merged = { ...(rec[game] || {}), ...patch };
  prData[prName] = { ...rec, [game]: merged };   // 화면 기록은 바로 갱신
  try {
    const j = await post("/api/playroom", { name: prName, game, patch });
    if (j && j.data) prData = j.data;
  } catch (e) { /* 저장 실패해도 화면 기록은 유지 — 다음에 다시 저장된다 */ }
}
/* ── 놀이 시간 → 토큰 (아이만, 10분마다 1개) ──
   게임 화면에서 실제로 노는 시간만 센다 (로비·이름 선택·결과 화면은 안 센다).
   30초마다 서버에 보내고, 서버가 600초마다 토큰 1개를 토큰 장부에 더한다.
   토큰을 받으면 팝업이 뜨고 게임이 멈췄다가 닫으면 이어진다. */
function prKidNames() {
  const fromData = (typeof lastData !== "undefined" && lastData && lastData.kids) ? lastData.kids.map((k) => k.name) : [];
  return fromData.length ? fromData : ["첫째", "둘째"];
}
function prIsKid(name) { return prKidNames().includes(name); }
function prPlayRec(name) { const r = (prData && prData[name] && prData[name].play) || {}; return { secs: r.secs || 0, granted: r.granted || 0 }; }
function prPlayActive() {
  if (prPaused) return false;
  if (prScreen === "number") return !!(prNum && !prNum.over && !prNum.result);
  if (prScreen === "robot") return !!(prRobot && !prRobot.result);
  if (prScreen === "space") return !!(prSpace && !prSpace.over && !prSpace.result);
  if (prScreen === "spell") return !!(prSpell && !prSpell.over && !prSpell.levelPop);   // 레벨업 팝업 떠 있는 동안도 시간 안 셈
  return false;   // 경마는 이름이 없어서 누구에게 줄지 알 수 없으니 토큰 집계에서 뺀다
}
function prPlayStart() {
  prPlayStop();
  const slot = { secs: 0, synced: 0, timer: null };
  prPlay = slot;
  slot.timer = prTimer(() => {
    if (prPlay !== slot || !prPlayActive()) return;
    slot.secs += 1;
    if (slot.secs - slot.synced >= PR_PLAY_SYNC_SECS) prPlaySync();
  }, 1000);
}
function prPlayStop() {
  if (prPlay && prPlay.timer != null) { try { clearInterval(prPlay.timer); } catch (e) {} }
  prPlay = null;
}
async function prPlaySync() {
  if (!prPlay || !prName) return;
  const add = prPlay.secs - prPlay.synced;
  if (add <= 0) return;
  const slot = prPlay;
  slot.synced = slot.secs;
  try {
    const j = await post("/api/playroom", { name: prName, game: "play", patch: { addSecs: add } });
    if (j && j.data) prData = j.data;
    if (j && j.granted > 0) prTokenPopup(j.granted, j.balance);
  } catch (e) { slot.synced -= add; /* 실패하면 다음번에 다시 보낸다 */ }
}
function prPlayFlush() {
  if (!prPlay || !prName) return;
  if (prPlay.secs - prPlay.synced > 0) prPlaySync();
}
function prTokenPopup(granted, balance) {
  if (location.hash !== "#playroom") return;
  prPaused = true;
  const old = document.querySelector(".pr-token-pop");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "pr-token-pop";
  el.innerHTML = `<div class="pr-token-card"><div class="pr-token-big">🎁 토큰 ${granted}개 받았어요!</div>
    <p>10분 동안 열심히 놀았어요.<br>${escapeHtml(prName)}의 토큰이 <b>🪙 ${balance}개</b>가 됐어요!</p>
    <button type="button" class="pr-btn" data-pr="token-continue">계속하기</button></div>`;
  document.body.appendChild(el);
}
function prTokenClose() {
  const old = document.querySelector(".pr-token-pop");
  if (old) old.remove();
  prPaused = false;
}
function prBeep(f, d) { if (typeof beep === "function") { try { beep(f, 0, d || 0.08, "square", 0.05); } catch (e) {} } }
/* ── 맞춤법 배틀 싸움 임팩트 사운드 (외부 파일 없이 WebAudio 합성음만) ──
   beep/crackNoise는 대시보드 sound.js 전역 함수 (CONFIG.sound·음량 설정을 그대로 따른다). */
function prSfx(kind) {
  try {
    if (kind === "hit") {            // 내 포켓몬 공격 — 짧은 타격음 (잡음 탁 + 저음 쿵 + 고음 틱)
      if (typeof crackNoise === "function") crackNoise(0, 0.08, 0.25);
      if (typeof beep === "function") { beep(160, 0, 0.12, "sine", 0.12); beep(1200, 0.02, 0.05, "square", 0.04); }
    } else if (kind === "hurt") {   // 상대가 나를 공격 — 둔탁한 맞는 소리 (낮게 미끄러지는 쿵)
      if (typeof beep === "function") { beep(110, 0, 0.2, "sine", 0.14, 60); beep(70, 0.05, 0.15, "triangle", 0.12); }
    } else if (kind === "ko") {     // 상대 처치 — KO 하강음 (탁 + 내려가는 3음)
      if (typeof crackNoise === "function") crackNoise(0, 0.12, 0.3);
      if (typeof beep === "function") { beep(660, 0, 0.1, "square", 0.06); beep(440, 0.1, 0.1, "square", 0.06); beep(220, 0.2, 0.25, "square", 0.07); }
    } else if (kind === "fanfare") { // 레벨업 — 올라가는 팡파레 (도미솔도↑)
      if (typeof SFX !== "undefined" && SFX && typeof SFX.levelup === "function") SFX.levelup();
      else if (typeof beep === "function") [523, 659, 784, 1047].forEach((f, i) => beep(f, i * 0.08, i === 3 ? 0.35 : 0.1, "triangle", 0.1));
    }
  } catch (e) { /* 소리 안 나면 조용히 넘어간다 */ }
}

/* ── 놀이방 화면 ── */
function renderPlayroom(data) {
  const fresh = location.hash !== prLastHash;
  prLastHash = location.hash;
  if (fresh) { prStopAll(); prScreen = "picker"; }              // 들어올 때마다 이름부터 고른다
  else if (prScreen !== "picker" && prScreen !== "lobby" && prScreen !== "ranking") return;  // 게임 중 2분 새로고침은 화면을 건드리지 않는다
  if (!prDataLoaded) { prLoad().then(() => { if (location.hash === "#playroom" && (prScreen === "picker" || prScreen === "lobby" || prScreen === "ranking")) renderPlayroom(data); }); }
  if (prScreen === "picker") renderPlayroomPicker(data);
  else if (prScreen === "ranking") renderPlayroomRanking(data);
  else renderPlayroomLobby(data);
}
function renderPlayroomPicker(data) {
  const people = prPeople(data);
  const last = (() => { try { return localStorage.getItem(PR_NAME_KEY) || ""; } catch (e) { return ""; } })();
  $("playroom").innerHTML = `<div class="pr-wrap">
    <h2>🎮 우리가족 놀이방</h2>
    <p class="pr-sub">누구야? 자기 이름을 눌러서 들어가자!</p>
    <div class="pr-names">${people.map((n) => `<button type="button" class="pr-name-btn" data-pr="pick-name" data-name="${escapeHtml(n)}" style="--c:${prPersonColor(data, n)}">
      ${escapeHtml(n)}${n === last ? `<span class="pr-last">지난번엔 ${escapeHtml(n)}!</span>` : ""}</button>`).join("")}</div>
    <p class="pr-note">점수랑 도전은 이름마다 따로 저장돼요. 아이가 게임 화면에서 10분 놀면 토큰 1개를 받아요 🎁</p>
    <div class="pr-common"><h3>🏇 공통 게임</h3>
      <p class="pr-sub">이름을 고르지 않고 바로 할 수 있어요!</p>
      <div class="pr-games">
        <button type="button" class="pr-game-card" data-pr="open-race-common" style="--c:#f59e0b">
          <span class="pr-game-ico">🏇</span><b>경마 게임</b>
          <span>몇 명이 할지 골라 달리기!</span><span>말 이름은 랜덤으로 정해져요</span></button>
      </div></div></div>`;
}
function renderPlayroomLobby(data) {
  const n = prNumRec(prName), r = prRobotRec(prName), s = prSpaceRec(prName), sp = prSpellRec(prName);
  const pl = prPlayRec(prName);
  const playLine = prIsKid(prName) ? `<p class="pr-note">🎮 토큰까지 ${Math.max(0, 10 - Math.floor(pl.secs / 60))}분 남았어요 · 지금까지 토큰 ${pl.granted}개 받았어요</p>` : "";
  $("playroom").innerHTML = `<div class="pr-wrap">
    <div class="pr-lobby-head"><h2>🎮 ${escapeHtml(prName)}의 놀이방</h2>
      <button type="button" class="pr-small-btn" data-pr="change-name">이름 바꾸기</button></div>
    <p class="pr-sub">오늘은 어떤 게임 할까?</p>
    <div class="pr-games">
      <button type="button" class="pr-game-card" data-pr="open-number" style="--c:#ff8a5c">
        <span class="pr-game-ico">🎈</span><b>숫자 만들기</b>
        <span>지금 도전: <b>${n.target}만들기</b></span><span>최고 ${n.best}점 · ${n.clears}번 성공</span></button>
      <button type="button" class="pr-game-card" data-pr="open-robot" style="--c:#4a90d9">
        <span class="pr-game-ico">🤖</span><b>코딩 로봇</b>
        <span>열린 단계: <b>${Math.min(r.stage, PR_ROBOT_STAGES.length)}단계</b>까지</span><span>${r.clears}번 깃발 도착</span></button>
      <button type="button" class="pr-game-card" data-pr="open-space" style="--c:#8b5cf6">
        <span class="pr-game-ico">🚀</span><b>우주 수식 사령관</b>
        <span>${prIsAdult(prName) ? "두 자리 곱셈으로 적 우주선을 격추!" : "구구단으로 적 우주선을 격추!"}</span><span>최고 ${s.best}점</span></button>
      <button type="button" class="pr-game-card" data-pr="open-spell" style="--c:#10b981">
        <span class="pr-game-ico">✏️</span><b>맞춤법 몬스터 배틀</b>
        <span>내 포켓몬이 맞춤법으로 싸워요!</span><span>지금 도전: <b>${sp.stage}단계</b> · 최고 ${sp.best}점 · 레벨 ${sp.level}</span>${prSpellFocusActive() ? `<span>📚 이번 주 집중: <b>11급 6번</b> · 10문장 (11/22까지)</span>` : ""}</button>
    </div>
    <button type="button" class="pr-btn pr-rank-btn" data-pr="open-ranking">🏆 종목별 랭킹 보기</button>
    ${prTopHtml(data)}
    ${playLine}
    <p class="pr-note">💡 숫자 만들기는 60초 안에 100점을 모으면 다음 도전! ${prIsAdult(prName) ? "100부터 50씩 올라가 1000까지 있어요." : "20부터 10씩 올라가 1000까지 있어요."}</p></div>`;
}

/* ── 🏆 종목별 랭킹 (1번 방식: 단계 먼저, 점수는 다음) ──
   동점은 같은 순위, 다음 순위는 건너뛴다 (1, 2, 2, 4위).
   기록이 없는 사람은 점수를 지어내지 않고 맨 아래 "아직 기록 없음"으로 표시한다. */
function prRankAssign(rows, keys) {
  let rank = 0;
  rows.forEach((r, i) => {
    if (i > 0 && keys.every((k) => rows[i - 1][k] === r[k])) r.rank = rows[i - 1].rank;
    else { rank = i + 1; r.rank = rank; }
  });
  return rows;
}
function prRankNumber(data) {
  const recs = [], none = [];
  prPeople(data).forEach((n) => {
    const rec = prRec(n).number;
    if (!rec) { none.push({ name: n }); return; }
    recs.push({ name: n, target: rec.target || 20, best: rec.best || 0, clears: rec.clears || 0 });
  });
  recs.sort((a, b) => b.target - a.target || b.best - a.best || b.clears - a.clears);
  return { recs: prRankAssign(recs, ["target", "best", "clears"]), none };
}
function prRankRobot(data) {
  const recs = [], none = [];
  prPeople(data).forEach((n) => {
    const rec = prRec(n).robot;
    if (!rec) { none.push({ name: n }); return; }
    recs.push({ name: n, stage: rec.stage || 1, clears: rec.clears || 0 });
  });
  recs.sort((a, b) => b.stage - a.stage || b.clears - a.clears);
  return { recs: prRankAssign(recs, ["stage", "clears"]), none };
}
function prRankSpace(data) {
  const recs = [], none = [];
  prPeople(data).forEach((n) => {
    const rec = prRec(n).space;
    if (!rec) { none.push({ name: n }); return; }
    recs.push({ name: n, best: rec.best || 0, plays: rec.plays || 0 });
  });
  recs.sort((a, b) => b.best - a.best);
  return { recs: prRankAssign(recs, ["best"]), none };
}
function prRankSpell(data) {
  const recs = [], none = [];
  prPeople(data).forEach((n) => {
    const rec = prRec(n).spell;
    if (!rec) { none.push({ name: n }); return; }
    recs.push({ name: n, stage: rec.stage || 1, best: rec.best || 0, clears: rec.clears || 0 });
  });
  recs.sort((a, b) => b.stage - a.stage || b.best - a.best);
  return { recs: prRankAssign(recs, ["stage", "best"]), none };
}
function prTopLine(icon, gameName, res, fmt) {
  if (!res.recs.length) return `<div class="pr-top1"><span>${icon} ${gameName} 1등</span><span class="pr-none">아직 기록 없음</span></div>`;
  const tops = res.recs.filter((r) => r.rank === 1);
  return `<div class="pr-top1"><span>${icon} ${gameName} 1등</span><span><b>${tops.map((r) => escapeHtml(r.name)).join(" · ")}</b> — ${fmt(tops[0])}</span></div>`;
}
function prTopHtml(data) {
  return `<div class="pr-top1-box"><h3>🏆 종목별 1등</h3>
    ${prTopLine("🎈", "숫자 만들기", prRankNumber(data), (r) => `${r.target}만들기, 최고 ${r.best}점`)}
    ${prTopLine("🤖", "코딩 로봇", prRankRobot(data), (r) => `${Math.min(r.stage, PR_ROBOT_STAGES.length)}단계까지, 깃발 ${r.clears}번`)}
    ${prTopLine("🚀", "우주 수식 사령관", prRankSpace(data), (r) => `최고 ${r.best}점`)}
    ${prTopLine("✏️", "맞춤법 배틀", prRankSpell(data), (r) => `${r.stage}단계까지, 최고 ${r.best}점`)}
  </div>`;
}
function prRankMedal(rank) { return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}위`; }
function prRankTable(head, rowsHtml) {
  return `<table class="pr-rank-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}
function renderPlayroomRanking(data) {
  const num = prRankNumber(data), rob = prRankRobot(data), spc = prRankSpace(data), spl = prRankSpell(data);
  const me = prName;
  const numRows = num.recs.map((r) => `<tr class="${r.name === me ? "me" : ""}"><td><b>${prRankMedal(r.rank)}</b></td><td>${escapeHtml(r.name)}</td><td>${r.target}만들기</td><td class="num">${r.best}점</td><td class="num">${r.clears}번</td></tr>`).join("")
    + num.none.map((r) => `<tr class="none${r.name === me ? " me" : ""}"><td>—</td><td>${escapeHtml(r.name)}</td><td colspan="3">아직 기록 없음</td></tr>`).join("");
  const robRows = rob.recs.map((r) => `<tr class="${r.name === me ? "me" : ""}"><td><b>${prRankMedal(r.rank)}</b></td><td>${escapeHtml(r.name)}</td><td>${Math.min(r.stage, PR_ROBOT_STAGES.length)}단계까지</td><td class="num">${r.clears}번</td></tr>`).join("")
    + rob.none.map((r) => `<tr class="none${r.name === me ? " me" : ""}"><td>—</td><td>${escapeHtml(r.name)}</td><td colspan="2">아직 기록 없음</td></tr>`).join("");
  const spcRows = spc.recs.map((r) => `<tr class="${r.name === me ? "me" : ""}"><td><b>${prRankMedal(r.rank)}</b></td><td>${escapeHtml(r.name)}</td><td class="num">${r.best}점</td><td class="num">${r.plays}번</td></tr>`).join("")
    + spc.none.map((r) => `<tr class="none${r.name === me ? " me" : ""}"><td>—</td><td>${escapeHtml(r.name)}</td><td colspan="2">아직 기록 없음</td></tr>`).join("");
  const splRows = spl.recs.map((r) => `<tr class="${r.name === me ? "me" : ""}"><td><b>${prRankMedal(r.rank)}</b></td><td>${escapeHtml(r.name)}</td><td>${r.stage}단계까지</td><td class="num">${r.best}점</td><td class="num">${r.clears}마리</td></tr>`).join("")
    + spl.none.map((r) => `<tr class="none${r.name === me ? " me" : ""}"><td>—</td><td>${escapeHtml(r.name)}</td><td colspan="3">아직 기록 없음</td></tr>`).join("");
  $("playroom").innerHTML = `<div class="pr-wrap pr-modern">
    <div class="pr-lobby-head"><h2>🏆 종목별 랭킹</h2>
      <button type="button" class="pr-small-btn" data-pr="back-lobby">← 놀이방으로</button></div>
    <p class="pr-sub">단계가 높은 사람이 먼저! 같은 단계면 점수 순이에요.</p>
    <div class="pr-rank-sec"><h3>🎈 숫자 만들기</h3>
      ${prRankTable(["순위", "이름", "도전", "최고 점수", "성공"], numRows)}</div>
    <div class="pr-rank-sec"><h3>🤖 코딩 로봇</h3>
      ${prRankTable(["순위", "이름", "단계", "깃발 도착"], robRows)}</div>
    <div class="pr-rank-sec"><h3>🚀 우주 수식 사령관</h3>
      ${prRankTable(["순위", "이름", "최고 점수", "플레이"], spcRows)}</div>
    <div class="pr-rank-sec"><h3>✏️ 맞춤법 몬스터 배틀</h3>
      ${prRankTable(["순위", "이름", "단계", "최고 점수", "처치"], splRows)}</div>
    <p class="pr-note">💡 내 줄은 노랗게 표시돼요. 게임을 하면 랭킹이 바로 바뀌어요!</p></div>`;
}
function prBackBtn() { return `<button type="button" class="pr-back" data-pr="back-lobby">← 놀이방으로</button>`; }
function prHead(title, sub) { return `<div class="pr-game-head"><div><h2>${title}</h2><p class="pr-sub">${sub}</p></div><div class="pr-head-btns">${prBackBtn()}<button type="button" class="pr-x" data-pr="back-lobby" aria-label="닫기">✕</button></div></div>`; }
/* ── 게임 팝업(모달) ──
   게임 화면은 body에 붙는 fixed 오버레이 안에 크게 열린다 (뷰포트의 85~90% 크기).
   팝업이 열려 있는 동안 뒤의 대시보드는 스크롤되지 않는다. */
function prModalShow(inner) {
  prModalHide();
  const ov = document.createElement("div");
  ov.className = "pr-modal-ov";
  ov.innerHTML = `<div class="pr-modal pr-wrap pr-modern">${inner}</div>`;
  document.body.appendChild(ov);
  document.body.style.overflow = "hidden";
}
function prModalHide() {
  document.querySelectorAll(".pr-modal-ov").forEach((el) => el.remove());
  document.body.style.overflow = "";
}

/* ── 게임 1: 숫자 만들기 (20 → 1000, 60초·100점 넘으면 다음 도전) ── */
function prNumPair(t) {
  let a;
  if (t >= 100) a = (1 + Math.floor(Math.random() * (t / 10 - 1))) * 10;   // 100 이상은 10 단위로 (8살도 풀 수 있게)
  else a = 1 + Math.floor(Math.random() * (t - 1));
  return [a, t - a];
}
function prNumNewBalloon(v) {
  const ang = Math.random() * Math.PI * 2;            // 방향 제각각 (위·아래·옆·대각선 아무 데나)
  const sp = 2.5 + Math.random() * 3;                 // 속도도 제각각 (%/초 — 8살이 보고 누를 수 있게 천천히)
  return { id: Math.random().toString(36).slice(2, 8), v, x: 3 + Math.random() * 77, y: 6 + Math.random() * 54, hue: Math.floor(Math.random() * 360), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
}
/* 풍선 자유롭게 둥둥 떠다니기 — 50ms마다 위치를 조금씩 옮긴다.
   벽에 닿으면 반대쪽으로 넘어가지 않고 튕겨서 돌아오고, 가끔 방향을 살짝 튼다.
   전체를 다시 그리지 않고 풍선 위치(style)만 바꿔서 클릭이 끊기지 않는다. */
function prNumDrift() {
  const g = prNum;
  if (!g || g.over) return;
  if (prPaused) return;   // 토큰 팝업 떠 있는 동안 멈춤
  const dt = 0.05;
  g.balloons.forEach((b) => {
    if (Math.random() < 0.02) {                       // 가끔 방향을 살짝 튼다 (생동감)
      const turn = (Math.random() - 0.5) * 1.2;       // ±35도쯤
      const sp = Math.hypot(b.vx, b.vy) || 3;
      const a = Math.atan2(b.vy, b.vx) + turn;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < 1) { b.x = 1; b.vx = Math.abs(b.vx); }    // 왼쪽 벽에 튕김
    if (b.x > 84) { b.x = 84; b.vx = -Math.abs(b.vx); } // 오른쪽 벽에 튕김
    if (b.y < 2) { b.y = 2; b.vy = Math.abs(b.vy); }    // 위쪽 벽에 튕김
    if (b.y > 66) { b.y = 66; b.vy = -Math.abs(b.vy); } // 아래쪽 벽에 튕김
    const el = document.querySelector(`.pr-balloon[data-id="${b.id}"]`);
    if (el) { el.style.left = b.x + "%"; el.style.top = b.y + "%"; }
  });
}
function prNumStart(target) {
  prStopAll();
  const balloons = [];
  for (let i = 0; i < 4; i++) { const [a, b] = prNumPair(target); balloons.push(prNumNewBalloon(a), prNumNewBalloon(b)); }
  prNum = { target, score: 0, time: 60, sel: null, wrong: [], balloons, over: false, result: null, tick: null };
  prScreen = "number";
  prPlayStart();
  prNumRender();
  prNum.tick = prTimer(() => {
    if (!prNum || prNum.over) return;
    if (prPaused) return;   // 토큰 팝업 떠 있는 동안 멈춤
    prNum.time -= 1;
    const t = document.querySelector(".pr-num-time");
    if (t) { t.textContent = `⏱️ ${prNum.time}초`; t.classList.toggle("urgent", prNum.time <= 10); }
    if (prNum.time <= 0) prNumTimeUp();
  }, 1000);
  prTimer(() => prNumDrift(), 50);   // 풍선 둥둥 떠다니기 (끝나면 prStopAll이 같이 꺼준다)
}
function prNumRender() {
  const g = prNum;
  if (!g) return;
  if (g.result) {
    const c = g.result;
    prModalShow(`${prHead("🎈 숫자 만들기", `${escapeHtml(prName)}의 ${g.target}만들기 도전`)}
      <div class="pr-result ${c.clear ? "win" : ""}"><div class="pr-result-big">${c.clear ? "🎉 다음 도전으로!" : "⏰ 시간 끝!"}</div>
      <p>${c.clear ? `${g.target}만들기에서 ${g.score}점을 모았어요!` : `${g.score}점 (100점이면 다음 도전!)`}</p>
      <p>최고 기록: ${c.best}점${c.clear && g.target < 1000 ? `<br>다음 도전: <b>${g.target + prNumStep(prName)}만들기</b>` : ""}${g.target >= 1000 && c.clear ? "<br>🏆 <b>1000만들기까지 다 깼어요! 최고예요!</b>" : ""}</p>
      <div class="pr-result-btns">
        ${c.clear && g.target < 1000 ? `<button type="button" class="pr-btn" data-pr="num-next">다음 도전 ${g.target + prNumStep(prName)}만들기!</button>` : ""}
        <button type="button" class="pr-btn soft" data-pr="num-retry">다시 하기</button>
        <button type="button" class="pr-btn soft" data-pr="back-lobby">놀이방으로</button></div></div>`);
    return;
  }
  prModalShow(`${prHead("🎈 숫자 만들기", `합이 <b>${g.target}</b>이 되는 풍선 두 개를 눌러요!`)}
    <div class="pr-hud"><span class="pr-num-time">⏱️ ${g.time}초</span><span>⭐ ${g.score}점</span><span>목표 100점</span></div>
    <div class="pr-progress"><i style="width:${Math.min(100, g.score)}%"></i></div>
    <div class="pr-balloon-area">${g.balloons.map((b) => `<button type="button" class="pr-balloon${g.sel === b.id ? " sel" : ""}${g.wrong.includes(b.id) ? " wrong" : ""}" data-pr="num-balloon" data-id="${b.id}" style="left:${b.x}%;top:${b.y}%;--h:${b.hue}">${b.v}</button>`).join("")}</div>
    <p class="pr-note">💡 두 개를 골랐는데 합이 ${g.target}이 아니면 그냥 다시 고르면 돼요. 틀려도 점수는 안 깎여요!</p>`);
}
/* 숫자 게임 최고 점수 저장: 이번 판 점수가 최고보다 높으면 저장한다 (100점 클리어 못 해도 저장됨) */
function prNumSaveBest() {
  const g = prNum;
  if (!g || !prName) return;
  const rec = prNumRec(prName);
  if (g.score > rec.best) prSave("number", { best: g.score });
}
function prNumTimeUp() {
  const g = prNum;
  if (!g || g.over) return;
  g.over = true; prStopAll();
  const rec = prNumRec(prName);
  const best = Math.max(rec.best, g.score);
  prSave("number", { best });
  g.result = { clear: false, best };
  prBeep(220, 0.2);
  prNumRender();
}
function prNumClear() {
  const g = prNum;
  if (!g || g.over) return;
  g.over = true; prStopAll();
  const rec = prNumRec(prName);
  const next = Math.min(g.target + prNumStep(prName), 1000);
  const best = Math.max(rec.best, g.score);
  prSave("number", { target: next, best, clears: rec.clears + 1 });
  g.result = { clear: true, best };
  prBeep(880, 0.15); prTimeout(() => prBeep(1174, 0.2), 150);
  prNumRender();
}
function prNumClick(id) {
  const g = prNum;
  if (!g || g.over || prPaused) return;
  const b = g.balloons.find((x) => x.id === id);
  if (!b) return;
  if (g.sel === id) { g.sel = null; prNumRender(); return; }
  if (g.sel == null) { g.sel = id; prBeep(660, 0.06); prNumRender(); return; }
  const a = g.balloons.find((x) => x.id === g.sel);
  if (a && a.v + b.v === g.target) {
    g.score += 10;
    prBeep(990, 0.08);
    g.balloons = g.balloons.filter((x) => x.id !== a.id && x.id !== b.id);
    const [na, nb] = prNumPair(g.target);
    g.balloons.push(prNumNewBalloon(na), prNumNewBalloon(nb));
    g.sel = null;
    if (g.score >= 100) { prNumRender(); prNumClear(); return; }
  } else {
    g.wrong = [g.sel, id]; g.sel = null;
    prBeep(180, 0.12);
    prNumRender();
    prTimeout(() => { if (prNum && !prNum.over) { prNum.wrong = []; prNumRender(); } }, 350);
    return;
  }
  prNumRender();
}

/* ── 게임 2: 코딩 로봇 (5×5 격자, 명령 블록으로 깃발까지) ── */
const PR_ROBOT_STAGES = [
  { name: "1단계 · 기초 훈련", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [], hint: "앞으로 쭉쭉 가볼까요?" },
  { name: "2단계 · 지그재그 길", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[1,4],[1,3],[3,2],[3,3],[4,2],[4,1]], hint: "장애물을 피해서 가보세요!" },
  { name: "3단계 · 미로 탈출", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[0,3],[1,3],[0,2],[1,2],[3,3],[4,3],[3,1],[0,1],[1,1]], hint: "가운데 길을 잘 찾아보세요! 화이팅!" },
  { name: "4단계 · 두 갈래 길", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[2,2],[2,3]], hint: "가운데 돌멩이를 피해 돌아가요!" },
  { name: "5단계 · 벽 사이로", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 4 }, blocks: [[2,0],[2,1],[2,3],[2,4]], hint: "벽에 난 틈을 찾아 지나가요!" },
  { name: "6단계 · 뱀 길", start: { x: 0, y: 4, dir: 1 }, flag: { x: 4, y: 0 }, blocks: [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[0,3],[1,3],[3,3],[4,3],[3,4],[4,4]], hint: "뱀처럼 구불구불 가요!" },
  { name: "7단계 · 계단 오르기", start: { x: 0, y: 4, dir: 1 }, flag: { x: 4, y: 0 }, blocks: [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[0,2],[1,2],[4,2],[0,3],[3,3],[4,3],[2,4],[3,4],[4,4]], hint: "계단처럼 한 칸씩 올라가요!" },
  { name: "8단계 · 우회로", start: { x: 4, y: 4, dir: 0 }, flag: { x: 0, y: 0 }, blocks: [[4,1],[4,2],[3,2],[2,2],[1,2]], hint: "막힌 길은 돌아가요!" },
  { name: "9단계 · 미로 입문", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[0,2],[2,3],[1,1],[4,1],[4,2],[3,3]], hint: "미로에 처음 도전해요. 길을 잘 봐요!" },
  { name: "10단계 · 두 개의 벽", start: { x: 0, y: 0, dir: 1 }, flag: { x: 4, y: 4 }, blocks: [[0,2],[1,2],[3,0],[4,0],[0,3],[1,3]], hint: "벽 두 개를 뚫고 지나가요!" },
  { name: "11단계 · 긴 여정", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[3,1],[1,3],[3,3],[2,1],[3,2],[1,4]], hint: "길게 돌아가요. 차례차례!" },
  { name: "12단계 · 나선 길", start: { x: 0, y: 4, dir: 1 }, flag: { x: 2, y: 2 }, blocks: [[0,0],[1,0],[0,1],[1,1],[3,1],[0,2],[1,2],[3,2],[0,3],[1,3],[2,3],[3,3]], hint: "소용돌이처럼 빙글빙글 들어가요!" },
  { name: "13단계 · 함정 길", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[0,1],[1,3],[3,2],[4,2],[1,0],[3,1]], hint: "막다른 길에 속지 마세요!" },
  { name: "14단계 · 좁은 다리", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[0,2],[1,2],[3,2],[4,2],[0,1],[1,1],[0,0],[1,0],[2,0],[3,0],[3,3],[4,3]], hint: "좁은 다리를 건너요!" },
  { name: "15단계 · 미로 중급", start: { x: 4, y: 0, dir: 2 }, flag: { x: 0, y: 4 }, blocks: [[3,0],[2,0],[1,0],[3,1],[1,1],[0,1],[0,2],[1,2],[3,3],[4,3],[0,3],[1,3]], hint: "위에서 아래로 미로를 뚫어요!" },
  { name: "16단계 · 지그재그 미로", start: { x: 0, y: 4, dir: 0 }, flag: { x: 4, y: 0 }, blocks: [[0,2],[2,3],[1,1],[3,2],[4,1],[0,1],[4,2],[2,4],[3,4]], hint: "지그재그로 미로를 빠져나와요!" },
  { name: "17단계 · 대미로", start: { x: 0, y: 0, dir: 1 }, flag: { x: 4, y: 4 }, blocks: [[2,0],[3,0],[4,0],[0,1],[2,1],[3,1],[4,1],[0,2],[3,2],[4,2],[0,3],[1,3],[4,3],[0,4],[1,4],[2,4]], hint: "큰 미로를 정복해요!" },
  { name: "18단계 · 최종 관문", start: { x: 4, y: 4, dir: 3 }, flag: { x: 0, y: 0 }, blocks: [[0,1],[1,1],[3,1],[4,1],[0,2],[1,2],[4,2],[0,3],[1,3],[2,3],[4,3],[0,4],[1,4],[2,4],[3,0],[4,0]], hint: "마지막 관문이에요. 힘내요!" },
  { name: "19단계 · 숨은 길", start: { x: 4, y: 0, dir: 3 }, flag: { x: 4, y: 4 }, blocks: [[4,1],[3,1],[2,1],[1,1],[3,2],[4,2],[0,3],[1,3],[3,3],[4,3],[0,4],[1,4]], hint: "숨은 길을 찾아요!" },
  { name: "20단계 · 마스터 미로", start: { x: 4, y: 4, dir: 3 }, flag: { x: 4, y: 0 }, blocks: [[4,3],[3,3],[2,3],[1,3],[1,2],[3,1],[1,1],[3,0]], hint: "마지막 미로! 로봇 박사가 될 시간이에요!" },
];
const PR_ROBOT_CMDS = { F: "⬆️ 앞으로", L: "↩️ 왼쪽으로", R: "↪️ 오른쪽으로" };
const PR_DIR_ARROW = ["⬆️", "➡️", "⬇️", "⬅️"];
function prRobotStart(stage) {
  prStopAll();
  const st = PR_ROBOT_STAGES[stage - 1];
  prRobot = { stage, cmds: [], pos: { ...st.start }, running: false, step: 0, over: false, result: null, msg: "" };
  prScreen = "robot";
  prPlayStart();
  prRobotRender();
}
function prRobotRender() {
  const g = prRobot;
  if (!g) return;
  const st = PR_ROBOT_STAGES[g.stage - 1];
  const rec = prRobotRec(prName);
  if (g.result) {
    const c = g.result;
    prModalShow(`${prHead("🤖 코딩 로봇", `${escapeHtml(prName)} · ${st.name}`)}
      <div class="pr-result ${c.win ? "win" : ""}"><div class="pr-result-big">${c.win ? "🚩 깃발 도착!" : "💥 쿵!"}</div>
      <p>${c.win ? `${st.name}을 깼어요!` : c.msg}</p>
      <div class="pr-result-btns">
        ${c.win && g.stage < PR_ROBOT_STAGES.length ? `<button type="button" class="pr-btn" data-pr="robot-next">${g.stage + 1}단계 가기!</button>` : ""}
        ${c.win && g.stage >= PR_ROBOT_STAGES.length ? `<p>🏆 <b>20단계를 모두 깼어요! 로봇 박사예요!</b></p>` : ""}
        <button type="button" class="pr-btn soft" data-pr="robot-retry">다시 하기</button>
        <button type="button" class="pr-btn soft" data-pr="back-lobby">놀이방으로</button></div></div>`);
    return;
  }
  const isBlock = (x, y) => st.blocks.some(([bx, by]) => bx === x && by === y);
  let cells = "";
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    let inner = "";
    if (isBlock(x, y)) inner = "🪨";
    else if (x === st.flag.x && y === st.flag.y) inner = "🚩";
    if (x === g.pos.x && y === g.pos.y) inner = `<span class="pr-robot"><span class="pr-robot-dir">${PR_DIR_ARROW[g.pos.dir]}</span><span>🤖</span></span>`;
    cells += `<div class="pr-cell${isBlock(x, y) ? " block" : ""}${x === st.flag.x && y === st.flag.y ? " flag" : ""}">${inner}</div>`;
  }
  prModalShow(`${prHead("🤖 코딩 로봇", `${escapeHtml(prName)} · 명령을 쌓고 출발을 눌러 로봇을 깃발까지 보내요!`)}
    <div class="pr-stage-btns">${PR_ROBOT_STAGES.map((s, i) => {
      const n = i + 1, locked = n > Math.min(rec.stage, PR_ROBOT_STAGES.length);
      return `<button type="button" class="pr-stage-btn${g.stage === n ? " on" : ""}" data-pr="robot-stage" data-stage="${n}" ${locked ? "disabled" : ""}>${locked ? "🔒 " : ""}${n}단계</button>`;
    }).join("")}</div>
    <p class="pr-sub" style="margin:4px 0 8px"><b>${st.name}</b> — ${st.hint}</p>
    <div class="pr-grid">${cells}</div>
    ${g.msg ? `<p class="pr-msg">${g.msg}</p>` : ""}
    <div class="pr-cmds"><span>명령 (${g.cmds.length}/30):</span>
      ${g.cmds.length ? g.cmds.map((c, i) => `<button type="button" class="pr-cmd-chip" data-pr="robot-del" data-i="${i}" title="누르면 빼요">${PR_ROBOT_CMDS[c]}</button>`).join("") : `<span class="pr-empty">아래 버튼을 눌러 명령을 쌓아요</span>`}</div>
    <div class="pr-palette">${Object.entries(PR_ROBOT_CMDS).map(([k, v]) => `<button type="button" class="pr-btn" data-pr="robot-cmd" data-cmd="${k}" ${g.running || g.cmds.length >= 30 ? "disabled" : ""}>${v}</button>`).join("")}</div>
    <div class="pr-result-btns">
      <button type="button" class="pr-btn" data-pr="robot-run" ${g.running || !g.cmds.length ? "disabled" : ""}>▶ 출발!</button>
      <button type="button" class="pr-btn soft" data-pr="robot-clear" ${g.running ? "disabled" : ""}>🧹 지우기</button>
      <button type="button" class="pr-btn soft" data-pr="robot-reset" ${g.running ? "disabled" : ""}>↩️ 처음부터</button></div>`);
}
function prRobotRun() {
  const g = prRobot;
  if (!g || g.running || !g.cmds.length) return;
  g.running = true; g.step = 0; g.msg = "";
  prRobotRender();
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const tick = () => {
    if (!prRobot || prRobot !== g) return;
    if (prPaused) { prTimeout(tick, 450); return; }   // 토큰 팝업 떠 있는 동안 멈춤
    if (g.step >= g.cmds.length) {
      g.running = false;
      const st = PR_ROBOT_STAGES[g.stage - 1];
      if (g.pos.x === st.flag.x && g.pos.y === st.flag.y) prRobotWin();
      else { g.msg = "명령이 끝났는데 깃발에 못 닿았어요. 명령을 고쳐 봐요!"; prRobotRender(); }
      return;
    }
    const c = g.cmds[g.step++];
    if (c === "L") g.pos.dir = (g.pos.dir + 3) % 4;
    else if (c === "R") g.pos.dir = (g.pos.dir + 1) % 4;
    else {
      const st = PR_ROBOT_STAGES[g.stage - 1];
      const [dx, dy] = dirs[g.pos.dir];
      const nx = g.pos.x + dx, ny = g.pos.y + dy;
      if (nx < 0 || nx > 4 || ny < 0 || ny > 4 || st.blocks.some(([bx, by]) => bx === nx && by === ny)) {
        g.running = false; prStopAll();
        g.result = { win: false, msg: "쿵! 돌멩이(또는 벽)에 부딪혔어요. 명령을 다시 짜 봐요!" };
        prBeep(180, 0.2); prRobotRender(); return;
      }
      g.pos.x = nx; g.pos.y = ny;
      prBeep(520 + g.step * 20, 0.05);
      if (nx === st.flag.x && ny === st.flag.y) { g.running = false; prRobotRender(); prRobotWin(); return; }
    }
    prRobotRender();
    prTimeout(tick, 450);
  };
  prTimeout(tick, 450);
}
function prRobotWin() {
  const g = prRobot;
  if (!g) return;
  g.running = false; prStopAll();
  const rec = prRobotRec(prName);
  prSave("robot", { stage: Math.min(PR_ROBOT_STAGES.length, Math.max(rec.stage, g.stage + 1)), clears: rec.clears + 1 });
  g.result = { win: true };
  prBeep(880, 0.12); prTimeout(() => prBeep(1174, 0.2), 140);
  prRobotRender();
}

/* ── 게임 3: 우주 수식 사령관 (구구단 빈칸 — 키패드로 격추) ── */
/* 우주 수식 문제 — 아이: 한 자리 × 한 자리(빈칸은 어느 쪽이든), 어른: 두 자리 × 한 자리(답은 두세 자리) */
function prSpaceProblem() {
  if (prIsAdult(prName)) {
    const a = 11 + Math.floor(Math.random() * 89), b = 2 + Math.floor(Math.random() * 8);   // 11~99 × 2~9
    return { text: `${a} × ${b} = □`, ans: a * b };
  }
  const a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 8);
  const blankA = Math.random() < 0.5;
  return blankA ? { text: `□ × ${b} = ${a * b}`, ans: a } : { text: `${a} × □ = ${a * b}`, ans: b };
}
/* 맨 앞 적(가장 아래) id — 맞힐 수 있는 적은 이 하나뿐 */
function prSpaceFrontId() { const g = prSpace; return (g && g.enemies.length) ? g.enemies.reduce((a, b) => (a.y >= b.y ? a : b)).id : null; }
/* 적에 보이는 문제 문구 — 어른이 숫자를 입력 중이면 맨 앞 적에 "12 × 7 = 8_" 식으로 보인다 */
function prSpaceProbText(e) {
  const g = prSpace;
  if (g && g.input && e.id === prSpaceFrontId()) return e.text.replace("□", g.input + "_");
  return e.text;
}
/* 입력 중인 숫자를 맨 앞 적 비행선에 바로 표시한다 (다시 그리지 않고 글자만 바꾼다) */
function prSpaceShowInput() {
  const area = document.querySelector(".pr-space-area");
  if (!area) return;
  area.querySelectorAll(".pr-enemy").forEach((el) => {
    const e = prSpace && prSpace.enemies.find((x) => x.id === +el.dataset.id);
    if (!e) return;
    const prob = el.querySelector(".pr-prob");
    if (prob) prob.textContent = prSpaceProbText(e);
  });
}
const PR_SPACE_BASE_H = 36;   // 지구 방위선(바닥 바) 높이
function prSpaceGroundY() {
  const area = document.querySelector(".pr-space-area");
  if (!area || !area.clientHeight) return 305;   // 화면 크기를 못 읽으면 예전 기준(305px)
  return Math.max(180, area.clientHeight - PR_SPACE_BASE_H);
}
function prSpaceStart() {
  prStopAll();
  prSpace = { score: 0, hearts: 3, enemies: [], over: false, result: false, tick: 0, nextId: 1, input: "" };   // input: 어른이 입력 중인 답 (한 자리씩 쌓인다)
  prScreen = "space";
  prPlayStart();
  prSpaceRender();
  document.addEventListener("keydown", prSpaceKey);
  prSpace.tick = prTimer(() => prSpaceTick(), 50);
}
function prSpaceKey(ev) {
  if (!prSpace || prSpace.over || prPaused) return;
  if (/^[0-9]$/.test(ev.key)) prSpaceFire(+ev.key);
}
function prSpaceSpawn() {
  const g = prSpace;
  const p = prSpaceProblem();
  const e = { id: g.nextId++, x: 50, y: 0, ...p };   // 한 줄(가운데 열)로만 내려온다
  g.enemies.push(e);
  const area = document.querySelector(".pr-space-area");
  if (area) {
    const d = document.createElement("div");
    d.className = "pr-enemy";
    d.dataset.id = e.id;
    d.style.left = `${e.x}%`;
    d.style.top = "0px";
    d.innerHTML = `<span class="pr-ship">🛸</span><span class="pr-prob">${prSpaceProbText(e)}</span>`;
    area.appendChild(d);
  }
}
function prSpaceTick() {
  const g = prSpace;
  if (!g || g.over) return;
  g.tick++;
  if (prPaused) return;   // 토큰 팝업 떠 있는 동안 멈춤
  const gap = Math.max(48, 85 - Math.floor(g.score / 2));   // 앞 적과 간격 — 점수가 오르면 촘촘히
  const lastE = g.enemies[g.enemies.length - 1];
  if (!lastE || lastE.y >= gap) prSpaceSpawn();
  const speed = 0.45 + Math.min(1.5, g.score / 120);        // 1단계는 천천히 (초당 9px) — 점수가 오르면 빨라진다
  let lost = false;
  g.enemies.forEach((e) => { e.y += speed; });
  const kept = [];
  for (const e of g.enemies) {
    if (e.y >= prSpaceGroundY()) { lost = true; }
    else kept.push(e);
  }
  g.enemies = kept;
  if (lost) {
    g.hearts -= 1;
    g.input = "";   // 맨 앞 적이 땅에 닿으면 입력 중이던 숫자도 지운다
    prBeep(160, 0.25);
    const area = document.querySelector(".pr-space-area");
    if (area) { area.classList.add("shake"); setTimeout(() => area.classList.remove("shake"), 400); }
    if (g.hearts <= 0) { prSpaceGameOver(); return; }
    prSpaceShowInput();
  }
  const area = document.querySelector(".pr-space-area");
  if (area) {
    const frontId = g.enemies.length ? g.enemies.reduce((a, b) => (a.y >= b.y ? a : b)).id : null;
    area.querySelectorAll(".pr-enemy").forEach((el) => {
      const e = g.enemies.find((x) => x.id === +el.dataset.id);
      if (e) { el.style.top = `${e.y}px`; el.classList.toggle("front", e.id === frontId); }
    });
    const h = document.querySelector(".pr-space-hearts");
    if (h) h.textContent = "❤️".repeat(g.hearts) + "🖤".repeat(3 - g.hearts);
    const s = document.querySelector(".pr-space-score");
    if (s) s.textContent = `⭐ ${g.score}점`;
  }
}
function prSpaceRender() {
  const g = prSpace;
  if (!g) return;
  const rec = prSpaceRec(prName);
  if (g.result) {
    prModalShow(`${prHead("🚀 우주 수식 사령관", `${escapeHtml(prName)} · ${prIsAdult(prName) ? "두 자리 곱셈으로 우주를 지켜요!" : "구구단으로 우주를 지켜요!"}`)}
      <div class="pr-result"><div class="pr-result-big">👾 게임 오버!</div>
      <p>${g.score}점! 최고 기록: ${Math.max(rec.best, g.score)}점</p>
      <div class="pr-result-btns">
        <button type="button" class="pr-btn" data-pr="space-retry">다시 하기</button>
        <button type="button" class="pr-btn soft" data-pr="back-lobby">놀이방으로</button></div></div>`);
    return;
  }
  const frontId = g.enemies.length ? g.enemies.reduce((a, b) => (a.y >= b.y ? a : b)).id : null;
  prModalShow(`${prHead("🚀 우주 수식 사령관", `${escapeHtml(prName)} · ${prIsAdult(prName) ? "맨 앞 적부터 순서대로! 답을 한 자리씩 눌러요 — 자리 수가 다 차면 자동으로 발사돼요!" : "맨 앞 적부터 순서대로! 빈칸 숫자를 눌러 미사일을 쏴요!"}`)}
    <div class="pr-hud"><span class="pr-space-score">⭐ ${g.score}점</span><span class="pr-space-hearts">${"❤️".repeat(g.hearts)}${"🖤".repeat(3 - g.hearts)}</span><span>최고 ${rec.best}점</span></div>
    <div class="pr-space-area">${g.enemies.map((e) => `<div class="pr-enemy${e.id === frontId ? " front" : ""}" data-id="${e.id}" style="left:${e.x}%;top:${e.y}px"><span class="pr-ship">🛸</span><span class="pr-prob">${prSpaceProbText(e)}</span></div>`).join("")}
      <div class="pr-base">🌍 지구 방위선</div></div>
    <div class="pr-keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button type="button" class="pr-key" data-pr="space-key" data-k="${n}">${n}</button>`).join("")}</div>
    <p class="pr-note">💡 노란 테두리의 맨 앞 적만 맞힐 수 있어요. ${prIsAdult(prName) ? "답을 한 자리씩 눌러요 (예: 84면 8, 4). " : ""}키보드 숫자 0~9를 눌러도 돼요. 적이 땅에 닿으면 하트 1개가 사라져요!</p>`);
}
function prSpaceFire(d) {
  const g = prSpace;
  if (!g || g.over || prPaused) return;
  if (!g.enemies.length) return;
  const target = g.enemies.reduce((a, b) => (a.y >= b.y ? a : b));   // 맨 앞(가장 아래) 적만 맞힐 수 있다 — 순서대로
  if (prIsAdult(prName)) {
    // 어른: 답이 두세 자리라 숫자를 한 자리씩 쌓는다 — 자리 수가 다 차면 자동으로 발사한다
    const ansStr = String(target.ans);
    if (g.input.length === 0 && d === 0) return;   // 답은 0으로 시작하지 않는다
    if (g.input.length >= ansStr.length) return;
    g.input += String(d);
    prBeep(660, 0.05);
    if (g.input.length < ansStr.length) { prSpaceShowInput(); return; }   // 아직 자리 남음 — 맨 앞 적에 "12 × 7 = 8_" 식으로 보인다
    if (g.input !== ansStr) {   // 자리 수가 다 찼는데 틀림 — 흔들리고 입력만 지운다 (벌칙 없음)
      g.input = "";
      prSpaceShowInput();
      const kp = document.querySelector(".pr-keypad");
      if (kp) { kp.classList.add("shake"); setTimeout(() => kp.classList.remove("shake"), 300); }
      prBeep(200, 0.08);
      return;
    }
    g.input = "";   // 맞힘 — 아래 공통 처리(미사일·점수)로 이어진다
  } else if (target.ans !== d) {
    const kp = document.querySelector(".pr-keypad");
    if (kp) { kp.classList.add("shake"); setTimeout(() => kp.classList.remove("shake"), 300); }
    prBeep(200, 0.08);
    return;
  }
  const area = document.querySelector(".pr-space-area");
  if (area) {
    const m = document.createElement("div");
    m.className = "pr-missile";
    m.style.left = `calc(${target.x}% + 14px)`;
    m.style.top = prSpaceGroundY() + "px";
    m.textContent = "🚀";
    area.appendChild(m);
    requestAnimationFrame(() => { m.style.top = `${target.y + 8}px`; });
    prTimeout(() => {
      m.remove();
      const boom = document.createElement("div");
      boom.className = "pr-boom";
      boom.style.left = `${target.x}%`;
      boom.style.top = `${target.y}px`;
      boom.textContent = "💥";
      area.appendChild(boom);
      prTimeout(() => boom.remove(), 350);
    }, 190);
  }
  g.enemies = g.enemies.filter((e) => e.id !== target.id);
  g.score += 10;
  prBeep(990, 0.07);
  prSpaceRender();
}
function prSpaceGameOver() {
  const g = prSpace;
  if (!g || g.over) return;
  g.over = true; prStopAll();
  const rec = prSpaceRec(prName);
  prSave("space", { best: Math.max(rec.best, g.score), plays: rec.plays + 1 });
  g.result = true;
  prBeep(220, 0.3);
  prSpaceRender();
}

/* ── 🏇 경마 (공개용 게임 — 가족 이름을 쓰지 않는다) ──
   이름 선택 카드 아래 "🏇 공통 게임" 섹션에서 연다. 이름 선택 없이 바로 할 수 있다.
   흐름: 경마 카드 누름 → 인원 선택(2~10명) → 그 수만큼 말이 나오고 말마다 랜덤 이름
   → 각자 말 이름을 정한다(기본 랜덤 이름 그대로 써도 되고, 눌러서 바꿀 수도 있다)
   → 출발. 누가 어떤 말인지 구두로 정하면 된다. 말을 화면에서 고르는 UI는 없다.
   달리다 넘어지기도 하고, 트랙의 당근을 먹으면 빨라진다. 막판 스퍼트와 사진 판정도 있다.
   말 이름이 경주마다 바뀌니 우승 기록은 남기지 않고, 놀이 시간 토큰 집계에서도 뺀다. */
const PR_RACE_FINISH = 100;
const PR_RACE_TICK_MS = 100;
/* 말 이름 풀 — 재미있는 이름, 중복 없이 뽑는다. 가족 이름은 절대 넣지 않는다 */
const PR_RACE_NAME_POOL = ["번개", "질풍", "무지개", "당근이", "날쌘돌이", "구름", "별이", "해피", "토토", "루비", "코코", "몽이", "달이", "초코", "바람", "불꽃", "돌돌이", "콩콩이", "까미", "보리"];
function prRaceRandomNames(n) {
  const pool = [...PR_RACE_NAME_POOL];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
/* 기수 색 — 레인(말)마다 다르게 (사람이 아니라 말 순서 기준). 10개 레인까지 겹치지 않게 10색 */
const PR_RACE_LANE_COLORS = ["#dc2626", "#2563eb", "#f59e0b", "#16a34a", "#9333ea", "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5"];
function prRaceColor(i) { return PR_RACE_LANE_COLORS[i % PR_RACE_LANE_COLORS.length]; }
/* 이름 받침에 맞는 조사 — 받침 있으면 이/은/을, 없으면 가/는/를 */
function prHasBatchim(s) {
  if (!s) return false;
  const c = s.charCodeAt(s.length - 1);
  return c >= 0xAC00 && c <= 0xD7A3 && ((c - 0xAC00) % 28) !== 0;
}
function prJosa(name, withJ, withoutJ) { return name + (prHasBatchim(name) ? withJ : withoutJ); }
/* 말+기수 한 덩어리 HTML — 🐎는 기본이 왼쪽 보기라 scaleX(-1)로 오른쪽(결승선 방향)을 보게 한다 */
function prHorseHtml(name, big, lane) {
  return `<span class="pr-horse${big ? " big" : ""}" data-name="${escapeHtml(name)}" style="left:0%"><span class="pr-jockey" style="--jc:${prRaceColor(lane || 0)}"><span class="pr-jockey-head"></span><span class="pr-jockey-body"></span></span><span class="pr-horse-face">🐎</span></span>`;
}
/* 경마 시작 — 인원 선택 화면부터 (count를 주면 같은 인원으로 새 랜덤 이름으로 바로 다시 뛴다) */
function prRaceStart(fromPicker, count) {
  prStopAll();
  prRace = { count: 0, horses: [], carrots: [], over: false, result: null, winner: null, second: null, photo: false, started: false, winSaved: false, fromPicker: !!fromPicker, log: [], now: 0, step: "count" };
  prScreen = "race";
  if (count >= 2 && count <= 10) prRacePickCount(count);
  else prRaceRender();
}
/* 인원 수만큼 말을 만들고 랜덤 이름을 붙인다 (중복 없이) */
function prRacePickCount(n) {
  const g = prRace;
  if (!g || g.step !== "count") return;
  const names = prRaceRandomNames(n);
  g.count = n;
  g.horses = names.map((nm) => ({
    name: nm,
    x: 0,
    base: 2.0 + Math.random() * 0.8,   // 기본 속도(%/초) — 말마다 다름
    boostUntil: 0,
    downUntil: 0,
    lastTrip: -10,
  }));
  const carrots = [];
  for (let i = 0; i < 4; i++) carrots.push({ lane: Math.floor(Math.random() * n), x: 22 + Math.random() * 64, eaten: false });
  g.carrots = carrots;
  g.step = "ready";
  g.log = ["🏇 말이 출발선에 섰어요!"];
  prRaceRender();
}
function prRaceGo() {
  const g = prRace;
  if (!g || g.started || g.step !== "ready") return;   // 인원만 정하면 출발할 수 있다
  g.started = true;
  g.log.push("🏇 출발!!");
  prBeep(880, 0.12);
  prRaceRender();
  prTimer(() => prRaceTick(), PR_RACE_TICK_MS);
}
function prRaceTick() {
  const g = prRace;
  if (!g || g.over || !g.started) return;
  if (prPaused) return;   // 토큰 팝업 떠 있는 동안 멈춤
  g.now += PR_RACE_TICK_MS / 1000;
  g.horses.forEach((h, hi) => {
    if (g.now < h.downUntil) return;   // 넘어져서 잠깐 멈춤
    let sp = h.base * (0.85 + Math.random() * 0.3);   // 매 틱 조금씩 달라진다 — 엎치락뒤치락
    if (g.now < h.boostUntil) sp *= 1.7;              // 당근 부스트
    h.x += sp * (PR_RACE_TICK_MS / 1000);
    g.carrots.forEach((c) => {
      if (c.lane === hi && !c.eaten && h.x >= c.x) {
        c.eaten = true;
        h.boostUntil = g.now + 2.5;
        g.log.push(`🥕 ${prJosa(h.name, "이", "가")} 당근을 냠냠! 빨라졌어요!`);
        prBeep(990, 0.07);
      }
    });
    // 막판 스퍼트: 80% 넘어 뒤처진 말이 스퍼트
    if (h.x >= 80) {
      const leader = Math.max(...g.horses.map((o) => o.x));
      if (leader - h.x > 5 && Math.random() < 0.05) {
        h.boostUntil = Math.max(h.boostUntil, g.now + 2);
        g.log.push(`🔥 ${h.name}의 막판 스퍼트!`);
      }
    }
    // 넘어짐: 달리는 중에 가끔 (연속 넘어짐 방지)
    if (h.x > 5 && h.x < 98 && g.now - h.lastTrip > 3 && Math.random() < 0.004) {
      h.lastTrip = g.now;
      h.downUntil = g.now + 1.5;
      g.log.push(`💥 ${prJosa(h.name, "이", "가")} 넘어졌어요!`);
      prBeep(180, 0.15);
    }
  });
  const order = [...g.horses].sort((a, b) => b.x - a.x);
  if (order[0].x >= PR_RACE_FINISH) {
    g.winner = order[0];
    g.second = order[1] || null;
    g.photo = !!(g.second && g.winner.x - g.second.x < 1.5);   // 2등이 바짝 붙었으면 사진 판정!
    g.over = true;
    prRaceFinish();
    return;
  }
  prRaceLive();
}
/* 경주 중에는 전체를 다시 그리지 않고 말 위치·당근·중계만 바꾼다 (깜빡임 없이 부드럽게) */
function prRaceLive() {
  const g = prRace;
  if (!g) return;
  const area = document.querySelector(".pr-race-track");
  if (!area) return;
  const lanes = area.querySelectorAll(".pr-lane");   // 이름은 바꿀 수 있으니 레인 순서로 찾는다
  g.horses.forEach((h, hi) => {
    const lane = lanes[hi];
    if (!lane) return;
    const el = lane.querySelector(".pr-horse");
    if (!el) return;
    el.style.left = Math.min(94, h.x) + "%";
    el.classList.toggle("down", g.now < h.downUntil);
    el.classList.toggle("boost", g.now < h.boostUntil);
    el.classList.toggle("run", g.started && g.now >= h.downUntil);
  });
  g.carrots.forEach((c, i) => {
    const el = area.querySelector(`.pr-carrot[data-i="${i}"]`);
    if (el) el.style.display = c.eaten ? "none" : "";
  });
  const log = document.querySelector(".pr-race-log");
  if (log) log.innerHTML = g.log.slice(-3).map((l) => `<div>${l}</div>`).join("");
  const lead = document.querySelector(".pr-race-lead");
  if (lead) {
    const order = [...g.horses].sort((a, b) => b.x - a.x);
    lead.textContent = `지금 1위: ${order[0].name} 🐎`;
  }
}
/* 경마 전용 머리줄 — 닫기/돌아가기는 들어온 곳으로 간다 (공통 게임에서 열었으면 이름 선택 화면으로, 아니면 로비로) */
function prRaceBackAct() { return (prRace && prRace.fromPicker) ? "back-picker" : "back-lobby"; }
function prRaceHead(title, sub) { return `<div class="pr-game-head"><div><h2>${title}</h2><p class="pr-sub">${sub}</p></div><div class="pr-head-btns"><button type="button" class="pr-back" data-pr="${prRaceBackAct()}">← 놀이방으로</button><button type="button" class="pr-x" data-pr="${prRaceBackAct()}" aria-label="닫기">✕</button></div></div>`; }
function prRaceRender() {
  const g = prRace;
  if (!g) return;
  if (g.step === "count") {
    prModalShow(`${prRaceHead("🏇 경마 게임", "몇 명이 할까요?")}
      <div class="pr-race-count">
        <p class="pr-sub">말은 몇 마리가 뛸까요?</p>
        <div class="pr-count-btns">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" class="pr-btn" data-pr="race-count" data-n="${n}">${n}명</button>`).join("")}</div>
        <p class="pr-note">💡 말 이름은 랜덤으로 정해져요. 누가 어떤 말인지 구두로 정하면 돼요!</p>
        <div class="pr-result-btns"><button type="button" class="pr-btn soft" data-pr="${prRaceBackAct()}">← 놀이방으로</button></div>
      </div>`);
    return;
  }
  if (g.result) {
    const w = g.winner;
    const order = [...g.horses].sort((a, b) => b.x - a.x);
    prModalShow(`${prRaceHead("🏇 경마 게임", "🏁 경주 끝!")}
      <div class="pr-result win"><div class="pr-winner-horse">${prHorseHtml(w.name, true, g.horses.indexOf(w))}</div><div class="pr-result-big">🎉 ${escapeHtml(w.name)} 우승!</div>
      ${g.photo ? `<p>📸 사진 판정! 아슬아슬했어요!</p>` : ""}
      <p>${order.map((h, i) => `${i + 1}위 ${escapeHtml(h.name)}`).join(" · ")}</p>
      <div class="pr-result-btns">
        <button type="button" class="pr-btn" data-pr="race-retry">🏇 다시 경주하기</button>
        <button type="button" class="pr-btn soft" data-pr="race-recount">👥 인원 다시 고르기</button>
        <button type="button" class="pr-btn soft" data-pr="${prRaceBackAct()}">← 놀이방으로</button></div></div>`);
    return;
  }
  const lanes = g.horses.map((h, hi) => `
    <div class="pr-lane" data-lane="${hi}">
      <input type="text" class="pr-race-name-input" data-lane="${hi}" value="${escapeHtml(h.name)}" maxlength="8"${g.started ? " disabled" : ""}>
      ${prHorseHtml(h.name, false, hi)}
      ${g.carrots.filter((c) => c.lane === hi).map((c) => `<span class="pr-carrot" data-i="${g.carrots.indexOf(c)}" style="left:${c.x}%">🥕</span>`).join("")}
      <span class="pr-finish">🏁</span>
    </div>`).join("");
  prModalShow(`${prRaceHead("🏇 경마 게임", "말 이름을 눌러서 바꿀 수 있어요! 누가 어떤 말인지 구두로 정해요 🐎")}
    <div class="pr-hud"><span>${g.started ? "🏇 경주 중" : "🏇 출발 준비"}</span><span class="pr-race-lead">지금 1위: —</span><span>🐎 ${g.horses.length}마리 경주</span></div>
    <div class="pr-race-track${g.horses.length >= 8 ? " crowded" : g.horses.length >= 6 ? " many" : ""}">${lanes}</div>
    <div class="pr-race-log">${g.log.slice(-3).map((l) => `<div>${l}</div>`).join("")}</div>
    <div class="pr-result-btns">
      ${g.started ? "" : `<button type="button" class="pr-btn" data-pr="race-start">🏇 출발!</button>`}
      <button type="button" class="pr-btn soft" data-pr="${prRaceBackAct()}">← 놀이방으로</button></div>
    <p class="pr-note">💡 달리다 넘어지기도 하고, 당근을 먹으면 빨라져요! 마지막에는 막판 스퍼트도 있어요.</p>`);
}
function prRaceFinish() {
  const g = prRace;
  if (!g || g.winSaved) return;   // 한 경주에 딱 한 번만 끝낸다
  g.winSaved = true;
  prStopAll();
  prBeep(880, 0.15); prTimeout(() => prBeep(1174, 0.25), 160);
  g.result = true;
  prRaceRender();
}

/* ── 게임 4: ✏️ 맞춤법 몬스터 배틀 ──
   문제를 맞추면 내 포켓몬이 상대를 공격하고, 틀리면(시간 초과도) 상대가 나를 공격한다. 하트 3개.
   내 몬스터는 내가 가진 포켓몬: 아이는 지금 키우는 동료(알이면 🥚), 아빠는 토큰 동료(아빠/포켓몬-동료.json),
   엄마는 키우는 포켓몬이 없어서 피카츄가 함께 싸운다.
   쉬운 문제부터, 상대는 등급 낮은 몬스터부터 점점 강해진다:
   1단계 D(쉬운 문제) → 2단계 C(쉬운 문제) → 3단계 B(중간) → 4단계 A(중간) → 5단계 S(어려운 문제) → 6단계 SS(어려운 문제).
   6단계를 다 깨면 "🏆 맞춤법 박사!" — 그 뒤로는 S/SS급 상대 + 어려운 문제로 계속 이어진다.
   상대 HP: D 3 · C 3 · B 4 · A 4 · S 5 · SS 6. 정답 +10점, 처치 보너스 +30점. 문제당 15초. */
/* 문제 은행 — 2지선다. q: 빈칸(___)이 있는 문장, opts: 선택지 2개, ok: 정답, why: 한 줄 설명, lv: easy|med|hard.
   표준 맞춤법으로 정답이 하나인 것만 넣었다. "재미있다/재밌다"처럼 둘 다 맞는 건 뺐다. */
const PR_SPELL_BANK = [
  /* 쉬움 33개 — 1·2단계(D·C)용 */
  { lv: "easy", q: "잠잘 때 머리를 받치는 건 ___야.", opts: ["베개", "배게"], ok: "베개", why: "'베개'가 맞아요. '배게'는 틀린 말이에요." },
  { lv: "easy", q: "___ 오늘은 기분이 좋아.", opts: ["왠지", "웬지"], ok: "웬지", why: "'왜인지'가 줄어서 '웬지'가 돼요. '왠지'는 틀린 말이에요." },
  { lv: "easy", q: "우산을 안 가져왔어. 비가 오면 ___?", opts: ["어떡해", "어떻해"], ok: "어떡해", why: "'어떻게 해'가 줄어서 '어떡해'가 돼요." },
  { lv: "easy", q: "___ 전에 만났던 친구야.", opts: ["며칠", "몇일"], ok: "며칠", why: "'며칠'이 맞아요. '몇일'은 틀린 말이에요." },
  { lv: "easy", q: "___이야! 잘 지냈어?", opts: ["오랜만", "오랫만"], ok: "오랜만", why: "'오래간만'의 줄임말은 '오랜만'이에요." },
  { lv: "easy", q: "엄마, 이거 먹어도 ___?", opts: ["돼", "되"], ok: "돼", why: "'돼'는 '되어'의 줄임말이에요. '해도 돼'가 맞아요." },
  { lv: "easy", q: "숙제가 다 ___.", opts: ["됐어", "됬어"], ok: "됐어", why: "'됐다'는 '되었다'가 줄은 말이에요. '됬어'는 틀린 말이에요." },
  { lv: "easy", q: "밥을 먹고 ___ 했어.", opts: ["설거지", "설겆이"], ok: "설거지", why: "'설거지'가 맞아요. '설겆이'는 틀린 말이에요." },
  { lv: "easy", q: "이 영화는 ___ 처음 봐.", opts: ["아예", "아얘"], ok: "아예", why: "'아예'가 맞아요. '전혀'라는 뜻이에요." },
  { lv: "easy", q: "친구랑 재미있는 ___ 했어.", opts: ["얘기", "애기"], ok: "얘기", why: "'얘기'는 '이야기'의 줄임말이에요. '애기'는 아기를 뜻해요." },
  { lv: "easy", q: "___ 만나!", opts: ["이따", "있다"], ok: "이따", why: "'이따 봐'는 '이따가 봐'가 줄은 말이에요." },
  { lv: "easy", q: "코에서 ___ 나와.", opts: ["콧물", "코물"], ok: "콧물", why: "'콧물'이 맞아요. 코+물 사이에 ㅅ이 들어가요." },
  { lv: "easy", q: "엄마 몰래 친구한테 ___ 했어.", opts: ["귓속말", "귀속말"], ok: "귓속말", why: "'귓속말'이 맞아요. 귀+속말 사이에 ㅅ이 들어가요." },
  { lv: "easy", q: "밥을 많이 먹어서 ___ 아파.", opts: ["뱃속", "배속"], ok: "뱃속", why: "'뱃속'이 맞아요. 배+속 사이에 ㅅ이 들어가요." },
  { lv: "easy", q: "___이 좋아. 따뜻해.", opts: ["햇님", "해님"], ok: "햇님", why: "'햇님'이 맞아요. 해+님 사이에 ㅅ이 들어가요." },
  { lv: "easy", q: "___이 복잡해.", opts: ["머릿속", "머리속"], ok: "머릿속", why: "'머릿속'이 맞아요. 머리+속 사이에 ㅅ이 들어가요." },
  { lv: "easy", q: "방을 ___ 치웠어.", opts: ["깨끗이", "깨끗히"], ok: "깨끗이", why: "'깨끗이'가 맞아요. '깨끗히'는 틀린 말이에요." },
  { lv: "easy", q: "그 옷 참 ___.", opts: ["예뻐", "이뻐"], ok: "예뻐", why: "'예뻐'가 맞아요. '이뻐'는 틀린 말이에요." },
  { lv: "easy", q: "언니는 ___.", opts: ["예쁜", "이쁜"], ok: "예쁜", why: "'예쁜'이 맞아요. '이쁜'은 사투리예요." },
  { lv: "easy", q: "선생님이 수학을 ___ 주세요.", opts: ["가르쳐", "가리켜"], ok: "가르쳐", why: "'가르치다'는 알려주는 거예요. '가리키다'는 손가락으로 짚는 거예요." },
  { lv: "easy", q: "손가락으로 저기를 ___ 보세요.", opts: ["가리켜", "가르쳐"], ok: "가리켜", why: "'가리키다'는 손가락으로 짚는 거예요." },
  { lv: "easy", q: "김치 중에 ___가 제일 좋아.", opts: ["깍두기", "깍뚜기"], ok: "깍두기", why: "'깍두기'가 맞아요. '깍뚜기'는 틀린 말이에요." },
  { lv: "easy", q: "유리컵이 떨어져서 ___졌어.", opts: ["부서", "부셔"], ok: "부서", why: "'부서지다'가 맞아요. '부셔지다'는 틀린 말이에요." },
  { lv: "easy", q: "비가 오면 우산을 ___ 해.", opts: ["써야", "서야"], ok: "써야", why: "'쓰다'가 맞아요. 우산은 쓰는 거예요." },
  { lv: "easy", q: "이거 ___ 하는 거야?", opts: ["어떻게", "어떻해"], ok: "어떻게", why: "'어떻게'가 맞아요. '어떻해'는 틀린 말이에요." },
  { lv: "easy", q: "오늘 ___ 갈 거야.", opts: ["학교에", "학교 에"], ok: "학교에", why: "'학교에'는 붙여 써요." },
  { lv: "easy", q: "___ 좀 빌려줘.", opts: ["이거", "이 거"], ok: "이거", why: "'이거'는 붙여 써요." },
  { lv: "easy", q: "내일은 ___ 갈 거야.", opts: ["도서관에", "도서관 에"], ok: "도서관에", why: "'도서관에'는 붙여 써요." },
  { lv: "easy", q: "엄마가 맛있는 밥을 ___.", opts: ["해줬어", "해 줬어"], ok: "해줬어", why: "'해줬어'는 붙여 써요." },
  { lv: "easy", q: "내가 ___ 할게.", opts: ["도와줄게", "도와 줄게"], ok: "도와줄게", why: "'도와줄게'는 붙여 써요." },
  { lv: "easy", q: "어제 본 영화가 ___ 재밌었어.", opts: ["진짜", "진자"], ok: "진짜", why: "'진짜'가 맞아요. '정말'이라는 뜻이에요." },
  { lv: "easy", q: "이 과자 ___ 맛있어!", opts: ["완전", "완젼"], ok: "완전", why: "'완전'이 맞아요." },
  { lv: "easy", q: "오늘은 ___.", opts: ["즐거웠어", "즐거웟어"], ok: "즐거웠어", why: "'즐거웠어'가 맞아요." },
  /* 중간 32개 — 3·4단계(B·A)용 */
  { lv: "med", q: "이 문제 나 ___.", opts: ["할 수 있어", "할수있어"], ok: "할 수 있어", why: "'할 수 있어'는 띄어 써요." },
  { lv: "med", q: "배고파. 떡볶이 ___.", opts: ["먹고 싶어", "먹고싶어"], ok: "먹고 싶어", why: "'먹고 싶어'는 띄어 써요." },
  { lv: "med", q: "엄마, 나 시험 ___.", opts: ["잘했어", "잘 했어"], ok: "잘했어", why: "'잘했어'는 붙여 써요." },
  { lv: "med", q: "숙제를 ___.", opts: ["못했어", "못 했어"], ok: "못했어", why: "'못했어'는 붙여 써요." },
  { lv: "med", q: "오늘 숙제를 ___.", opts: ["안 했어", "안했어"], ok: "안 했어", why: "'안 했어'는 띄어 써요. '못했어'랑 달라요!" },
  { lv: "med", q: "내일 놀이터에서 ___.", opts: ["할 거야", "할거야"], ok: "할 거야", why: "'할 거야'는 띄어 써요." },
  { lv: "med", q: "내일 학교에 ___.", opts: ["갈 거야", "갈거야"], ok: "갈 거야", why: "'갈 거야'는 띄어 써요." },
  { lv: "med", q: "지금 ___?", opts: ["뭐 해", "뭐해"], ok: "뭐 해", why: "'뭐 해'는 띄어 써요." },
  { lv: "med", q: "친구가 울어. ___?", opts: ["왜 그래", "왜그래"], ok: "왜 그래", why: "'왜 그래'는 띄어 써요." },
  { lv: "med", q: "이거 ___?", opts: ["어떻게 해", "어떻게해"], ok: "어떻게 해", why: "'어떻게 해'는 띄어 써요." },
  { lv: "med", q: "선생님, 저 ___.", opts: ["가르쳐 주세요", "가르쳐주세요"], ok: "가르쳐 주세요", why: "'가르쳐 주세요'는 띄어 써요." },
  { lv: "med", q: "___ 일찍 자.", opts: ["웬만하면", "왠만하면"], ok: "웬만하면", why: "'웬만하면'이 맞아요. '왠만하면'은 틀린 말이에요." },
  { lv: "med", q: "내일 소풍이라 ___이 커.", opts: ["설렘", "설레임"], ok: "설렘", why: "'설렘'이 맞아요. '설레임'은 틀린 말이에요." },
  { lv: "med", q: "___ 기다렸어.", opts: ["오랫동안", "오랜동안"], ok: "오랫동안", why: "'오랫동안'이 맞아요. '오래+동안'은 '오랫동안'이 돼요." },
  { lv: "med", q: "___에 만났던 친구야.", opts: ["지난번", "저번"], ok: "지난번", why: "'지난번'이 맞아요. '저번'은 틀린 말이에요." },
  { lv: "med", q: "___은 할머니 생신이야.", opts: ["글피", "그글피"], ok: "글피", why: "'글피'가 맞아요. 모레 다음 날이에요." },
  { lv: "med", q: "___은 소풍이야.", opts: ["내일모레", "낼모레"], ok: "내일모레", why: "'내일모레'가 맞아요. '낼모레'는 틀린 말이에요." },
  { lv: "med", q: "이렇게 해도 ___?", opts: ["돼요", "되요"], ok: "돼요", why: "'돼요'가 맞아요. '되요'는 틀린 말이에요." },
  { lv: "med", q: "숙제가 다 ___ 선생님이 칭찬했어.", opts: ["됐는데", "됬는데"], ok: "됐는데", why: "'됐는데'가 맞아요." },
  { lv: "med", q: "제가 ___.", opts: ["할게요", "할께요"], ok: "할게요", why: "'할게요'가 맞아요. '할께요'는 틀린 말이에요." },
  { lv: "med", q: "___ 내일 보자.", opts: ["아무튼", "아뭏든"], ok: "아무튼", why: "'아무튼'이 맞아요." },
  { lv: "med", q: "비가 오면 ___.", opts: ["어쩔 수 없어", "어쩔수없어"], ok: "어쩔 수 없어", why: "'어쩔 수 없어'는 띄어 써요." },
{ lv: "med", q: "학교___ 갔어.", opts: ["로", "으로"], ok: "로", why: "'학교'는 받침이 없어서 '로'예요." },
  { lv: "med", q: "밥___ 먹었어.", opts: ["을", "를"], ok: "을", why: "'밥'은 받침이 있어서 '을'이에요." },
  { lv: "med", q: "이 책___ 재밌어.", opts: ["은", "는"], ok: "은", why: "'책'은 받침이 있어서 '은'이에요." },
  { lv: "med", q: "비가 ___ 와.", opts: ["가", "이"], ok: "가", why: "'비'는 받침이 없어서 '가'예요." },
  { lv: "med", q: "사과___ 배를 샀어.", opts: ["와", "과"], ok: "와", why: "'사과'는 받침이 없어서 '와'예요." },
  { lv: "med", q: "학교___ 공부해.", opts: ["에서", "에"], ok: "에서", why: "학교에서 공부하는 건 '에서'예요." },
  { lv: "med", q: "다쳤어? ___?", opts: ["괜찮아", "괜찬아"], ok: "괜찮아", why: "'괜찮아'가 맞아요." },
  { lv: "med", q: "어제 일찍 ___.", opts: ["잤어", "잣어"], ok: "잤어", why: "'잤어'가 맞아요." },
  { lv: "med", q: "손을 ___.", opts: ["씻었어", "씼었어"], ok: "씻었어", why: "'씻었어'가 맞아요." },
  { lv: "med", q: "책을 ___.", opts: ["읽었어", "읽엇어"], ok: "읽었어", why: "'읽었어'가 맞아요." },
  /* 어려움 54개 — 5·6단계(S·SS)용, 그 뒤 끝없는 도전도 같은 문제 */
  { lv: "hard", q: "이 문제는 ___ 문제야.", opts: ["맞춤법", "맞추법"], ok: "맞춤법", why: "'맞춤법'이 맞아요. '맞추법'은 틀린 말이에요." },
  { lv: "hard", q: "시험에서 문제를 다 ___.", opts: ["맞혔어", "맞았어"], ok: "맞혔어", why: "문제를 맞히는 건 '맞히다'예요. 과거형은 '맞혔어'예요." },
  { lv: "hard", q: "___ 알겠어.", opts: ["어느 정도", "어느정도"], ok: "어느 정도", why: "'어느 정도'는 띄어 써요." },
  { lv: "hard", q: "___ 갑자기 비가 왔어.", opts: ["어느 날", "어느날"], ok: "어느 날", why: "'어느 날'은 띄어 써요." },
  { lv: "hard", q: "___이 나를 도와줬어.", opts: ["어떤 사람", "어떤사람"], ok: "어떤 사람", why: "'어떤 사람'은 띄어 써요." },
  { lv: "hard", q: "___ 있어?", opts: ["무슨 일", "무슨일"], ok: "무슨 일", why: "'무슨 일'은 띄어 써요." },
  { lv: "hard", q: "네가 ___?", opts: ["뭐라고요", "뭐라구요"], ok: "뭐라고요", why: "'뭐라고요'가 맞아요." },
  { lv: "hard", q: "내일 소풍이 ___.", opts: ["기대돼요", "기대되요"], ok: "기대돼요", why: "'기대돼요'가 맞아요. '기대되다'의 줄임말이에요." },
  { lv: "hard", q: "내일 소풍이라 마음이 ___.", opts: ["설레요", "설래요"], ok: "설레요", why: "'설레요'가 맞아요. '설래요'는 틀린 말이에요." },
  { lv: "hard", q: "발표라서 ___.", opts: ["긴장돼요", "긴장되요"], ok: "긴장돼요", why: "'긴장돼요'가 맞아요." },
  { lv: "hard", q: "친구야, ___.", opts: ["이리 와", "이리와"], ok: "이리 와", why: "'이리 와'는 띄어 써요." },
  { lv: "hard", q: "강아지야, ___.", opts: ["저리 가", "저리가"], ok: "저리 가", why: "'저리 가'는 띄어 써요." },
  { lv: "hard", q: "공을 ___ 찾아다녔어.", opts: ["이쪽저쪽", "이쪽 저쪽"], ok: "이쪽저쪽", why: "'이쪽저쪽'은 붙여 써요." },
  { lv: "hard", q: "빨리 가면 ___.", opts: ["될 텐데", "될텐데"], ok: "될 텐데", why: "'될 텐데'는 띄어 써요." },
{ lv: "hard", q: "옷을 몸에 ___.", opts: ["맞춰", "맞혀"], ok: "맞춰", why: "옷을 몸에 맞추는 건 '맞추다'예요. 문제를 맞히는 건 '맞히다'예요." },
  { lv: "hard", q: "퀴즈 문제를 다 ___.", opts: ["맞혔어", "맞췄어"], ok: "맞혔어", why: "문제를 맞히는 건 '맞히다'예요. '맞췄어'는 틀린 말이에요." },
  { lv: "hard", q: "모기에 물려 다리가 ___.", opts: ["부었어", "붓었어"], ok: "부었어", why: "'붓다'의 과거형은 '부었어'예요." },
  { lv: "hard", q: "물을 바닥에 ___.", opts: ["쏟았어", "쏟쳤어"], ok: "쏟았어", why: "'쏟다'의 과거형은 '쏟았어'예요." },
  { lv: "hard", q: "내일 할머니를 ___ 갈 거야.", opts: ["뵈러", "보러"], ok: "뵈러", why: "'뵈다'는 어른을 만날 때 쓰는 말이에요." },
  { lv: "hard", q: "선생님께 편지를 ___.", opts: ["드릴게요", "줄게요"], ok: "드릴게요", why: "선생님께 드리는 건 '드리다'예요." },
  { lv: "hard", q: "모르는 걸 선생님께 ___.", opts: ["여쭤볼게요", "물어볼게요"], ok: "여쭤볼게요", why: "선생님께 묻는 건 '여쭤보다'예요." },
  { lv: "hard", q: "할머니 ___을 들었어.", opts: ["말씀", "말"], ok: "말씀", why: "할머니의 말은 '말씀'이라고 해요." },
  { lv: "hard", q: "할머니가 집에 ___.", opts: ["계셔", "있어"], ok: "계셔", why: "할머니가 계실 때는 '계시다'라고 해요." },
  { lv: "hard", q: "할머니가 밥을 ___.", opts: ["잡수셔", "먹어"], ok: "잡수셔", why: "할머니가 밥을 드실 때는 '잡수시다'라고 해요." },
  { lv: "hard", q: "할머니 ___ 축하드려요.", opts: ["생신", "생일"], ok: "생신", why: "할머니 생일은 '생신'이라고 해요." },
  { lv: "hard", q: "할머니 ___이 어떻게 되세요?", opts: ["연세", "나이"], ok: "연세", why: "어른의 나이는 '연세'라고 해요." },
  { lv: "hard", q: "선생님 ___이 뭐예요?", opts: ["성함", "이름"], ok: "성함", why: "선생님의 이름은 '성함'이라고 해요." },
  { lv: "hard", q: "할머니 ___에 갔어.", opts: ["댁", "집"], ok: "댁", why: "할머니 집은 '댁'이라고 해요." },
  { lv: "hard", q: "___께 인사드려.", opts: ["웃어른", "윗어른"], ok: "웃어른", why: "'웃어른'이 맞아요. '윗어른'은 틀린 말이에요." },
  { lv: "hard", q: "회사 ___께 여쭤봐.", opts: ["윗사람", "웃사람"], ok: "윗사람", why: "'윗사람'이 맞아요. '웃사람'은 틀린 말이에요." },
  { lv: "hard", q: "___을 도와줬어.", opts: ["아랫사람", "아랫 사람"], ok: "아랫사람", why: "'아랫사람'은 붙여 써요." },
  { lv: "hard", q: "노력한 ___를 받았어.", opts: ["대가", "댓가"], ok: "대가", why: "'대가'는 ㅅ 없이 써요." },
  { lv: "hard", q: "창문으로 ___이 들어와.", opts: ["햇살", "해살"], ok: "햇살", why: "'햇살'이 맞아요. 해+살 사이에 ㅅ이 들어가요." },
  { lv: "hard", q: "___이 따가워.", opts: ["햇빛", "해빛"], ok: "햇빛", why: "'햇빛'이 맞아요." },
  { lv: "hard", q: "빨래를 ___에 말렸어.", opts: ["햇볕", "해볕"], ok: "햇볕", why: "'햇볕'이 맞아요." },
  { lv: "hard", q: "밤하늘에 ___이 빛나.", opts: ["샛별", "새별"], ok: "샛별", why: "'샛별'이 맞아요. 새+별 사이에 ㅅ이 들어가요." },
  { lv: "hard", q: "엄마랑 ___에 갔어.", opts: ["찻집", "차집"], ok: "찻집", why: "'찻집'이 맞아요." },
  { lv: "hard", q: "쌈에 ___을 넣었어.", opts: ["깻잎", "깨잎"], ok: "깻잎", why: "'깻잎'이 맞아요." },
  { lv: "hard", q: "아저씨 ___이 멋있어.", opts: ["콧수염", "코수염"], ok: "콧수염", why: "'콧수염'이 맞아요." },
  { lv: "hard", q: "운동을 안 해서 ___이 늘었어.", opts: ["뱃살", "배살"], ok: "뱃살", why: "'뱃살'이 맞아요." },
  { lv: "hard", q: "___를 세어 봐.", opts: ["숫자", "수자"], ok: "숫자", why: "'숫자'가 맞아요." },
  { lv: "hard", q: "여름에 ___에 갔어.", opts: ["바닷가", "바다 가"], ok: "바닷가", why: "'바닷가'는 붙여 써요." },
  { lv: "hard", q: "축제장에 사람이 ___ 있어.", opts: ["곳곳", "곳 곳"], ok: "곳곳", why: "'곳곳'은 붙여 써요." },
  { lv: "hard", q: "___이 길어졌어.", opts: ["머리카락", "머리 카락"], ok: "머리카락", why: "'머리카락'은 붙여 써요." },
  { lv: "hard", q: "오는 길에 우리 집에 ___.", opts: ["들를게", "들릴게"], ok: "들를게", why: "'들르다'는 잠깐 들르는 거예요. '들리다'는 소리가 들리는 거예요." },
  { lv: "hard", q: "깜짝 ___!", opts: ["놀랐어", "놀랬어"], ok: "놀랐어", why: "'놀랐어'가 맞아요." },
  { lv: "hard", q: "더워서 ___을 켰어.", opts: ["에어컨", "에어콘"], ok: "에어컨", why: "'에어컨'이 맞아요." },
  { lv: "hard", q: "___이 어디 있어?", opts: ["리모컨", "리모콘"], ok: "리모컨", why: "'리모컨'이 맞아요." },
  { lv: "hard", q: "생일에 ___을 먹었어.", opts: ["케이크", "케익"], ok: "케이크", why: "'케이크'가 맞아요." },
  { lv: "hard", q: "___ 한 잔 주세요.", opts: ["주스", "쥬스"], ok: "주스", why: "'주스'가 맞아요." },
  { lv: "hard", q: "엄마가 ___를 마셔.", opts: ["커피", "코피"], ok: "커피", why: "'커피'가 맞아요. '코피'는 코에서 나는 피예요." },
  { lv: "hard", q: "___ 먹고 싶어.", opts: ["초콜릿", "쵸코렛"], ok: "초콜릿", why: "'초콜릿'이 맞아요." },
  { lv: "hard", q: "점심에 ___을 먹었어.", opts: ["샌드위치", "센드위치"], ok: "샌드위치", why: "'샌드위치'가 맞아요." },
  { lv: "hard", q: "___로 숙제했어.", opts: ["컴퓨터", "콤퓨터"], ok: "컴퓨터", why: "'컴퓨터'가 맞아요." },
];
/* ── 이번 주 집중 (2026-11-16 주): <11급> 6. 문장을 읽고 써요, 10문장 ──
   사진 속 받아쓰기 문장을 2지선다로 만든 것. 원문:
   1 옷 놀이 / 2 꽃 향기를 맡습니다. / 3 소방관의 부탁 / 4 차를 대면 안 되는 곳 /
   5 괜찮아 아저씨 / 6 "오, 괜찮은데?" / 7 숫자를 세었어요. / 8 낮잠을 자는데 /
   9 세 개씩 묶었어요. / 10 머리카락을 땋았어요.
   2026-11-22(일)까지는 배틀 문제 3개 중 2개꼴로 여기서 먼저 낸다. 기간이 지나면
   자동으로 일반 문제만 나온다. */
const PR_SPELL_FOCUS_UNTIL = "2026-11-22";
const PR_SPELL_FOCUS = [
  { lv: "focus", q: "___ 놀이를 했어.", opts: ["옷", "옫"], ok: "옷", why: "'옷'이 맞아요. 받침은 ㅅ이에요." },
  { lv: "focus", q: "꽃 향기를 ___.", opts: ["맡습니다", "맏습니다"], ok: "맡습니다", why: "'맡다'가 맞아요. 꽃 냄새를 맡는 거예요." },
  { lv: "focus", q: "소방관의 ___.", opts: ["부탁", "부탇"], ok: "부탁", why: "'부탁'이 맞아요. 받침은 ㄱ이에요." },
  { lv: "focus", q: "차를 ___ 안 되는 곳", opts: ["대면", "되면"], ok: "대면", why: "차를 대는 건 '대다'예요. '되다'가 아니에요." },
  { lv: "focus", q: "___ 아저씨.", opts: ["괜찮아", "괜찬아"], ok: "괜찮아", why: "'괜찮아'가 맞아요. '괜찬아'는 틀린 말이에요." },
  { lv: "focus", q: "오, ___?", opts: ["괜찮은데", "괜찬은데"], ok: "괜찮은데", why: "'괜찮은데'가 맞아요. '괜찬은데'는 틀린 말이에요." },
  { lv: "focus", q: "숫자를 ___.", opts: ["세었어요", "샜어요"], ok: "세었어요", why: "숫자를 헤아리는 건 '세다'예요. '새다'는 물이 새는 거예요." },
  { lv: "focus", q: "___을 자는데", opts: ["낮잠", "낱잠"], ok: "낮잠", why: "'낮잠'이 맞아요. 낮에 자는 잠이에요." },
  { lv: "focus", q: "세 개씩 ___.", opts: ["묶었어요", "묵었어요"], ok: "묶었어요", why: "'묶다'가 맞아요. '묵다'는 다른 말이에요." },
  { lv: "focus", q: "머리카락을 ___.", opts: ["땋았어요", "땄어요"], ok: "땋았어요", why: "머리를 땋는 건 '땋다'예요. '따다'는 다른 말이에요." },
];
function prSpellFocusActive() {
  try {
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    return today <= PR_SPELL_FOCUS_UNTIL;
  } catch (e) { return false; }
}
const PR_SPELL_TIERS = ["D", "C", "B", "A", "S", "SS"];
const PR_SPELL_TIER_HP = { D: 3, C: 3, B: 4, A: 4, S: 5, SS: 6 };
const PR_SPELL_TIER_NAME = { D: "D등급", C: "C등급", B: "B등급", A: "A등급", S: "S등급", SS: "SS등급" };
const PR_SPELL_TIME = 15;   // 문제당 15초 — 시간 초과는 오답
/* 도감번호 → 이름 (pokemon.js POKE_ALL에서 — 계열 목록이 정본) */
const PR_DEX_NAME = {};
if (typeof POKE_ALL !== "undefined") {
  POKE_ALL.forEach((e) => e.chain.forEach((s) => {
    if (Array.isArray(s[0])) s.forEach((f) => { PR_DEX_NAME[f[0]] = f[1]; });
    else PR_DEX_NAME[s[0]] = s[1];
  }));
}
let PR_SPELL_TIER_DEX = null;
function prSpellTierDex(tier) {
  if (!PR_SPELL_TIER_DEX) {
    PR_SPELL_TIER_DEX = { D: [], C: [], B: [], A: [], S: [], SS: [] };
    if (typeof POKE_BST !== "undefined") for (const d of Object.keys(POKE_BST)) PR_SPELL_TIER_DEX[pokeTier(+d)].push(+d);
  }
  return PR_SPELL_TIER_DEX[tier] || [];
}
/* 스테이지 → 상대 등급: 1 D · 2 C · 3 B · 4 A · 5 S · 6 SS, 7단계부터는 S/SS 번갈아 (끝없는 도전) */
function prSpellEnemy(stage) {
  const tier = stage <= 6 ? PR_SPELL_TIERS[stage - 1] : (stage % 2 === 1 ? "S" : "SS");
  const list = prSpellTierDex(tier);
  const dex = list.length ? list[Math.floor(Math.random() * list.length)] : 25;
  return { dex, name: PR_DEX_NAME[dex] || "???", tier, hp: PR_SPELL_TIER_HP[tier], maxHp: PR_SPELL_TIER_HP[tier] };
}
/* 내 몬스터 = 내가 가진 포켓몬
   아이: pokeState의 cur(지금 키우는 동료) — 알이면 🥚 / 아빠: 아빠/포켓몬-동료.json의 companion
   엄마: 키우는 포켓몬이 없어서 피카츄가 함께 싸운다 */
function prMyMonster() {
  if (prName === "아빠") {
    const d = (typeof lastData !== "undefined" && lastData && lastData.dadCompanion) || null;
    const c = d && d.companion;
    if (c && c.dex) return { dex: +c.dex, name: c.ko || "아빠 포켓몬", egg: false };
    return { dex: 0, name: "알", egg: true };
  }
  if (prName === "엄마") return { dex: 25, name: "피카츄", egg: false };
  try {
    const st = pokeState(prName, ((typeof lastData !== "undefined" && lastData && lastData.pokeCounts) || {})[prName] || 0);
    if (st && st.cur) return { dex: st.cur[0], name: st.cur[1], egg: false };
  } catch (e) { /* 못 읽으면 알로 */ }
  return { dex: 0, name: "알", egg: true };
}
/* 맞춤법 배틀에 내보낼 포켓몬 후보 — 동산에 있는 포켓몬 + 지금 키우는 동료 (알은 제외)
   아이: pokeState().garden(졸업·찾아옴) + cur(알/null이면 제외) / 아빠: companion + pokedex(졸업한 동료)
   엄마: 키우는 포켓몬도 동산도 없어서 빈 목록 → 피카츄 고정으로 시작한다 */
function prSpellChoices() {
  const list = [];
  const seen = new Set();
  const add = (dex, name, tag, isCur) => {
    dex = +dex;
    if (!dex || seen.has(dex)) return;
    seen.add(dex);
    list.push({ dex, name: name || PR_DEX_NAME[dex] || "???", tag, isCur: !!isCur, egg: false });
  };
  if (prName === "아빠") {
    const d = (typeof lastData !== "undefined" && lastData && lastData.dadCompanion) || null;
    const c = d && d.companion;
    if (c && c.dex) add(c.dex, c.ko, "지금 키우는 중", true);
    if (d && Array.isArray(d.pokedex)) d.pokedex.forEach((p) => add(p.dex, p.ko, "동산", false));
    return list;
  }
  if (prName === "엄마") return list;
  try {
    const st = pokeState(prName, ((typeof lastData !== "undefined" && lastData && lastData.pokeCounts) || {})[prName] || 0);
    if (st) {
      if (st.cur) add(st.cur[0], st.cur[1], "지금 키우는 중", true);
      (st.garden || []).forEach((g) => add(g.dex, g.name, "동산", false));
    }
  } catch (e) { /* 못 읽으면 빈 목록 — 피카츄로 시작한다 */ }
  return list;
}
/* 맞춤법 배틀 들어가기 — 고르기 화면부터 (후보 1개면 바로 시작, 0개면 피카츄 고정) */
function prSpellStart() {
  const choices = prSpellChoices();
  if (choices.length === 0) { prSpellBegin({ dex: 25, name: "피카츄", egg: false }); return; }
  if (choices.length === 1) { prSpellBegin(choices[0]); return; }
  prStopAll();
  prSpell = null;
  prScreen = "spell";
  const curI = choices.findIndex((c) => c.isCur);
  prSpellPick = { choices, picked: curI >= 0 ? curI : 0 };
  prSpellRenderPick();
}
/* 고른 포켓몬으로 배틀 시작 (선택은 이번 판만 — 다음에 들어오면 다시 고른다) */
function prSpellBegin(mon) {
  prStopAll();
  const startStage = prIsAdult(prName) ? prSpellRec(prName).stage : 1;   // 어른은 저장된 단계(최소 3단계·B)부터, 아이는 1단계(D)부터
  prSpell = { stage: startStage, score: 0, hearts: 3, defeated: 0, over: false, result: false, saved: false, master: false,
    streak: 0, levelPop: false, levelUpPending: false,
    myMon: mon || prMyMonster(), enemy: null, q: null, opts: [], picked: null, time: PR_SPELL_TIME, lock: false, feedback: null, anim: null, used: [], usedFocus: [], qCount: 0, tick: null };
  prScreen = "spell";
  prPlayStart();
  prSpellNextEnemy();
  prSpellNextQuestion();   // 다음 문제가 타이머(1초 간격 틱)도 함께 시작한다
}
/* 내 포켓몬 고르기 화면 (모달) — 스프라이트+이름+등급 배지, 기본 선택은 지금 키우는 동료 */
function prSpellRenderPick() {
  const p = prSpellPick;
  if (!p) return;
  const cards = p.choices.map((c, i) => `<button type="button" class="pr-spell-pick-card${i === p.picked ? " sel" : ""}" data-pr="spell-pick" data-i="${i}">
      <img class="pr-spell-sprite" src="${POKE_SPRITE(c.dex)}" alt="${escapeHtml(c.name)}">
      <div class="pr-spell-name">${escapeHtml(c.name)} ${pokeTierBadge(c.dex)}</div>
      <div class="pr-spell-sub">${c.tag}</div></button>`).join("");
  prModalShow(`${prHead("✏️ 맞춤법 몬스터 배틀", `${escapeHtml(prName)} — 누구와 함께 싸울까요?`)}
    <p class="pr-note" style="text-align:center">내 포켓몬을 골라요! 알은 아직 싸울 수 없어서 목록에 안 나와요.</p>
    <div class="pr-spell-pick">${cards}</div>
    <div class="pr-result-btns"><button type="button" class="pr-btn" data-pr="spell-go">⚔️ 출발!</button>
      <button type="button" class="pr-btn soft" data-pr="back-lobby">놀이방으로</button></div>`);
}
function prSpellNextEnemy() { prSpell.enemy = prSpellEnemy(prSpell.stage); }
function prSpellQuestion(lv) {
  let pool = PR_SPELL_BANK.filter((q) => q.lv === lv && !prSpell.used.includes(q));
  if (!pool.length) {   // 그 난이도 문제를 다 썼으면 다시 섞는다
    prSpell.used = prSpell.used.filter((q) => q.lv !== lv);
    pool = PR_SPELL_BANK.filter((q) => q.lv === lv);
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  prSpell.used.push(q);
  return q;
}
function prSpellFocusQuestion() {
  let pool = PR_SPELL_FOCUS.filter((q) => !prSpell.usedFocus.includes(q));
  if (!pool.length) {   // 집중 10개를 다 썼으면 다시 섞는다
    prSpell.usedFocus = [];
    pool = PR_SPELL_FOCUS.slice();
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  prSpell.usedFocus.push(q);
  return q;
}
function prSpellNextQuestion() {
  const g = prSpell;
  g.qCount = (g.qCount || 0) + 1;
  // 이번 주 집중 기간에는 3문제 중 2문제(1·2번째)는 집중 문제, 3번째는 일반 문제
  if (prSpellFocusActive() && (g.qCount % 3 !== 0)) g.q = prSpellFocusQuestion();
  else {
    const lv = g.stage <= 2 ? "easy" : g.stage <= 4 ? "med" : "hard";
    g.q = prSpellQuestion(lv);
  }
  g.opts = [...g.q.opts].sort(() => Math.random() - 0.5);   // 선택지 순서도 매번 섞는다
  g.picked = null;
  g.time = PR_SPELL_TIME;
  g.lock = false;
  g.feedback = null;
  prSpellStartTick();   // 이 문제의 타이머 시작 (1초마다)
  prSpellRender();
}
/* 맞춤법 타이머: 문제는 살아있을 때만 돈다 — 답을 고른 순간 멈추고, 다음 문제가 시작될 때 다시 돈다 */
function prSpellStartTick() {
  const g = prSpell;
  if (!g) return;
  prSpellStopTick();
  g.tick = prTimer(() => prSpellTick(), 1000);
}
function prSpellStopTick() {
  const g = prSpell;
  if (g && g.tick != null) { try { clearInterval(g.tick); } catch (e) {} g.tick = null; }
}
function prSpellTick() {
  const g = prSpell;
  if (!g || g.over || g.lock || prPaused || g.levelPop) return;   // 레벨업 팝업 떠 있는 동안 타이머도 멈춤
  g.time -= 1;
  const t = document.querySelector(".pr-spell-time");
  if (t) { t.textContent = `⏱️ ${g.time}초`; t.classList.toggle("urgent", g.time <= 5); }
  const bar = document.querySelector(".pr-spell-timebar i");
  if (bar) bar.style.width = Math.max(0, (g.time / PR_SPELL_TIME) * 100) + "%";
  if (g.time <= 0) prSpellAnswer(null);   // 시간 초과 = 오답
}
/* 정답을 누른 뒤 1.7초 보여주고 다음으로 — 토큰 팝업·레벨업 팝업 떠 있는 동안은 기다린다 */
function prSpellLater(fn) {
  const go = () => {
    if (!prSpell) return;
    if (prPaused || prSpell.levelPop) { prTimeout(go, 500); return; }
    fn();
  };
  prTimeout(go, 1700);
}
function prSpellAnswer(choice) {
  const g = prSpell;
  if (!g || g.over || g.lock || prPaused || g.levelPop || !g.q) return;
  g.lock = true;
  prSpellStopTick();   // 답을 고른 순간 타이머 멈춤 — 피드백 표시 중에는 시간 초과가 나지 않는다
  g.picked = choice;
  if (choice !== null && choice === g.q.ok) {
    g.score += 10;
    g.streak += 1;   // 연속 정답 — 오답·시간 초과면 0으로 돌아간다
    g.enemy.hp -= 1;
    g.anim = "myAtk";
    /* 10연속(20·30…연속도 포함) 달성: 그날 처음이면 레벨업, 이미 했으면 작은 축하 표시만 */
    let streakNote = "";
    if (g.streak > 0 && g.streak % 10 === 0) {
      const rec = prSpellRec(prName);
      if (rec.levelUpDate !== prTodayStr()) {
        g.score += 50;   // 레벨업 보너스
        g.levelUpPending = true;
        prSave("spell", { level: (rec.level || 1) + 1, levelUpDate: prTodayStr() });
      } else {
        streakNote = ` 🔥 ${g.streak}연속 달성!`;
      }
    }
    g.feedback = { ok: true, text: `⭕ 정답! ${g.q.why}${streakNote}` };
    prBeep(990, 0.08);
    prSfx("hit");   // 내 포켓몬 공격 타격음
    prSpellRender();
    prSpellLater(() => {
      const gg = prSpell;
      if (!gg || gg.over) return;
      gg.anim = null;
      if (gg.levelUpPending) { prSpellShowLevelUp(); return; }   // 레벨업 팝업부터, 닫으면 이어진다
      if (gg.enemy.hp <= 0) prSpellDefeated();
      else prSpellNextQuestion();
    });
  } else {
    g.streak = 0;   // 연속 끊김
    g.hearts -= 1;
    g.anim = "enemyAtk";
    const timeout = choice === null;
    g.feedback = { ok: false, text: `${timeout ? "⏰ 시간 초과!" : "❌ 아쉬워요!"} 정답은 '${g.q.ok}'예요. ${g.q.why}` };
    prBeep(180, 0.15);
    prSfx("hurt");   // 상대 공격 둔탁한 맞는 소리
    prSpellRender();
    prSpellLater(() => {
      const gg = prSpell;
      if (!gg || gg.over) return;
      gg.anim = null;
      if (gg.hearts <= 0) prSpellGameOver();
      else prSpellNextQuestion();
    });
  }
}
/* 레벨업 팝업 — 왜 레벨업했는지 이유를 보여주고 배틀을 잠깐 멈춘다 (타이머 포함) */
function prSpellShowLevelUp() {
  const g = prSpell;
  if (!g) return;
  g.levelPop = true;
  g.levelUpPending = false;
  const lv = prSpellRec(prName).level || 1;
  prSfx("fanfare");   // 올라가는 팡파레
  const old = document.querySelector(".pr-level-pop");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "pr-level-pop";
  el.innerHTML = `<div class="pr-token-card pr-level-card"><div class="pr-token-big">🎉 레벨업!</div>
    <p>🔥 <b>10문제</b>를 연속으로 맞혔어요!<br>${prJosa(escapeHtml(g.myMon.name), "이", "가")} <b>Lv.${lv}</b>가 됐어요.<br>보너스 <b>+50점</b>!</p>
    <button type="button" class="pr-btn" data-pr="spell-level-continue">계속하기</button></div>`;
  document.body.appendChild(el);
}
/* 레벨업 팝업 "계속하기" — 팝업을 닫고 멈췄던 배틀(처치 or 다음 문제)을 이어간다 */
function prSpellLevelClose() {
  const old = document.querySelector(".pr-level-pop");
  if (old) old.remove();
  const g = prSpell;
  if (!g) return;
  g.levelPop = false;
  if (g.over || g.result || prScreen !== "spell") return;   // 이미 끝났거나 나갔으면 이어가지 않는다
  if (g.enemy.hp <= 0) prSpellDefeated();
  else prSpellNextQuestion();
}
function prSpellDefeated() {
  const g = prSpell;
  const wasSix = g.stage === 6;
  g.defeated += 1;
  g.score += 30;
  if (wasSix) g.master = true;   // 6단계(SS)를 깨면 맞춤법 박사!
  g.stage += 1;
  g.feedback = { ok: true, text: `💥 ${prJosa(g.enemy.name, "을", "를")} 물리쳤어요! +30점! ${wasSix ? "🏆 맞춤법 박사!" : "다음 상대가 나타났어요!"}` };
  g.anim = "win";
  prBeep(880, 0.12); prTimeout(() => prBeep(1174, 0.2), 140);
  prSfx("ko");   // 처치 KO 하강음
  prSpellRender();
  prSpellLater(() => {
    const gg = prSpell;
    if (!gg || gg.over) return;
    gg.anim = null;
    prSpellNextEnemy();
    prSpellNextQuestion();
  });
}
/* 맞춤법 배틀 기록 저장: 지금까지 간 단계·최고 점수·처치한 몬스터 수 (한 번만)
   레벨·레벨업 날짜도 함께 다시 적어서, 레벨업 당시 저장이 실패했어도 끝날 때 서버에 남는다 */
function prSpellSave() {
  const g = prSpell;
  if (!g || !prName || g.saved) return;
  g.saved = true;
  const rec = prSpellRec(prName);
  prSave("spell", { stage: Math.max(rec.stage, g.stage), best: Math.max(rec.best, g.score), clears: rec.clears + g.defeated, level: rec.level, levelUpDate: rec.levelUpDate });
}
function prSpellGameOver() {
  const g = prSpell;
  if (!g || g.over) return;
  g.over = true;
  prSpellSave();
  prStopAll();
  g.result = true;
  prBeep(220, 0.3);
  prSpellRender();
}
function prSpellRender() {
  const g = prSpell;
  if (!g) return;
  const rec = prSpellRec(prName);
  if (g.result) {
    prModalShow(`${prHead("✏️ 맞춤법 몬스터 배틀", `${escapeHtml(prName)} · 내 포켓몬이 맞춤법으로 싸워요!`)}
      <div class="pr-result ${g.master ? "win" : ""}"><div class="pr-result-big">${g.master ? "🏆 맞춤법 박사!" : "💥 게임 오버!"}</div>
      <p>${g.stage}단계까지 갔어요 · ${g.score}점 · 몬스터 ${g.defeated}마리 처치</p>
      <p>최고 기록: ${Math.max(rec.best, g.score)}점 · 최고 단계: ${Math.max(rec.stage, g.stage)}단계 · 레벨 Lv.${rec.level}</p>
      ${g.master ? "<p>🏆 <b>6단계를 모두 깼어요! 맞춤법 박사예요!</b></p>" : ""}
      <div class="pr-result-btns">
        <button type="button" class="pr-btn" data-pr="spell-retry">다시 하기</button>
        <button type="button" class="pr-btn soft" data-pr="back-lobby">놀이방으로</button></div></div>`);
    return;
  }
  const e = g.enemy, m = g.myMon;
  const myImg = m.egg ? `<span class="pr-spell-egg">🥚</span>` : `<img class="pr-spell-sprite" src="${POKE_SPRITE(m.dex)}" alt="${escapeHtml(m.name)}">`;
  const eImg = `<img class="pr-spell-sprite" src="${POKE_SPRITE(e.dex)}" alt="${escapeHtml(e.name)}">`;
  prModalShow(`${prHead("✏️ 맞춤법 몬스터 배틀", `${escapeHtml(prName)}의 ${escapeHtml(m.name)} vs ${PR_SPELL_TIER_NAME[e.tier]} ${escapeHtml(e.name)}`)}
    <div class="pr-hud"><span>🗺️ ${g.stage}단계</span><span>⭐ ${g.score}점</span>${g.streak >= 1 ? `<span>🔥 ${g.streak}연속</span>` : ""}<span class="pr-spell-hearts">${"❤️".repeat(g.hearts)}${"🖤".repeat(3 - g.hearts)}</span><span>최고 ${rec.best}점</span></div>
    <div class="pr-spell-arena">
      <div class="pr-spell-side mine${g.anim === "myAtk" ? " atk" : ""}${g.anim === "enemyAtk" ? " hit" : ""}">
        ${myImg}<div class="pr-spell-name">${escapeHtml(m.name)}${m.egg ? " (알)" : ""}</div><div class="pr-spell-sub">내 포켓몬</div></div>
      <div class="pr-spell-vs">⚔️</div>
      <div class="pr-spell-side foe${g.anim === "myAtk" ? " hit" : ""}${g.anim === "enemyAtk" ? " atk" : ""}">
        ${eImg}<div class="pr-spell-name">${escapeHtml(e.name)} ${pokeTierBadge(e.dex)}</div>
        <div class="pr-spell-hpbar"><i style="width:${(e.hp / e.maxHp) * 100}%"></i></div><div class="pr-spell-sub">❤️ ${e.hp}/${e.maxHp}</div></div>
    </div>
    ${g.q && g.q.lv === "focus" ? `<p class="pr-note" style="text-align:center">📚 이번 주 집중 문제 · 11급 6번 '문장을 읽고 써요'</p>` : ""}
    <div class="pr-spell-q">${escapeHtml(g.q.q).replace("___", "<b class=\"pr-spell-blank\">___</b>")}</div>
    <div class="pr-spell-timer"><span class="pr-spell-time">⏱️ ${g.time}초</span><div class="pr-spell-timebar"><i style="width:${(g.time / PR_SPELL_TIME) * 100}%"></i></div></div>
    <div class="pr-spell-opts">${g.opts.map((o) => `<button type="button" class="pr-spell-opt${g.lock ? (o === g.q.ok ? " correct" : (o === g.picked ? " wrong" : "")) : ""}" data-pr="spell-answer" data-a="${escapeHtml(o)}" ${g.lock ? "disabled" : ""}>${escapeHtml(o)}</button>`).join("")}</div>
    ${g.feedback ? `<p class="pr-spell-feedback ${g.feedback.ok ? "good" : "bad"}">${g.feedback.text}</p>` : `<p class="pr-spell-feedback">💡 맞는 맞춤법을 골라요! 맞추면 내 포켓몬이 공격해요.</p>`}
    <p class="pr-note">💡 문제는 15초 안에 골라야 해요. 시간 초과하면 상대가 공격해요!</p>`);
}

/* ── 클릭 (위임) ── */
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-pr]");
  if (!el) return;
  const act = el.dataset.pr;
  if (act === "token-continue") {
    prTokenClose();
  } else if (act === "pick-name") {
    prName = el.dataset.name;
    try { localStorage.setItem(PR_NAME_KEY, prName); } catch (e) {}
    prScreen = "lobby"; prBeep(880, 0.1);
    renderPlayroom(lastData);
  } else if (act === "change-name") {
    prStopAll(); prScreen = "picker"; renderPlayroom(lastData);
  } else if (act === "back-lobby") {
    prStopAll(); prScreen = "lobby"; renderPlayroom(lastData);
  } else if (act === "back-picker") {
    prStopAll(); prScreen = "picker"; renderPlayroom(lastData);
  } else if (act === "open-ranking") {
    prScreen = "ranking"; prBeep(880, 0.1);
    renderPlayroom(lastData);
  } else if (act === "open-number") {
    prNumStart(prNumRec(prName).target);
  } else if (act === "num-balloon") {
    prNumClick(el.dataset.id);
  } else if (act === "num-retry") {
    prNumStart(prNum ? prNum.target : prNumRec(prName).target);
  } else if (act === "num-next") {
    prNumStart(Math.min((prNum ? prNum.target : prNumRec(prName).target) + prNumStep(prName), 1000));
  } else if (act === "open-robot") {
    prRobotStart(1);
  } else if (act === "robot-stage") {
    prRobotStart(+el.dataset.stage);
  } else if (act === "robot-cmd") {
    const g = prRobot;
    if (g && !g.running && g.cmds.length < 30) { g.cmds.push(el.dataset.cmd); prBeep(660, 0.05); prRobotRender(); }
  } else if (act === "robot-del") {
    const g = prRobot;
    if (g && !g.running) { g.cmds.splice(+el.dataset.i, 1); prRobotRender(); }
  } else if (act === "robot-clear") {
    const g = prRobot;
    if (g && !g.running) { g.cmds = []; prRobotRender(); }
  } else if (act === "robot-reset") {
    if (prRobot) prRobotStart(prRobot.stage);
  } else if (act === "robot-run") {
    prRobotRun();
  } else if (act === "robot-retry") {
    if (prRobot) prRobotStart(prRobot.stage);
  } else if (act === "robot-next") {
    if (prRobot) prRobotStart(Math.min(PR_ROBOT_STAGES.length, prRobot.stage + 1));
  } else if (act === "open-space") {
    prSpaceStart();
  } else if (act === "open-spell") {
    prSpellStart();
  } else if (act === "open-race-common") {
    prRaceStart(true);   // 이름 선택 아래 공통 게임에서: 인원 선택부터 시작한다
  } else if (act === "race-count") {
    prRacePickCount(+el.dataset.n);
  } else if (act === "space-key") {
    prSpaceFire(+el.dataset.k);
  } else if (act === "space-retry") {
    prSpaceStart();
  } else if (act === "spell-answer") {
    prSpellAnswer(el.dataset.a);
  } else if (act === "spell-retry") {
    prSpellStart();
  } else if (act === "spell-level-continue") {
    prSpellLevelClose();   // 레벨업 팝업 닫고 배틀 이어가기
  } else if (act === "spell-pick") {
    if (prSpellPick) { prSpellPick.picked = +el.dataset.i; prBeep(660, 0.05); prSpellRenderPick(); }
  } else if (act === "spell-go") {
    if (prSpellPick) { const mon = prSpellPick.choices[prSpellPick.picked]; prSpellBegin(mon); }
  } else if (act === "race-start") {
    prRaceGo();
  } else if (act === "race-retry") {
    prRaceStart(prRace && prRace.fromPicker, prRace ? prRace.count : 0);   // 같은 인원으로 새 랜덤 이름으로 바로 다시 경주
  } else if (act === "race-recount") {
    prRaceStart(prRace && prRace.fromPicker);   // 인원 선택부터 다시
  }
});

/* 말 이름 바꾸기 — 레인 이름 입력창에 직접 쓴다 (출발 전만). 비워두면 원래 이름으로 돌아간다 */
function prRaceRenameInput(el, restoreEmpty) {
  const g = prRace;
  if (!g || g.started) return;
  const hi = +el.dataset.lane;
  const h = g.horses && g.horses[hi];
  if (!h) return;
  const v = (el.value || "").trim();
  if (v) {
    h.name = v;
    const lane = el.closest(".pr-lane");
    const horseEl = lane && lane.querySelector(".pr-horse");
    if (horseEl) horseEl.dataset.name = v;
  } else if (restoreEmpty) {
    el.value = h.name;
  }
}
document.addEventListener("input", (ev) => {
  const el = ev.target && ev.target.closest ? ev.target.closest(".pr-race-name-input") : null;
  if (el) prRaceRenameInput(el, false);
});
document.addEventListener("focusout", (ev) => {
  const el = ev.target && ev.target.closest ? ev.target.closest(".pr-race-name-input") : null;
  if (el) prRaceRenameInput(el, true);
});
