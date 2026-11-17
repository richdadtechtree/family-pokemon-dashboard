/* 가족 대시보드 — 8. 시작 + 주기적 새로고침 + 화면 맞춤 + 코드 바뀌면 새로고침
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* ════════════════════════════════════════════════════════════════
   8. 시작 + 주기적 새로고침
   ════════════════════════════════════════════════════════════════ */
let lastDay = ymd(new Date());
let lastWikiAt = null;
// 위키 일정표 시간 칸 "17:30-21:00" → [시작분, 끝분]. 범위가 아니면 null
function parseTimeRange(t) {
  const m = String(t || "").match(/^\s*(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const s = +m[1] * 60 + +m[2], e = +m[3] * 60 + +m[4];
  if (+m[1] > 23 || +m[3] > 23 || +m[2] > 59 || +m[4] > 59 || e <= s) return null;
  return [s, e];
}
// 위키 일정표에 시간 범위로 적힌 일정(예: 17:30-21:00 필라테스)도 '지금' 카드가 읽는다.
// 캘린더 일정이 data.cal에 먼저 들어가므로 겹치면 캘린더가 이긴다.
function mergeWikiTimed(data) {
  for (const e of data.events || []) {
    if (e.cal || e.yearly) continue;
    const range = parseTimeRange(e.time);
    if (!range) continue;
    const d = parseYMD(e.date);
    if (!d) continue;
    const [s, en] = range;
    const at = (mins) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(mins / 60), mins % 60);
    data.cal.push({ start: at(s), end: at(en), allDay: false, title: e.title, who: e.who, whos: e.whos || [e.who], rest: e.title, explicit: true, src: "wiki" });
  }
}
function mergeCalendar(data, ics) {
  data.cal = [];
  if (!ics || !window.CalendarICS) { mergeWikiTimed(data); return; }
  const today = startOfDay(new Date());
  const names = ["아빠", "엄마", "가족", ...data.kids.map((k) => k.name)];
  let list = [];
  try { list = CalendarICS.expand(CalendarICS.parse(ics), addDays(today, -7 * (CONFIG.calendarWeeks + 1)), addDays(today, 7 * (CONFIG.calendarAheadWeeks + 1))); }
  catch (e) { calState = "읽기 오류"; return; }
  // 위키 생일(해마다)과 같은 날·같은 제목인 캘린더 일정은 건너뛴다 (캘린더에도 생일을 넣어 두었으므로 두 번 보이지 않게)
  const wikiDays = new Set(data.events.filter((e) => e.yearly).map((e) => `${e.date}|${e.title}`));
  const lunar = new Set(data.lunarTitles || []);
  for (const ev of list) {
    const w = splitWho(ev.title, names);
    const item = { ...ev, ...w };
    data.cal.push(item);
    const label = w.explicit && w.who !== "가족" ? `${w.whos.join("·")} ${w.rest}` : w.rest;
    const extra = { whos: w.whos, rest: w.rest };
    if (ev.allDay && lunar.has(ev.title.trim())) {
      // 위키의 음력 생신 → 캘린더에 넣어 둔 그해 양력 날짜를 위키 생일처럼 쓴다 ('다가오는 날'에도 나온다)
      for (let d = startOfDay(ev.start); d < ev.end; d = addDays(d, 1)) data.events.push({ date: ymd(d), time: "종일", title: ev.title.trim(), who: "가족", yearly: true, lunar: true });
      continue;
    }
    if (ev.allDay && wikiDays.has(`${ymd(startOfDay(ev.start))}|${ev.title.trim()}`)) continue;
    if (ev.allDay) {
      for (let d = startOfDay(ev.start); d < ev.end; d = addDays(d, 1)) data.events.push({ date: ymd(d), time: "종일", title: label, who: w.who, cal: true, ...extra });
    } else {
      data.events.push({ date: ymd(ev.start), time: `${pad(ev.start.getHours())}:${pad(ev.start.getMinutes())}`, title: label, who: w.who, cal: true, ...extra });
    }
  }
  mergeWikiTimed(data);
}
// 패드에서 끌어도 화면이 밀리지 않게: 그림·글자 끌기 막기, 아이패드 두 손가락 확대(gesture) 막기 (나머지는 style.css touch-action)
// PC에선 글자 끌기(입력칸 글자 옮기기 등)를 막지 않는다 — 그림만. 확대 막기(gesture)는 아이패드 사파리에만 있는 이벤트
document.addEventListener("dragstart", (e) => { if (e.target && e.target.tagName === "IMG") e.preventDefault(); });
["gesturestart", "gesturechange"].forEach((n) => document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
async function refreshWiki() {
  loadSettings();                                   // 소리·저녁 음악 설정(서버 공통)도 함께 다시 읽는다
  if (typeof loadTrades === "function") await loadTrades();   // 10-4. 기다리는 교환(동산·엄마·아빠 메뉴에 보임)
  const [{ files, missing }, ics] = await Promise.all([loadWiki(), loadCalendar(), loadHolidays()]);
  // 서버가 다시 켜지는 몇 초(배포 때) 등으로 꼭 있어야 할 문서를 못 받았으면, 텅 빈 화면으로 깜박이지 않게 직전 화면을 두고 15초 뒤 다시
  if (!DEMO && lastData && (missing.includes(FILES.family) || missing.includes(FILES.pokeLog))) {
    clearTimeout(refreshWiki.retry);
    refreshWiki.retry = setTimeout(refreshWiki, 15000);
    return;
  }
  const data = buildData(files);
  recordEggs(data);
  mergeCalendar(data, ics);
  renderCalendar(data); renderTrip(data); renderDays(data); renderTodos(data); renderPets(data); renderGarden(data);
  renderUpcoming(data);
  lastData = data; renderNow(data); applyView(data);
  lastWikiAt = new Date();
  const n = $("notice");
  if (DEMO) {
    n.hidden = false;
    n.innerHTML = `<span class="badge-demo">예시</span> 지금은 <b>예시 데이터</b>로 보여 주는 화면이에요. 주소 끝의 <code>?demo</code>를 지우면 우리 위키 내용이 나와요.`;
  } else if (missing.length === Object.keys(FILES).length) {
    n.hidden = false;
    n.innerHTML = `⚠️ 위키 문서를 읽지 못했어요. 파일을 더블클릭해서 열면 브라우저가 막아요 — README의 <b>“대시보드 여는 법”</b>대로 열어 주세요.
      <a href="?demo">예시 화면 먼저 보기</a>`;
  } else {
    n.hidden = !missing.length;
    n.innerHTML = missing.length ? `ℹ️ 아직 없는 위키 문서: ${missing.map(escapeHtml).join(", ")} — 해당 칸은 비어 보여요.` : "";
  }
  renderFooter();
}
let weatherState = "";
async function refreshWeather() {
  try { renderWeather(await loadWeather(), false); weatherState = "Open-Meteo"; }
  catch (e) {
    if (DEMO) { renderWeather(demoWeather(), true); weatherState = "예시"; }
    else { renderWeather(null); weatherState = "받기 실패"; }
  }
  if (lastData) renderNow(lastData);   // 날씨를 받자마자 '아빠는 지금'도 다시 그린다 (비 오는 날 점심 테니스→헬스)
  renderFooter();
}
function renderFooter() {
  const t = lastWikiAt ? `${pad(lastWikiAt.getHours())}:${pad(lastWikiAt.getMinutes())}` : "-";
  $("footer").innerHTML = `<span>위키 읽은 시각 ${t}</span><span>날씨 ${weatherState || "-"}</span><span>구글 캘린더 ${calState || "-"}</span><span>공휴일 ${holState || "-"}</span>
    <span title="Open-Meteo 미세먼지는 유럽 CAMS 예측 모델 값이라 에어코리아 측정소 실측과 다를 수 있어요">미세먼지 등급: 환경부 기준 (모델 예측값)</span>`;
}

// 처음 한 번 그리기
$("brandTitle").innerHTML = escapeHtml(CONFIG.title).replace("\n", "<br>");
// 로고: 픽셀 몬스터볼 (K 테두리·R 빨강·r 빨강 그늘·H 반짝임·W 흰색·w 흰색 그늘)
const BALL = [
  ".....KKKKKK.....",
  "...KKRRRRRRKK...",
  "..KRRRRRRRRRRK..",
  ".KRHHRRRRRRRRrK.",
  ".KRHRRRRRRRRRrK.",
  "KRRRRRRRRRRRRrrK",
  "KRRRRRKKKKRRRrrK",
  "KKKKKKKWWKKKKKKK",
  "KKKKKKKWWKKKKKKK",
  "KWWWWWKKKKWWWwwK",
  "KWWWWWWWWWWWWwwK",
  ".KWWWWWWWWWWWwK.",
  ".KWWWWWWWWWWwwK.",
  "..KwWWWWWWwwwK..",
  "...KKwwwwwwKK...",
  ".....KKKKKK.....",
];
drawPixels($("brandIcon"), BALL, { K: "#26324a", R: "#e5484d", r: "#b9343a", H: "#ffffff", W: "#f6f7fb", w: "#c9cfdb" }, 3);
// 로고 바꾸기: dashboard 폴더에 logo.png 를 넣으면 몬스터볼 대신 그 그림이 나온다
(() => { const im = new Image(); im.onload = () => { im.style.cssText = "width:48px;height:48px;object-fit:contain;image-rendering:pixelated"; $("brandIcon").replaceWith(im); }; im.src = "logo.png"; })();
document.querySelectorAll("[data-cloud]").forEach((c) => {
  drawPixels(c, ["....KKKK....", "..KKWWWWKK..", ".KWWWWWWWWK.", "KWWWWWWWWWWK", ".KKKKKKKKKK."].map((r) => r.replace(/K/g, "W")), { W: "#ffffff" }, 6);
});
tickClock();
refreshWiki();
refreshWeather();
refreshIndices();
checkClaudeLog();

/* 화면 맞춤 — 대시보드 화면이 패드·PC 화면보다 길면 통째로 줄여서 스크롤 없이 다 보이게 한다.
   줄인 만큼 가로 폭을 넓혀 배치하므로 글자가 덜 작아진다. 폰(폭 700 미만)과 아이 화면은 그대로 스크롤. */
function fitScreen() {
  const fit = $("fit"), W = window.innerWidth, H = window.innerHeight;
  // 한 화면 맞춤(스크롤 없이 통째로 줄이기)은 패드(터치 화면)에서만 — PC는 원래 크기로 스크롤(아빠 요청). ?fit 이면 PC에서도 맞춤
  const touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  const on = W >= 700 && (touch || params.has("fit")) && !document.body.classList.contains("kid-mode") && !params.has("nofit");
  const key = `${on}|${W}|${H}|${fit.offsetHeight}`;   // 시계만 바뀐 경우 등은 건너뛴다
  if (key === fitKey) return;
  const cap = Math.min(1, W / 1000);          // 세로 패드도 가로 1000px 배치로 그려서 칸이 비좁지 않게
  let s = cap;
  fit.style.transform = ""; fit.style.width = "";
  if (on) {
    for (let i = 0; i < 6; i++) {             // 폭을 넓히면 높이가 줄어드니 몇 번 맞춰 본다
      fit.style.width = `${W / s}px`;
      fit.style.setProperty("--fit-max", `${1280 / s}px`);
      const next = Math.min(cap, H / fit.offsetHeight);
      if (Math.abs(next - s) < 0.002) { s = Math.min(s, next); break; }
      s = next;
    }
    fit.style.width = `${W / s}px`;
    fit.style.setProperty("--fit-max", `${1280 / s}px`);
    s = Math.min(s, H / fit.offsetHeight);
    if (s < 1) fit.style.transform = `scale(${s})`;
    else { fit.style.width = ""; fit.style.removeProperty("--fit-max"); }
  }
  fitScale = on ? s : 1;
  document.body.classList.toggle("fit-mode", on);
  document.body.style.height = on ? `${H}px` : "";
  fitKey = `${on}|${W}|${H}|${fit.offsetHeight}`;
}
let fitScale = 1, fitTimer = 0, fitKey = "";
const scheduleFit = () => { cancelAnimationFrame(fitTimer); fitTimer = requestAnimationFrame(fitScreen); };
window.addEventListener("resize", scheduleFit);
window.addEventListener("orientationchange", scheduleFit);
window.addEventListener("hashchange", scheduleFit);
document.fonts?.ready.then(scheduleFit);
// 내용(할 일·일정·날씨 등)이 바뀌어 높이가 달라지면 다시 맞춘다
new MutationObserver(scheduleFit).observe($("fit"), { childList: true, subtree: true, characterData: true });
scheduleFit();

setInterval(() => {
  tickClock();
  if (ymd(new Date()) !== lastDay) { lastDay = ymd(new Date()); refreshWiki(); }   // 자정이 지나면 달력·D-day 갱신
}, 1000);
setInterval(refreshWiki, CONFIG.wikiRefreshMin * 60000);
/* 대시보드 코드(index.html·calendar.js·scenes.js·css/·js/)가 바뀌면 화면을 저절로 새로고침한다.
   데이터는 2분마다 다시 읽지만 화면 코드는 새로고침해야 바뀌므로, 거실 패드가 예전 코드로 계속 돌지 않게 */
const CODE_FILES = ["index.html", "calendar.js", "scenes.js", "css/style.css",
  "js/config.js", "js/util.js", "js/wiki.js", "js/pokemon.js", "js/board.js", "js/kid.js", "js/sound.js", "js/effects.js", "js/ladder.js", "js/fx.js", "js/bday.js", "js/countdown.js", "js/growth.js", "js/quiz.js", "js/char.js", "js/dex.js", "js/visit.js", "js/trade.js", "js/meeting.js", "js/ideas.js", "js/frame.js", "js/music.js", "js/actions.js", "js/wxfx.js", "js/weather.js", "js/demo.js", "js/extras.js", "js/playroom.js", "js/main.js"];
let codeStamp = null;
async function codeVersion() {
  const r = await Promise.all(CODE_FILES.map((f) => fetch(f, { method: "HEAD", cache: "no-store" })
    .then((x) => (x.ok ? x.headers.get("Last-Modified") || "" : "")).catch(() => "")));
  return r.join("|");
}
async function checkCodeUpdate() {
  if (DEMO) return;
  const v = await codeVersion();
  if (!v.replace(/\|/g, "")) return;              // 서버에 못 닿았으면 다음에
  if (codeStamp === null) { codeStamp = v; return; }
  // + 창·축하 화면·사다리가 떠 있거나 저녁 음악이 나오는 중이면 기다린다(새로고침하면 유튜브가 끊긴다) — 끄고 나면 1분 안에 새로고침
  if (v !== codeStamp && !document.querySelector(".sheet-bg, .celebrate, .ladder-bg, #musicPanel.playing")) location.reload();
}
checkCodeUpdate();
setInterval(checkCodeUpdate, 60000);
setInterval(refreshWeather, CONFIG.weatherRefreshMin * 60000);
setInterval(refreshIndices, CONFIG.indicesRefreshMin * 60000);
setInterval(() => { if (nowDance && Date.now() < nowDance.until) return; nowIdx++; if (lastData) renderNow(lastData); }, 8000);   // 춤추는 동안은 차례를 넘기지 않는다   // 8초마다 아빠↔엄마 번갈아
