/* 가족 대시보드 — 7-1. 지수 ATH 대비 하락률 · 7-2. Claude 대화 정리 팝업
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 7-1. 지수 ATH 대비 하락률 — serve.py /api/indices (네이버 → KIS → 야후, ATH는 index_ath.py 한 곳) */
const IDX_NAMES = [["KOSPI", "코스피", "kr"], ["KOSDAQ", "코스닥", "kr"], ["S&P", "S&P", "us"], ["NASDAQ", "나스닥", "us"]];
const IDX_SRC = { naver: "네이버", kis: "한국투자증권", yahoo: "야후", "예시": "예시" };
let lastIndices = null;
async function loadIndices() {
  const res = await fetch("/api/indices" + (DEMO ? "?demo=1" : ""), { cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
function renderIndices(j, failed) {
  const el = $("indices");
  if (!j) {
    el.innerHTML = `<div class="empty">${failed ? "지수를 불러오지 못했어요. 잠시 후 다시 시도해요." : "지수 불러오는 중…"}</div>`;
    return;
  }
  const n2 = (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = (v, kind) => (kind === "us" ? `$${n2(v)}` : `${n2(v)} p`);
  const t = new Date(j.as_of_kst);
  const at = isNaN(t) ? "" : `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  const todayHtml = (x, kind) => {
    const tp = x.today_pct == null ? NaN : Number(x.today_pct);
    if (isNaN(tp)) return `<div class="idx-today">오늘 변동 정보 없음</div>`;
    const td = x.today_diff == null ? NaN : Number(x.today_diff);
    const diff = isNaN(td) ? "" : ` (${td >= 0 ? "+" : "-"}${kind === "us" ? "$" : ""}${Math.abs(td).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    return `<div class="idx-today ${tp >= 0 ? "up" : "down"}">오늘 ${tp >= 0 ? "▲" : "▼"} ${tp >= 0 ? "+" : ""}${tp.toFixed(2)}%${diff}</div>`;
  };
  const cards = IDX_NAMES.map(([key, label, kind]) => {
    const x = j.indices && j.indices[key];
    if (!x) return `<div class="idx"><div class="idx-top"><span class="nm">${escapeHtml(label)}</span></div><div class="idx-msg">값 없음</div></div>`;
    const pct = Number(x.decline_pct);
    const src = IDX_SRC[x.source] || x.source || "";
    return `<div class="idx">
      <div class="idx-top"><span class="nm">${escapeHtml(label)}</span><span class="pr">${escapeHtml(fmt(x.price, kind))}</span>
        ${x.new_ath ? `<span class="dc ath">🎉 최고가 경신</span>` : `<span class="dc">${escapeHtml(pct.toFixed(2))}%</span>`}</div>
      ${todayHtml(x, kind)}
      <div class="bar"><i style="width:${x.new_ath ? 0 : Math.min(100, Math.abs(pct)).toFixed(1)}%;background:var(--blue)"></i></div>
      <div class="idx-sub"><span>역대 최고가 ${escapeHtml(fmt(x.ath, kind))}</span><span>기준: ${escapeHtml(src)} · 갱신 ${escapeHtml(at)}${j.stale ? " (지난 값)" : ""}</span></div>
    </div>`;
  }).join("");
  // 오늘 +2% 이상 급등한 지수가 있으면 배너로 크게 보여준다 (1% 단위 단계가 올라갈수록 🎉가 늘어난다)
  const surges = IDX_NAMES.map(([key, label]) => {
    const x = j.indices && j.indices[key];
    const tp = x && x.today_pct != null ? Number(x.today_pct) : NaN;
    return (isNaN(tp) || tp < 2) ? null : { label, pct: tp };
  }).filter(Boolean);
  const maxTier = surges.length ? Math.max(...surges.map((s) => Math.floor(s.pct))) : 0;
  const banner = (!failed && surges.length)
    ? `<div class="idx-surge">${"🎉".repeat(Math.min(3, Math.max(1, maxTier - 1)))} <b>오늘 급등!</b> ${surges.map((s) => `${escapeHtml(s.label)} +${s.pct.toFixed(2)}%`).join(" · ")}</div>`
    : "";
  el.innerHTML = `${banner}<div class="idx-grid">${cards}</div>${failed ? `<div class="idx-msg">지수를 불러오지 못했어요. 잠시 후 다시 시도해요. (위는 직전 값)</div>` : ""}`;
  idxSurgeFloat(failed ? [] : surges);
}

/* 7-1-1. 급등 팡파레 — 오늘 +2% 이상이면 아빠 화면(가족 대시보드 홈)에 컨페티가 터진다.
   2% → 3% → 4%… 1% 단위 단계를 새로 넘을 때마다 다시 터지고, 배너 숫자는 5분마다 새로 받아 보여준다.
   같은 기기·같은 날·같은 단계에서는 한 번만 터진다 (localStorage에 날짜·단계 저장, 아이 화면·예시 화면에서는 안 터진다). */
const IDX_FANFARE_KEY = "idxFanfareSeen";
const idxFanfareSeen = () => { try { return JSON.parse(localStorage.getItem(IDX_FANFARE_KEY) || "{}"); } catch (e) { return {}; } };
const idxFanfareMark = (date, tiers) => { try { localStorage.setItem(IDX_FANFARE_KEY, JSON.stringify({ date, tiers })); } catch (e) { /* 저장 못 해도 배너는 보인다 */ } };
function idxFanfare(surges) {
  if (document.querySelector(".idx-fanfare")) return;   // 이미 터지는 중이면 또 안 터뜨린다
  const ov = document.createElement("div");
  ov.className = "idx-fanfare";
  const em = ["🎉", "🎊", "⭐", "✨", "🎈"];
  let pieces = "";
  for (let i = 0; i < 28; i++) {
    pieces += `<span style="left:${(Math.random() * 100).toFixed(1)}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(2.6 + Math.random() * 1.8).toFixed(2)}s;font-size:${(22 + Math.random() * 22).toFixed(0)}px">${em[i % em.length]}</span>`;
  }
  ov.innerHTML = `<div class="idx-fanfare-pop">🎉 ${surges.map((s) => `${escapeHtml(s.label)} +${s.pct.toFixed(2)}%`).join(" · ")} 급등! 🎉</div>`
    + `<div class="idx-fanfare-sub">오늘 많이 올랐어요!</div>${pieces}`;
  document.body.appendChild(ov);
  ov.addEventListener("click", () => ov.remove());
  setTimeout(() => ov.remove(), 5000);
}
function idxSurgeCheck(j) {
  if (!j || !j.indices || DEMO) return;
  if (typeof currentView === "function" && currentView().kind !== "home") return;   // 아이 화면에서는 안 터진다
  const today = ymd(new Date());
  const seen = idxFanfareSeen();
  const tiers = (seen.date === today && seen.tiers) || {};
  const surges = [];
  let fire = false;
  for (const [key, label] of IDX_NAMES) {
    const x = j.indices[key];
    const pct = x && x.today_pct != null ? Number(x.today_pct) : NaN;
    if (isNaN(pct) || pct < 2) continue;
    const tier = Math.floor(pct);
    surges.push({ label, pct });
    if ((tiers[key] || 0) < tier) { tiers[key] = tier; fire = true; }
  }
  if (!surges.length) return;
  idxFanfareMark(today, tiers);
  if (fire) idxFanfare(surges);
}
/* 7-1-2. 급등 알림을 '아빠는 지금' 화면(가족 대시보드 홈)에 띄워 둔다.
   컨페티는 단계가 올라갈 때만 한 번 터지지만, 이 알림은 급등이 이어지는 동안 계속 떠 있다
   (5분마다 숫자가 갱신된다). 누르면 아래 지수 칸으로 내려간다. 아이 화면·예시 화면에서는 안 보인다. */
function idxSurgeFloat(surges) {
  const show = !DEMO && Array.isArray(surges) && surges.length
    && typeof currentView === "function" && currentView().kind === "home";
  let pill = document.querySelector("#idxSurgeFloat");
  if (!show) { if (pill) pill.remove(); return; }
  const text = `🎉 오늘 급등! ${surges.map((s) => `${s.label} +${s.pct.toFixed(2)}%`).join(" · ")}`;
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "idxSurgeFloat";
    pill.className = "idx-surge-float";
    pill.addEventListener("click", () => { const t = $("indices"); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    document.body.appendChild(pill);
  }
  if (pill.textContent !== text) pill.textContent = text;
}
function idxCurrentSurges() {
  if (!lastIndices || !lastIndices.indices) return [];
  return IDX_NAMES.map(([key, label]) => {
    const x = lastIndices.indices[key];
    const tp = x && x.today_pct != null ? Number(x.today_pct) : NaN;
    return (isNaN(tp) || tp < 2) ? null : { label, pct: tp };
  }).filter(Boolean);
}
window.addEventListener("hashchange", () => idxSurgeFloat(idxCurrentSurges()));

async function refreshIndices() {
  try { lastIndices = await loadIndices(); renderIndices(lastIndices, false); idxSurgeCheck(lastIndices); }
  catch (e) { renderIndices(lastIndices, true); }
}

/* 7-2. Claude Code 대화 자동 정리 결과 팝업 — serve.py /api/claude-log
   C:\scripts\claude_to_obsidian.py 가 매일 21:00 '어제'·'오늘' 두 번 돌며 결과를 남긴다.
   이 기기에서 그날 처음 대시보드를 열 때 딱 한 번, 마지막 실행 결과를 보여 준다.
   - "오늘 이미 봤음"은 이 브라우저의 localStorage 에 날짜로 남긴다(기기마다 따로).
   - 아이 화면(#todo-·#garden-)과 예시 화면(?demo)에서는 띄우지 않는다. */
const CLOG_SEEN_KEY = "claudeLogPopupSeen";   // localStorage 에 저장할 이름
const CLOG_STALE_HOURS = 25;                  // 마지막 실행이 이보다 오래면 "실행되지 않았음" (하루 + 여유 1시간)
const CLOG_BATCH_MIN = 10;                    // 마지막 실행과 10분 안에 기록된 것 = 같은 21:00 실행 묶음
let clogChecking = false;
// localStorage 는 사생활 보호 모드 등에서 오류가 날 수 있어 try 로 감싼다(그때는 매번 뜰 수 있음)
const clogSeenToday = () => { try { return localStorage.getItem(CLOG_SEEN_KEY) === ymd(new Date()); } catch (e) { return false; } };
const clogMarkSeen = () => { try { localStorage.setItem(CLOG_SEEN_KEY, ymd(new Date())); } catch (e) { /* 저장 못 해도 팝업은 닫힌다 */ } };

async function checkClaudeLog() {
  if (DEMO || clogChecking || clogSeenToday()) return;
  if (currentView().kind !== "home") return;    // 아이 화면이면 나중에 대시보드로 돌아올 때 다시 확인
  clogChecking = true;
  try {
    const res = await fetch("/api/claude-log", { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    // 기록 파일이 없으면(스크립트가 없는 서버 등) 조용히 넘어간다. 확인 안 함 표시도 남기지 않는다.
    if (!res.ok || !j.ok || !Array.isArray(j.runs) || !j.runs.length) return;
    if (currentView().kind !== "home" || document.querySelector(".sheet-bg")) return;   // 그사이 다른 창이 열렸으면 다음에
    showClaudeLog(j.runs);
    clogMarkSeen();
  } catch (e) {
    /* 서버에 못 닿았으면 다음에 다시 */
  } finally {
    clogChecking = false;
  }
}

function showClaudeLog(runs) {
  // 1) 가장 최근 실행과 같은 묶음(10분 안)만 고른다 → 보통 '어제분'·'오늘분' 두 줄
  const last = new Date(runs[0].run_at);
  const batch = runs.filter((r) => Math.abs(last - new Date(r.run_at)) <= CLOG_BATCH_MIN * 60000)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));   // 날짜 오래된 것부터
  // 2) 마지막 실행이 너무 오래됐으면 경고
  const hoursAgo = (Date.now() - last) / 3600000;
  const stale = isNaN(hoursAgo) || hoursAgo > CLOG_STALE_HOURS;
  const when = isNaN(last) ? "알 수 없음" : `${last.getMonth() + 1}/${last.getDate()} ${pad(last.getHours())}:${pad(last.getMinutes())}`;
  // 3) 한 줄씩 그리기 — 성공 / 대화 없음 / 실패
  const noteName = (p) => String(p || "").split(/[\\/]/).pop();   // 전체 경로에서 파일 이름만
  const row = (r) => {
    const date = escapeHtml(r.date || "날짜 모름");
    const dry = r.dry_run ? " (점검용 dry-run)" : "";
    if (r.status === "ok") return `<div class="clog-row">✅ <b>${date}</b> 정리 완료${dry}
        <div class="sub">세션 ${Number(r.sessions) || 0}개 · 📝 ${escapeHtml(noteName(r.note_path))}</div></div>`;
    if (r.status === "empty") return `<div class="clog-row">💤 <b>${date}</b> 정리할 대화가 없었음</div>`;
    const err = String(r.error || "오류 내용이 남지 않았어요").slice(0, 400);
    return `<div class="clog-row">❌ <b>${date}</b> 정리 실패
        <div class="err">${escapeHtml(err)}</div></div>`;
  };
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-label="Claude 대화 자동 정리 결과">
      <h3>🤖 Claude 대화 자동 정리</h3>
      ${stale ? `<div class="clog-warn">⚠️ 자동 정리가 실행되지 않았음 — 마지막 실행 ${escapeHtml(when)}
        <div class="hint">작업 스케줄러의 'ClaudeToObsidian' 작업을 확인해 보세요.</div></div>` : ""}
      ${batch.map(row).join("")}
      <div class="hint">마지막 실행: ${escapeHtml(when)}</div>
      <div class="btns"><button type="button" class="ok">확인</button></div></div>`;
  document.body.appendChild(bg);
  // 확인 버튼이나 바깥 어두운 곳을 누르면 닫힌다
  bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest(".ok")) bg.remove(); });
}
// 아이 화면으로 열었다가 대시보드로 돌아오면 그때 확인한다
window.addEventListener("hashchange", checkClaudeLog);

