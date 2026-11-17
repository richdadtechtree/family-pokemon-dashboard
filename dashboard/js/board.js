/* 가족 대시보드 — 6-1~6-8. 대시보드 카드: 시계·달력·여행·오늘내일·+버튼·아빠 동산·할 일·아이·동산·지금·다가오는 날
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* ════════════════════════════════════════════════════════════════
   6. 화면 그리기
   ════════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

/* 6-1. 시계: 1초마다 */
function tickClock() {
  const now = new Date();
  const h = now.getHours();
  $("dateLine").textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}요일`;
  $("ampm").textContent = h < 12 ? "오전" : "오후";
  $("hh").textContent = String(h % 12 === 0 ? 12 : h % 12);
  $("mm").textContent = pad(now.getMinutes());
  $("colon").classList.toggle("off", now.getSeconds() % 2 === 1);
}

/* 6-2. 달력: 이번 주부터 N주. 칸마다 일정 이름을 색 띠로, 여러 날 이어지는 종일 일정은 막대로 */
const timeKey = (e) => (e.yearly ? "0" : e.time === "종일" || !e.time ? "1" : "2" + e.time);
let calByDate = {};
let calPage = 0, calResetTimer = 0;   // 0 = 이번 주부터, 1 = 그다음 3주 …, -1 = 지난 3주
const CAL_MIN = -1, calMax = () => Math.max(0, Math.floor(CONFIG.calendarAheadWeeks / CONFIG.calendarWeeks) - 1);
function calGo(page) {
  calPage = page === 0 ? 0 : Math.max(CAL_MIN, Math.min(calMax(), calPage + page));
  clearTimeout(calResetTimer);
  if (calPage !== 0) calResetTimer = setTimeout(() => calGo(0), CONFIG.calendarResetSec * 1000);
  if (lastData) renderCalendar(lastData);
}
function calTitle(today, start, end) {
  const a = calPage === 0 ? today : start, b = addDays(end, -1);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getFullYear()}년 ${a.getMonth() + 1}월`;
  return a.getFullYear() === b.getFullYear()
    ? `${a.getFullYear()}년 ${a.getMonth() + 1}월<small>~ ${b.getMonth() + 1}월</small>`
    : `${a.getFullYear()}년 ${a.getMonth() + 1}월<small>~ ${b.getFullYear()}년 ${b.getMonth() + 1}월</small>`;
}
function renderCalendar(data) {
  const today = startOfDay(new Date());
  const start = addDays(today, -today.getDay() + 7 * CONFIG.calendarWeeks * calPage);
  const end = addDays(start, 7 * CONFIG.calendarWeeks);
  const inView = data.events.filter((e) => { const d = parseYMD(e.date); return d && d >= start && d < end; });
  calByDate = {};
  for (const e of inView) (calByDate[e.date] ||= []).push(e);
  for (const k in calByDate) calByDate[k].sort((a, b) => timeKey(a).localeCompare(timeKey(b)));

  // 같은 이름·사람의 종일 일정이 이틀 넘게 이어지면 한 덩어리(막대)로
  const runs = [];
  const groups = {};
  for (const e of data.events) if (!e.yearly && e.time === "종일") (groups[`${e.who}|${e.title}`] ||= []).push(e);
  for (const list of Object.values(groups)) {
    const ds = [...new Set(list.map((e) => e.date))].sort().map(parseYMD);
    let run = null;
    for (const d of ds) {
      if (run && daysBetween(run.to, d) === 1) run.to = d;
      else runs.push(run = { from: d, to: d, title: list[0].title, who: list[0].who });
    }
  }
  const spans = runs.filter((r) => r.to > r.from && r.to >= start && r.from < end);
  const inSpan = (e) => e.time === "종일" && !e.yearly &&
    spans.some((r) => r.title === e.title && r.who === e.who && parseYMD(e.date) >= r.from && parseYMD(e.date) <= r.to);

  const people = [...new Set(inView.map((e) => e.who))];
  let html = `<div class="cal-head"><div class="cal-nav">
      <button data-cal="-1" ${calPage <= CAL_MIN ? "disabled" : ""} aria-label="이전 ${CONFIG.calendarWeeks}주">◀</button>
      <h2>${calTitle(today, start, end)}</h2>
      <button data-cal="1" ${calPage >= calMax() ? "disabled" : ""} aria-label="다음 ${CONFIG.calendarWeeks}주">▶</button>
      ${calPage !== 0 ? `<button data-cal="0" class="cal-today">오늘</button>` : ""}</div>
    <div class="legend">${people.map((p) => `<span><i style="background:${colorOf(p)}"></i>${escapeHtml(p)}</span>`).join("")}</div></div>
    <div class="cal"><div class="dows">`;
  DOW.forEach((d, i) => {
    html += `<div class="dow ${i === 0 ? "sun" : i === 6 ? "sat" : ""} ${i === today.getDay() && calPage === 0 ? "today-col" : ""}">${d}</div>`;
  });
  html += "</div>";
  for (let w = 0; w < CONFIG.calendarWeeks; w++) {
    const ws = addDays(start, 7 * w), we = addDays(ws, 6);
    // 이번 주에 걸친 막대를 겹치지 않게 줄(lane)에 배치
    const lanes = [];
    const bars = spans.filter((r) => r.to >= ws && r.from <= we).sort((x, y) => x.from - y.from).map((r) => {
      const a = r.from < ws ? 0 : daysBetween(ws, r.from), b = r.to > we ? 6 : daysBetween(ws, r.to);
      let lane = lanes.findIndex((end) => end < a);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = b;
      return { ...r, a, b, lane, start: r.from >= ws };
    });
    const evRow = 2 + lanes.length;
    let cells = "", tops = "", mids = "";
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i), key = ymd(d);
      const past = d < today, isToday = +d === +today;
      const hol = holidayOf(d);
      // 연간 일정에 같은 이름이 있으면(예: 🎄 크리스마스) 빨간 이름표는 숫자 색으로만
      const holLabel = hol && !(calByDate[key] || []).some((e) => e.yearly && e.title.includes(hol)) ? hol : "";
      const tone = i === 0 || hol ? "sun" : i === 6 ? "sat" : "";
      const label = d.getDate() === 1 ? `${d.getMonth() + 1}/1` : d.getDate();
      cells += `<div class="bg ${isToday ? "today-col" : ""}" data-date="${key}" style="grid-column:${i + 1}"></div>`;
      tops += `<div class="num ${tone} ${past ? "past" : ""} ${isToday ? "today" : ""}" style="grid-column:${i + 1};grid-row:1"><span>${label}</span></div>`;
      const evs = (calByDate[key] || []).filter((e) => !inSpan(e));
      const max = CONFIG.calendarPerDay;
      const shown = evs.length > max ? evs.slice(0, max - 1) : evs;
      mids += `<div class="evs ${past ? "past-day" : ""}" style="grid-column:${i + 1};grid-row:${evRow}">${holLabel ? `<div class="hol">${escapeHtml(holLabel)}</div>` : ""}${shown.map((e) => {
        const c = colorOf(e.who);
        return e.yearly ? `<div class="yr" style="color:${c}">${escapeHtml(e.title)}</div>`
          : `<div class="chip" style="border-color:${c};background:${c}22">${escapeHtml(e.title)}</div>`;
      }).join("")}${evs.length > shown.length ? `<div class="more">+${evs.length - shown.length}개 더</div>` : ""}</div>`;
    }
    for (const r of bars) {
      const c = colorOf(r.who);
      mids += `<div class="span-bar ${r.start ? "start" : ""} ${r.to < today ? "past-day" : ""}" style="grid-column:${r.a + 1} / ${r.b + 2};grid-row:${2 + r.lane};border-color:${c};background:${c}2a">${escapeHtml(r.title)}</div>`;
    }
    html += `<div class="week" style="grid-template-rows:auto ${"auto ".repeat(lanes.length)}1fr">${cells}${tops}${mids}</div>`;
  }
  $("calendar").innerHTML = html + "</div>";
}
// 칸을 누르면 그날 일정을 시간 순으로 모두 보여 준다 (다시 누르거나 바깥을 누르면 닫힘)
function openCalDay(key, cell) {
  const old = document.querySelector(".cal-pop");
  if (old) { old.remove(); if (old.dataset.date === key) return; }
  const evs = calByDate[key] || [];
  const d = parseYMD(key);
  const pop = document.createElement("div");
  pop.className = "cal-pop"; pop.dataset.date = key;
  const hol = holidayOf(d);
  pop.innerHTML = `<h3>${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일${hol ? ` <span class="hol">· ${escapeHtml(hol)}</span>` : ""}</h3>` + (evs.length
    ? evs.map((e) => `<div class="row"><b>${escapeHtml(e.yearly ? "해마다" : e.time || "종일")}</b><span style="border-color:${colorOf(e.who)}">${escapeHtml(e.title)}</span></div>`).join("")
    : `<div class="empty">일정이 없어요.</div>`);
  const box = $("calendar").getBoundingClientRect(), r = cell.getBoundingClientRect();
  const k = fitScale;   // 화면 맞춤으로 줄어 있으면 실제 크기로 되돌려 계산
  pop.style.top = `${(r.top - box.top) / k + 34}px`;
  pop.style.left = `${Math.max(8, Math.min((r.left - box.left) / k, box.width / k - 248))}px`;
  $("calendar").appendChild(pop);
}
document.addEventListener("click", (ev) => {
  const nav = ev.target.closest && ev.target.closest("#calendar [data-cal]");
  if (nav) return calGo(+nav.dataset.cal);
  const cell = ev.target.closest && ev.target.closest("#calendar .bg");
  if (cell) return openCalDay(cell.dataset.date, cell);
  if (!ev.target.closest || !ev.target.closest(".cal-pop")) document.querySelector(".cal-pop")?.remove();
});

/* 6-3. 여행 준비물 */
function renderTrip(data) {
  const t = data.trip;
  const today = startOfDay(new Date());
  const all = t.groups.flatMap((g) => g.items);
  const over = t.start && daysBetween(t.start, today) > 3;   // 출발 3일 지난 여행은 끝난 것으로
  if (!all.length || over) {
    $("trip").innerHTML = `<h2>여행 준비물${ADD_BTN("trip")}</h2><div class="empty">다가오는 여행이 없어요.<br>
      <b>+</b>를 누르거나 “다음 여행 준비물에 <b>선크림</b> 추가해줘”라고 말하면 여기 나타나요.</div>`;
    return;
  }
  let when = "";
  if (t.start) {
    const n = daysBetween(today, t.start);
    when = n === 0 ? "오늘 출발" : n === 1 ? "내일 출발" : n > 1 ? `D-${n}` : "여행 중";
  }
  const done = all.filter((i) => i.done).length;
  $("trip").innerHTML = `<h2>여행 준비물 <span class="sub">${[when, escapeHtml(t.title)].filter(Boolean).join(" · ")}</span>
      <span class="count">챙김 ${done}/${all.length}</span>${ADD_BTN("trip")}</h2>
    <div class="pack">${t.groups.map((g) => `<div class="grp-title">${escapeHtml(g.title)}</div>` +
      g.items.map((i) => `<div class="chk ${i.done ? "done" : ""}" data-act="trip" data-group="${escapeHtml(g.title)}" data-text="${escapeHtml(i.text)}" data-done="${i.done ? 1 : 0}"><span class="box"></span>${escapeHtml(i.text)}</div>`).join("")).join("")}</div>`;
}

/* 6-4. 오늘·내일 일정 */
function renderDays(data) {
  const now = new Date();
  const today = startOfDay(now);
  const col = (d, kind) => {
    const evs = data.events.filter((e) => e.date === ymd(d))
      .sort((a, b) => (a.time === "종일" ? "99" : a.time).localeCompare(b.time === "종일" ? "99" : b.time));
    const rows = evs.map((e) => {
      const m = e.time.match(/(\d{1,2}):(\d{2})/);
      let tm = escapeHtml(e.time || "종일"), done = false;
      if (m) {
        const h = +m[1];
        tm = `${h % 12 === 0 ? 12 : h % 12}:${m[2]}<small>${h < 12 ? "오전" : "오후"}</small>`;
        done = kind === "today" && (h * 60 + +m[2]) < now.getHours() * 60 + now.getMinutes();
      }
      return `<div class="ev ${done ? "done" : ""}"><div class="tm">${tm}</div>
        <div class="ti" style="border-color:${colorOf(e.who)}">${escapeHtml(e.title)}</div></div>`;
    }).join("");
    return `<div class="is-${kind}"><h3>${kind === "today" ? "오늘" : "내일"}<small>${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})</small></h3>
      ${rows || `<div class="empty">일정이 없어요</div>`}</div>`;
  };
  $("days").innerHTML = `<div class="days2">${col(today, "today")}${col(addDays(today, 1), "tomorrow")}</div>`;
}

/* 6-4-1. + 버튼 → 추가하기 창 → serve.py 가 md 파일에 한 줄을 더한다 */
const ADD_BTN = (kind) => `<button class="add-btn" data-add="${kind}" aria-label="추가하기">+</button>`;
function openAdd(kind) {
  const data = lastData;
  if (!data) return;
  document.querySelector(".sheet-bg")?.remove();
  const people = ["아빠", "엄마", "가족", ...data.kids.map((k) => k.name)];
  const trip = data.trip;
  const groups = ["챙길 물품", "살 것"];
  for (const g of trip.groups) if (!groups.includes(g.title)) groups.push(g.title);
  const opts = (name, list, on) => `<div class="opts" data-name="${name}">${list.map((v) =>
    `<button type="button" class="opt ${v === on ? "on" : ""}" data-v="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("")}</div>`;
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = kind === "todo" ? `<form class="sheet">
      <h3>할 일 · 장보기 · 준비물 추가</h3>
      ${opts("kind", ["할 일", "장보기", "준비물"], "할 일")}
      <label>무엇을</label><input type="text" name="text" maxlength="40" required autocomplete="off" placeholder="예: 분리수거, 우유, 실내화">
      <label>누구</label>${opts("who", people, "가족")}
      <div class="due"><label>언제까지 (없으면 비워 두기)</label><input type="date" name="due"></div>
      <div class="btns"><button type="button" class="no">닫기</button><button class="ok">추가</button></div></form>`
    : `<form class="sheet">
      <h3>여행 준비물 추가</h3>
      ${opts("group", groups, groups[0])}
      <label>물건</label><input type="text" name="text" maxlength="40" required autocomplete="off" placeholder="예: 선크림">
      ${trip.named && trip.start ? "" : `<div class="row2">
        ${trip.named ? "" : `<div><label>여행 이름</label><input type="text" name="title" maxlength="30" placeholder="예: 제주 여행"></div>`}
        ${trip.start ? "" : `<div><label>출발일</label><input type="date" name="start"></div>`}</div>
        <div class="hint">여행 이름·출발일은 아직 비어 있을 때만 적혀요.</div>`}
      <div class="btns"><button type="button" class="no">닫기</button><button class="ok">추가</button></div></form>`;
  document.body.appendChild(bg);
  const form = bg.querySelector("form");
  const pick = (name) => form.querySelector(`.opts[data-name="${name}"] .opt.on`)?.dataset.v || "";
  form.addEventListener("click", (e) => {
    const o = e.target.closest(".opt");
    if (o) {
      o.parentElement.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", b === o));
      if (o.parentElement.dataset.name === "kind") {
        const due = form.querySelector(".due"), v = o.dataset.v;
        due.style.display = v === "장보기" ? "none" : "";
        due.querySelector("label").textContent = v === "준비물" ? "언제 챙길 준비물? (기본: 오늘)" : "언제까지 (없으면 비워 두기)";
        if (v === "준비물" && !due.querySelector("input").value) due.querySelector("input").value = ymd(new Date());
      }
    }
    if (e.target.closest(".no")) bg.remove();
  });
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form), text = String(f.get("text") || "").trim();
    if (!text) return;
    const ok = form.querySelector(".ok");
    ok.disabled = true; ok.textContent = "저장 중…";
    try {
      if (kind === "todo") {
        const k = pick("kind");
        await post("/api/todo-add", { kind: k, text, who: pick("who"), due: k !== "장보기" ? f.get("due") || "" : "" });
        toast(k === "장보기" ? `장보기에 '${text}' 추가했어요` : k === "준비물" ? `준비물에 '${text}' 추가했어요 🎒` : `할 일에 '${text}' 추가했어요`, "lv");
      } else {
        await post("/api/trip-add", { group: pick("group"), text, title: f.get("title") || "", start: f.get("start") || "" });
        toast(`여행 준비물에 '${text}' 추가했어요`, "lv");
      }
      bg.remove();
      await refreshWiki();
    } catch (err) { ok.disabled = false; ok.textContent = "추가"; toast("⚠️ " + err.message); }
  });
  setTimeout(() => form.querySelector("input[name=text]").focus(), 50);
}
document.addEventListener("click", (ev) => {
  const g = ev.target.closest && ev.target.closest("#pets .pet[data-garden]");
  if (g) { location.hash = `#garden-${g.dataset.garden}`; return; }
  const b = ev.target.closest && ev.target.closest("[data-add]");
  if (b) openAdd(b.dataset.add);
});

/* 6-4-1. 아빠의 포켓몬 동산 (미니): 토큰으로 키우는 아빠 동료 — 아빠/포켓몬-동료.json
   파일이 없거나 companion이 null이면 가짜 포켓몬 없이 안내만 보여 준다. */
function dadGardenHtml(data) {
  const d = data.dadCompanion;
  const head = `<h4>🥚 아빠가 키우는 포켓몬 · 토큰으로 성장</h4>`;
  if (!d || !d.companion) {
    return `<div class="dad-garden">${head}<div class="empty">아직 아빠 포켓몬이 없어요 — 토큰 사용량이 서버에 들어오면 여기에 떠요</div></div>`;
  }
  const c = d.companion;
  const since = Math.max(0, +d.sinceStartTokens || 0);
  const today = Math.max(0, +d.todayTokens || 0);
  const pct = Math.round(Math.min(1, Math.max(0, +d.progress || 0)) * 100);
  const stale = (() => {
    const t = Date.parse(d.updatedAt || "");
    if (!t || Date.now() - t < 24 * 3600 * 1000) return "";
    const dt = new Date(t);
    return `<div class="sync">마지막 동기화: ${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}</div>`;
  })();
  const next = d.nextAt == null
    ? `졸업했어요! 🎓`
    : `${escapeHtml(d.nextLabel || "다음")}까지 <b>${Math.max(0, d.nextAt - since).toLocaleString("ko-KR")} 토큰</b> 남음 (${since.toLocaleString("ko-KR")} / ${(+d.nextAt).toLocaleString("ko-KR")})`;
  const img = c.dex
    ? `<img class="poke-img" src="${DAD_SPRITE(c.dex, !!c.shiny)}" alt="${escapeHtml(c.ko || "")}" onerror="this.style.display='none'">`
    : `<span class="dad-egg">🥚</span>`;
  const name = c.dex ? escapeHtml(c.ko) : "알";
  return `<div class="dad-garden">${head}<div class="pet">${img}<div>
    <div class="name">${name}${c.shiny ? " ✨" : ""} <span class="poke-tag${c.rarity === "legendary" ? " legendary" : ""}">${escapeHtml(c.stageLabel || "")}</span></div>
    <div class="bar"><i style="width:${pct}%;background:#3e7bd6"></i></div>
    <div class="meta">오늘 <b>${today.toLocaleString("ko-KR")} 토큰</b> · ${next}</div>
    <div class="meta">도감 <b>${Math.max(0, +d.pokedexCount || 0)}마리</b> 졸업</div>${stale}</div></div></div>`;
}

/* 6-5-0. 준비물은 당일 + 전날 오후(낮 12시)부터 — 날짜(~11/14)가 오늘이면 "오늘",
   내일이고 지금이 낮 12시 이후면 "내일". 먼 날 것은 그날 전날 오후까지 안 보인다.
   날짜가 없으면 날마다 챙기는 것으로 보고 "오늘"에 둔다. */
function supplyDay(s, now = new Date()) {
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  if (!s.due || s.due === md(now)) return "오늘";
  if (s.due === md(addDays(now, 1)) && now.getHours() >= 12) return "내일";
  return "";
}
function supplyAttrs(s) {
  return `data-act="supply" data-text="${escapeHtml(s.text)}" data-who="${escapeHtml(s.who)}" data-due="${escapeHtml(s.due)}" data-done="${s.done ? 1 : 0}"`;
}

/* 6-5. 할 일·장보기: 괄호 속 이름별로 칸을 나눈다 */
function renderTodos(data) {
  const commonNames = ["가족", "공통", "다같이", "모두"];
  const groups = {};
  const kidNames = data.kids.map((k) => k.name);
  for (const t of data.todos) {
    if (kidNames.includes(t.who)) continue;                 // 아이 할 일은 상단 메뉴 '○○ 할 일' 화면에서
    const key = !t.who || commonNames.includes(t.who) ? "공통" : t.who;
    (groups[key] ||= []).push(t);
  }
  const names = ["아빠", "엄마"];                            // 대시보드에는 아빠·엄마 칸을 늘 보여 준다
  for (const n of names) groups[n] ||= [];
  const common = [...(groups["공통"] || []), ...Object.keys(groups).filter((n) => n !== "공통" && !names.includes(n)).flatMap((n) => groups[n])];
  // 누르면 '다 했어요?' 확인 후 장보기·할 일.md 에서 그 줄을 지운다 (아이 할 일과 같은 방식)
  const item = (t) => `<div class="chk" data-act="todo" data-text="${escapeHtml(t.text)}" data-who="${escapeHtml(t.who)}"><span class="box"></span>${escapeHtml(t.text)}${t.due ? `<span class="due">~${t.due}</span>` : ""}</div>`;
  // 오늘 준비물 + 전날 오후부터 보이는 내일 준비물 (온 가족 것, 아이 것도 함께) — 누르면 챙김 체크, 다시 누르면 풀림
  const sups = (data.supplies || []).map((s) => ({ ...s, day: supplyDay(s) })).filter((s) => s.day)
    .sort((a, b) => (a.day === "내일") - (b.day === "내일"));
  const supToday = sups.filter((s) => s.day === "오늘");
  const supHtml = sups.length ? `<div class="shop"><b>🎒 준비물 ${supToday.filter((s) => s.done).length}/${supToday.length}</b>${sups.map((s) =>
    `<span class="item sup ${s.done ? "done" : ""}" ${supplyAttrs(s)}><span class="bx"></span>${escapeHtml(s.text)}${s.who && s.who !== "가족" ? ` <small>(${escapeHtml(s.who)})</small>` : ""}${s.day === "내일" ? ` <span class="tmr">내일</span>` : ""}</span>`).join("")}</div>` : "";
  let html = "";
  if (!data.todos.some((t) => !kidNames.includes(t.who)) && !data.shopping.length && !sups.length) {
    html = `<h2>할 일${ADD_BTN("todo")}</h2><div class="empty">할 일도 장보기도 비어 있어요 🎉<br><b>+</b>를 누르거나 “장보기에 <b>우유</b> 추가해줘”, “<b>분리수거</b> 해야 해”처럼 말해 보세요.</div>`;
  } else {
    html += `<h2>할 일 · 장보기${ADD_BTN("todo")}</h2>`;
    html += names.length ? `<div class="todo-cols" style="grid-template-columns:repeat(${names.length},1fr)">` +
      names.map((n) => `<div class="todo-col"><h3 style="color:${colorOf(n)}">${escapeHtml(n)} 할 일<span class="count">${groups[n].length}</span></h3>
        ${groups[n].slice(0, 6).map(item).join("")}${groups[n].length > 6 ? `<div class="empty">…외 ${groups[n].length - 6}개</div>` : ""}</div>`).join("") + "</div>" : "";
    if (common.length) html += `<div class="${names.length ? "common" : ""}"><span class="label">공통 할 일 · ${common.length}</span>
      ${common.slice(0, 4).map(item).join("")}</div>`;
    // 체크한 장보기는 당일만 보여주고 다음 날부터 안 뜬다 (체크한 날짜가 ~M/D 로 due에 들어온다)
    const todayMD = `${new Date().getMonth() + 1}/${new Date().getDate()}`;
    const shopVisible = (data.shopping || []).filter((s) => !s.done || s.due === todayMD);
    html += `<div class="shop"><b>장보기 ${shopVisible.length}</b>${shopVisible.length ? shopVisible.map((s) => `<span class="item sup ${s.done ? "done" : ""}" data-act="shop" data-text="${escapeHtml(s.text)}" data-who="${escapeHtml(s.who)}" data-done="${s.done ? 1 : 0}"><span class="bx"></span>${escapeHtml(s.text)}</span>`).join("") : `<span class="empty">비어 있어요</span>`}</div>`;
    html += supHtml;
  }
  $("todos").innerHTML = html;
}

/* 6-6. 아이 포켓몬: 루틴 1개 완료 = 레벨 1 (나이와 무관)
   알 Lv.0~4 → 5번째 루틴에 부화, 1단계 Lv.1 → Lv.10이 되면 진화, 2단계 Lv.1 → Lv.15가 되면 최종 진화 후 동산으로 이동, 새 알 시작
   진화한 그 루틴이 다음 단계의 Lv.1이 된다. 한 마리 졸업까지 루틴 28개.
   그림은 진짜 포켓몬 도트 스프라이트(PokéAPI) — 알일 때만 기존 픽셀 알 그림을 쓴다 */
function renderPets(data) {
  if (!data.kids.length) {
    $("pets").innerHTML = `<h2>우리 가족 포켓몬</h2><div class="empty">가족 구성원.md의 <b>아이</b> 표가 비어 있어요.</div>${dadPetHtml(data)}`;
    return;
  }
  $("pets").innerHTML = `<h2>우리 가족 포켓몬</h2>` + data.kids.map((k, i) => {
    const st = pokeState(k.name, (data.pokeCounts || {})[k.name] || 0);
    const pct = st.pct;
    const stageLabel = !st.cur ? "알" : st.nextAt === 10 ? "1단계" : "2단계";
    const meta = st.needPick
      ? `${st.n}번째 포켓몬 — <b>새 알 3개 중 하나를 골라요!</b>`
      : !st.cur
      ? `루틴 <b>${st.total}개</b> 완료 · 부화까지 <b>${st.left}개</b>`
      : st.nextAt === 10
      ? `루틴 <b>${st.total}개</b> 완료 · 진화까지 <b>${st.left}개</b>`
      : `루틴 <b>${st.total}개</b> 완료 · 최종 진화까지 <b>${st.left}개</b>`;
    const img = st.cur
      ? `<img class="poke-img" id="pet${i}" style="animation-delay:-${((pokeHash(k.name + "#pet") % 10) / 10 * 1.8).toFixed(2)}s" src="${POKE_SPRITE(st.cur[0])}" alt="${escapeHtml(st.cur[1])}" onerror="this.style.display='none';document.getElementById('petName${i}').style.display='';">`
      : `<canvas id="pet${i}" class="crack${st.level}" style="animation-delay:-${((pokeHash(k.name + "#egg") % 10) / 10 * 2.4).toFixed(2)}s"></canvas>`;
    return `<div class="pet" data-garden="${i}" title="${escapeHtml(k.name)} 포켓몬 보기">${img}<div>
      <div class="name">${escapeHtml(k.name)} <span class="lv">Lv.${st.level}</span> ${st.cur ? `<span class="poke-tag${st.legendary ? " legendary" : ""}">${st.legendary ? "✨ 전설 · " : ""}${escapeHtml(st.cur[1])}${pokeTierBadge(st.cur[0])}</span>` : st.needPick ? `<span class="poke-tag pick">🥚 알 고르기!</span>` : `<span class="poke-tag">${escapeHtml(eggLabel(st.type))}</span>`}</div>
      <div class="bar"><i style="width:${pct}%;background:${k.skin.bar}"></i></div>
      <div class="meta">${meta}</div>
      <div class="meta" id="petName${i}" style="display:none">${st.cur ? escapeHtml(st.cur[1]) : "알"}</div></div></div>`;
  }).join("") + dadPetHtml(data);
  data.kids.forEach((k, i) => {
    const st = pokeState(k.name, (data.pokeCounts || {})[k.name] || 0);
    if (!st.cur) drawPixels($(`pet${i}`), eggGrid(st.level), eggColors(st.type, k.skin), 4);   // 레벨만큼 금이 간 알 (무늬 색 = 타입)
  });
}

/* 아빠 포켓몬 줄 — 아이들 줄과 같은 모양으로 '우리 가족 포켓몬' 카드 맨 아래에(2026-11-14 아빠 요청, 예전엔 할 일 카드 아래).
   아빠/포켓몬-동료.json(서버 serve.py dad_tick이 토큰 사용량으로 씀) — 토큰이 경험치. 아이들 줄 순서(i)는 그대로라 아이 화면 복사(kid.js)에 영향 없음 */
function dadPetHtml(data) {
  const d = data.dadCompanion, c = d && d.companion;
  if (!c) return `<div class="pet dad-pet" data-dad-dex="아빠" title="아빠 포켓몬 도감 보기"><span class="dad-egg">🥚</span><div><div class="name" style="color:${colorOf("아빠")}">아빠</div>
    <div class="meta">토큰 사용량이 서버에 들어오면 아빠 포켓몬이 여기에 떠요</div></div></div>`;
  const since = Math.max(0, +d.sinceStartTokens || 0), today = Math.max(0, +d.todayTokens || 0);
  const pct = Math.round(Math.min(1, Math.max(0, +d.progress || 0)) * 100);
  const man = (n) => n >= 1e8 ? `${(n / 1e8).toFixed(1).replace(/\.0$/, "")}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString("ko-KR")}만` : n.toLocaleString("ko-KR");
  const meta = d.nextAt == null ? `졸업했어요! 🎓` : `오늘 <b>${man(today)} 토큰</b> · ${escapeHtml(d.nextLabel || "다음")}까지 <b>${man(Math.max(0, d.nextAt - since))}</b>`;
  const img = c.dex ? `<img class="poke-img" src="${DAD_SPRITE(c.dex, !!c.shiny)}" alt="${escapeHtml(c.ko || "")}" onerror="this.style.display='none'">` : `<span class="dad-egg">🥚</span>`;
  const tag = c.dex ? `${c.rarity === "legendary" ? "✨ 전설 · " : ""}${escapeHtml(c.ko || "")}${c.shiny ? " ✨" : ""}` : "🥚 토큰 알";
  return `<div class="pet dad-pet" data-dad-dex="아빠" title="아빠 포켓몬 도감 보기 — 토큰으로 자라요">${img}<div>
    <div class="name" style="color:${colorOf("아빠")}">아빠 ${c.dex ? `<span class="lv">${escapeHtml(c.stageLabel || "")}</span> ` : ""}<span class="poke-tag${c.rarity === "legendary" ? " legendary" : ""}">${tag}</span></div>
    <div class="bar"><i style="width:${pct}%;background:#3e7bd6"></i></div>
    <div class="meta">${meta}</div></div></div>`;
}

/* 6-6-1. 포켓몬 동산(마을): 졸업한 포켓몬이 들판 장면에 서 있다.
   들판 배경은 픽셀 풍경 SVG, 포켓몬 자리는 아이·주기·도감번호로 정해 새로고침해도 같은 자리에 선다 */
const GARDEN_SPOTS = [[10, 62], [24, 42], [40, 64], [54, 40], [68, 62], [82, 44], [17, 78], [33, 80], [49, 76], [65, 80], [79, 76], [47, 52]];
/* 동산 배경: 320×100 도트 그림을 크게 늘려 보여 준다 (시간대별 낮·노을·밤) */
const GARDEN_PAL = {
  day: { sky: ["#5fb4f5", "#86ccff", "#b3e3ff", "#dcf4ff"], sun: "#ffd43b", glow: "#fff3b0", cloud: "#ffffff", cloudShade: "#d3ebfb",
    mount: "#8fb3d9", mountLight: "#b3cfea", snow: "#f4f9ff", forest: "#3f8f4a", forestDark: "#2f6e3a", hill1: "#86d062", hill1Light: "#a6e27c",
    hill2: "#5fb84a", hill2Light: "#7ccf5a", tuftDark: "#4a9a3a", tuftLight: "#9be27a", path: "#ead8a8", pathEdge: "#cdb782",
    water: "#4da8f0", waterLight: "#a8dcff", shore: "#d9c690", wall: "#f6e6c4", roof: "#d9483b", roof2: "#3e7bd6", win: "#bfe6ff", door: "#8a5a3b", fence: "#a8743f", stars: 0 },
  sunset: { sky: ["#4d5aa8", "#a466a8", "#f08a7a", "#ffcf96"], sun: "#ffb347", glow: "#ffd9a0", cloud: "#ffd9c8", cloudShade: "#e3a2a4",
    mount: "#7d6aa6", mountLight: "#a08cc4", snow: "#ffe3d6", forest: "#3a7a45", forestDark: "#2a5c36", hill1: "#7cb85a", hill1Light: "#9ccd70",
    hill2: "#579f45", hill2Light: "#6fb854", tuftDark: "#43863a", tuftLight: "#8fcc6a", path: "#e3c79a", pathEdge: "#c3a577",
    water: "#6a7fd0", waterLight: "#f3b3a6", shore: "#d0b486", wall: "#f3d9b6", roof: "#c9433a", roof2: "#3b62b8", win: "#ffd86b", door: "#7a4e33", fence: "#946535", stars: 0 },
  night: { sky: ["#0c1230", "#18224e", "#26356c", "#384a86"], sun: "#fff1b8", glow: "#3e4d88", cloud: "#46538a", cloudShade: "#36416f",
    mount: "#2a3566", mountLight: "#38457c", snow: "#6b7bb0", forest: "#1e4834", forestDark: "#153826", hill1: "#2e6a45", hill1Light: "#3b8054",
    hill2: "#23593a", hill2Light: "#2e6c47", tuftDark: "#1b4a30", tuftLight: "#3f8a58", path: "#8e8a73", pathEdge: "#6f6b58",
    water: "#26467f", waterLight: "#8ea6e0", shore: "#6f6a52", wall: "#c9b590", roof: "#8a3a3a", roof2: "#2c4a8a", win: "#ffd86b", door: "#4e3626", fence: "#6e4f30", stars: 1 },
};
const gardenBgCache = {};
/* 4-4. 동산 = 오늘 날씨 + 시간: 시간대 색(낮·노을·밤)에 날씨(js/wxfx.js WEATHER_MODE)를 덧입힌다
   흐림·비·천둥 → 회색 하늘·해 숨김·구름 많이(비는 빗줄기) / 눈 → 옅은 회색 하늘·하얗게 덮인 언덕·눈송이 */
const WX_SKY = {
  day: { grey: ["#7f8c9e", "#98a4b4", "#b2bcc8", "#cbd2db"], snow: ["#a9b6c6", "#c1ccd8", "#d7dfe8", "#ecf1f6"] },
  sunset: { grey: ["#5b5f7a", "#7a7a92", "#9b94a6", "#bdb1b8"], snow: ["#8a8ca6", "#a6a8bc", "#c4c3d1", "#dedbe4"] },
  night: { grey: ["#151a2a", "#212838", "#2e3648", "#3c4558"], snow: ["#232a40", "#323b54", "#46506a", "#5b6680"] },
};
function weatherPal(P, mode, wm) {
  if (wm === "clear") return P;
  if (wm === "snow") {
    const night = mode === "night";
    return { ...P, sky: WX_SKY[mode].snow, cloud: night ? "#5b6680" : "#eef2f7", cloudShade: night ? "#46506a" : "#cfd8e3",
      hill1: night ? "#8d9bb8" : "#e6eef7", hill1Light: night ? "#a9b6cf" : "#ffffff", hill2: night ? "#7d8cab" : "#dbe6f2", hill2Light: night ? "#9aa8c4" : "#f6faff",
      tuftDark: night ? "#6c7a98" : "#b9c8da", tuftLight: night ? "#b7c3d8" : "#ffffff", path: night ? "#9a9688" : "#e8e2d4", stars: 0 };
  }
  return { ...P, sky: WX_SKY[mode].grey, cloud: mode === "night" ? "#3c4558" : "#c3cad4", cloudShade: mode === "night" ? "#2e3648" : "#a3acb9",
    win: mode === "night" ? P.win : "#d7e2ee", stars: 0 };
}
function gardenBackdrop() {
  const h = new Date().getHours();
  const mode = h >= 19 || h < 6 ? "night" : h >= 17 ? "sunset" : "day";
  const wm = typeof WEATHER_MODE === "string" ? WEATHER_MODE : "clear";
  const key = `${mode}|${wm}`;
  if (!gardenBgCache[key]) {
    const P = weatherPal(GARDEN_PAL[mode], mode, wm), W = 320, H = 100;
    const overcast = wm !== "clear";
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    let seed = 20261112;                                              // 늘 같은 그림이 나오도록 고정 난수
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const px = (x, y, c, w = 1, hh = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, hh); };
    const disc = (cx, cy, rr, c) => { for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) if (x * x + y * y <= rr * rr + rr * 0.6) px(cx + x, cy + y, c); };
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    // 1) 하늘: 색 띠 사이를 도트 무늬(디더링)로 섞는다
    for (let y = 0; y < 50; y++) {
      const f = (y / 49) * (P.sky.length - 1), lo = Math.floor(f), fr = f - lo;
      for (let x = 0; x < W; x++) px(x, y, P.sky[Math.min(P.sky.length - 1, lo + (BAYER[y % 4][x % 4] / 16 < fr ? 1 : 0))]);
    }
    if (P.stars) for (let i = 0; i < 70; i++) px(rnd() * W, rnd() * 34, rnd() > 0.8 ? "#ffffff" : "#c9d4ff");
    // 2) 해(달)와 둥근 빛
    if (!overcast) {                                                 // 흐리거나 비·눈이면 해(달)는 구름 뒤에 숨는다
      for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) { const d = x * x + y * y; if (d <= 144 && d > 64 && BAYER[(y + 12) % 4][(x + 12) % 4] < 6) px(262 + x, 16 + y, P.glow); }
      disc(262, 16, 7, P.sun);
      if (mode === "night") { disc(265, 14, 6, P.sky[0]); }        // 초승달
    }
    // 3) 구름 (흐린 날은 더 많이·더 크게)
    const cloud = (cx, cy, w) => { for (let i = 0; i < w; i += 4) disc(cx + i, cy - (i % 8 === 0 ? 2 : 0) - (i > w * 0.3 && i < w * 0.7 ? 2 : 0), 4, P.cloud); px(cx - 3, cy + 3, P.cloudShade, w + 6, 2); };
    cloud(30, 14, 26); cloud(120, 9, 18); cloud(180, 22, 30); cloud(300, 30, 14);
    if (overcast) { cloud(70, 6, 34); cloud(230, 8, 40); cloud(-6, 26, 22); cloud(140, 26, 26); cloud(262, 18, 24); }
    // 4) 먼 산
    const mtn = (x) => 34 + 6 * Math.sin(x * 0.033 + 1.2) + 4 * Math.sin(x * 0.081 + 0.4) + 2 * Math.sin(x * 0.19);
    for (let x = 0; x < W; x++) { const t = Math.round(mtn(x)); px(x, t, P.mountLight); px(x, t + 1, P.mount, 1, 50 - t); if (t < 30) px(x, t, P.snow, 1, 2); }
    px(0, 44, P.forestDark, W, 14);                                   // 숲 아래 빈틈 메우기
    // 5) 숲 줄
    for (let x = -4; x < W + 4; x += 5 + Math.floor(rnd() * 3)) { const rr = 3 + Math.floor(rnd() * 2); disc(x, 46 - rr + 1, rr, P.forest); px(x - rr + 1, 46, P.forestDark, rr * 2, 2); }
    // 6) 뒤 언덕
    const hill1 = (x) => 47 + 3 * Math.sin(x * 0.021 + 0.5) + 2 * Math.sin(x * 0.055);
    for (let x = 0; x < W; x++) { const t = Math.round(hill1(x)); px(x, t, P.hill1Light, 1, 2); px(x, t + 2, P.hill1, 1, H - t); }
    // 7) 작은 집 두 채 (밤에는 창문 불빛)
    const house = (x, y, roof) => {
      px(x, y, P.wall, 12, 8); px(x + 2, y + 2, P.win, 3, 3); px(x + 8, y + 3, P.door, 3, 5);
      for (let i = 0; i < 5; i++) px(x - 1 + i, y - 1 - i, roof, 14 - i * 2, 1);
      px(x + 9, y - 6, "#7a6a62", 2, 3);                           // 굴뚝
    };
    house(36, Math.round(hill1(40)) - 7, P.roof); house(276, Math.round(hill1(280)) - 7, P.roof2);
    // 8) 앞 언덕
    const hill2 = (x) => 60 + 5 * Math.sin(x * 0.016 + 2.1) + 2 * Math.sin(x * 0.047 + 1);
    for (let x = 0; x < W; x++) { const t = Math.round(hill2(x)); px(x, t, P.hill2Light, 1, 2); px(x, t + 2, P.hill2, 1, H - t); }
    // 9) 풀 무늬
    for (let i = 0; i < 520; i++) {
      const x = rnd() * W, y = 50 + rnd() * 50;
      if (y < hill1(x) + 2) continue;
      const front = y > hill2(x) + 2;
      px(x, y, rnd() > 0.5 ? P.tuftDark : P.tuftLight);
      if (front && rnd() > 0.6) { px(x - 1, y - 1, P.tuftLight); px(x + 1, y - 1, P.tuftLight); }
    }
    // 10) 구불구불 길 (아래 가운데 → 언덕 너머)
    for (let y = Math.round(hill1(172)) + 1; y < H; y++) {
      const k = (y - 48) / 52, cx = 172 - 18 * Math.sin(k * 2.6) * k, w = 2 + k * 12;
      px(cx - w - 1, y, P.pathEdge, 1); px(cx - w, y, P.path, w * 2); px(cx + w, y, P.pathEdge, 1);
      if (rnd() > 0.7) px(cx - w + rnd() * w * 2, y, P.pathEdge);
    }
    // 11) 연못
    for (let y = -8; y <= 8; y++) for (let x = -26; x <= 26; x++) {
      const e = (x * x) / 676 + (y * y) / 64;
      if (e <= 1) px(52 + x, 84 + y, e > 0.78 ? P.shore : P.water);
    }
    for (const [x, y, w] of [[40, 81, 6], [56, 84, 8], [46, 87, 4], [62, 80, 3]]) px(x, y, P.waterLight, w, 1);
    for (const x of [28, 31, 76, 79]) { px(x, 76, "#3f8a3a", 1, 4); px(x, 75, "#8a5a3b"); }   // 부들
    // 12) 나무 울타리 (오른쪽 앞)
    for (let x = 222; x < 312; x += 7) { const t = Math.round(hill2(x)) - 5; px(x, t, P.fence, 2, 7); }
    for (let x = 222; x < 312; x++) { const t = Math.round(hill2(x)) - 5; px(x, t + 1, P.fence); px(x, t + 4, P.fence); }
    // 13) 덤불
    for (const x of [100, 214, 128]) { const t = Math.round(hill2(x)); disc(x, t - 1, 4, P.tuftDark); disc(x - 1, t - 2, 2, P.hill2Light); }
    // 14) 꽃
    const petals = mode === "night" ? ["#c98fb0", "#c9b86b", "#b9c0d9"] : ["#ff8fb1", "#ffd43b", "#ffffff", "#c9a2ff"];
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W, y = 68 + rnd() * 30;
      if (Math.abs(x - 52) < 30 && Math.abs(y - 84) < 11) continue;      // 연못 피하기
      const k = (y - 48) / 52; if (Math.abs(x - (172 - 18 * Math.sin(k * 2.6) * k)) < 4 + k * 12) continue;   // 길 피하기
      px(x, y + 1, P.tuftDark); px(x, y, petals[i % petals.length]);
    }
    // 15) 날씨: 비·천둥은 비스듬한 빗줄기, 눈은 하얀 눈송이 점
    if (wm === "rain" || wm === "thunder") {
      const c = mode === "night" ? "rgba(150,170,210,.55)" : "rgba(220,232,248,.75)";
      for (let i = 0; i < 170; i++) { const x = rnd() * (W + 20), y = rnd() * H; for (let k = 0; k < 3; k++) px(x - k, y + k * 2, c, 1, 2); }
    } else if (wm === "snow") {
      for (let i = 0; i < 150; i++) px(rnd() * W, rnd() * H, rnd() > 0.3 ? "#ffffff" : "#dfe8f3", rnd() > 0.85 ? 2 : 1, rnd() > 0.85 ? 2 : 1);
    }
    gardenBgCache[key] = cv.toDataURL("image/png");
  }
  return `<img class="garden-bg" src="${gardenBgCache[key]}" alt="">`;
}
const GARDEN_SVG = `<svg viewBox="0 0 800 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="800" height="240" fill="#7cc4ff"/>
  <rect y="120" width="800" height="120" fill="#8fd07a"/>
  <ellipse cx="120" cy="45" rx="70" ry="18" fill="#fff"/><ellipse cx="170" cy="38" rx="55" ry="15" fill="#fff"/>
  <ellipse cx="560" cy="30" rx="80" ry="18" fill="#fff"/><ellipse cx="620" cy="24" rx="55" ry="14" fill="#fff"/>
  <ellipse cx="360" cy="70" rx="50" ry="12" fill="#fff" opacity=".9"/>
  <circle cx="700" cy="40" r="22" fill="#ffd43b"/>
  <path d="M0 130 Q200 90 400 125 T800 120 V240 H0 Z" fill="#6fbf5e"/>
  <path d="M0 160 Q250 130 500 155 T800 150 V240 H0 Z" fill="#5bb043"/>
  <g><rect x="620" y="105" width="46" height="30" fill="#f4e1bd"/><polygon points="616,105 668,105 642,88" fill="#d9483b"/><rect x="638" y="118" width="10" height="17" fill="#8a5a3b"/><rect x="626" y="112" width="8" height="8" fill="#bfe6ff"/><rect x="650" y="112" width="8" height="8" fill="#bfe6ff"/></g>
  <g><rect x="90" y="118" width="34" height="22" fill="#f4e1bd"/><polygon points="87,118 127,118 107,104" fill="#d9483b"/><rect x="101" y="126" width="8" height="14" fill="#8a5a3b"/></g>
  <path d="M400 240 Q410 190 400 150" stroke="#e8d9a0" stroke-width="14" fill="none"/>
  <g fill="#ff8fb1"><circle cx="60" cy="200" r="4"/><circle cx="180" cy="215" r="4"/><circle cx="740" cy="205" r="4"/></g>
  <g fill="#fff"><circle cx="120" cy="220" r="4"/><circle cx="700" cy="225" r="4"/><circle cx="300" cy="228" r="4"/></g>
  <g fill="#3f9a4f"><rect x="40" y="185" width="4" height="14"/><rect x="760" y="180" width="4" height="14"/><rect x="250" y="195" width="4" height="12"/></g>
</svg>`;
// 받침에 맞는 조사: iga("뮤츠") → "뮤츠가", ro("리자몽") → "리자몽으로", ro("물") → "물로"
const jong = (w) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0; };
const iga = (w) => w + (jong(w) ? "이" : "가");
const ro = (w) => w + (jong(w) && jong(w) !== 8 ? "으로" : "로");
/* 🕊️ 풀어주기 (2026-11-15 아빠 요청) — 동산 포켓몬을 풀어주면 등급별 토큰을 받는다. 도감에는 그대로 남는다 */
function releaseCardHtml(k, st) {
  if (!st.garden.length) return `<div class="gc-card"><h3>🕊️ 풀어주기 — 토큰 모으기</h3><div class="empty">동산에 포켓몬이 없어요. 다 키운 포켓몬이 동산에 오면 여기서 풀어줄 수 있어요.</div></div>`;
  const rows = st.garden.map((g) => `<div class="stk-row release-row"><img src="${POKE_SPRITE(g.dex)}" alt="${escapeHtml(g.name)}" onerror="this.style.display='none'"><span>${escapeHtml(g.name)}${pokeTierBadge(g.dex)}</span><span class="release-tokens">🪙 ${releaseToken(g.dex)}토큰</span><button type="button" data-release-dex="${g.dex}" data-release-name="${escapeHtml(g.name)}" data-release-kid="${escapeHtml(k.name)}">풀어주기</button></div>`).join("");
  return `<div class="gc-card"><h3>🕊️ 풀어주기 — 토큰 모으기</h3><div class="empty">동산에서 풀어주면 등급별 토큰을 받아요. 도감에는 그대로 남아요.</div>${rows}</div>`;
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest && ev.target.closest("[data-release-dex]");
  if (!b || b.disabled) return;
  const kid = b.dataset.releaseKid, dex = +b.dataset.releaseDex, name = b.dataset.releaseName;
  const tier = pokeTier(dex), tokens = releaseToken(dex);
  if (!confirm(`'${name}'(${tier}등급)를 풀어줄까요?\n🪙 ${tokens}토큰을 받아요. 동산에서 나가지만 도감에는 남아요.`)) return;
  b.disabled = true;
  try {
    const r = await post("/api/release", { kid, dex, name });
    const got = (r && r.release && r.release.tokens) || tokens;
    toast(`🕊️ ${name}를 풀어줬어요! 🪙 ${got}토큰을 받았어요`, "lv");
    if (!DEMO) await refreshWiki();
  } catch (e) { toast("⚠️ " + e.message); }
  b.disabled = false;
});

function renderGarden(data) {
  if (!data.kids.length) {
    $("garden").innerHTML = `<h2>포켓몬 동산</h2><div class="gc-card empty">가족 구성원.md의 <b>아이</b> 표가 비어 있어요.</div>`;
    return;
  }
  const eggs = [];   // 그림을 그릴 알 캔버스들 (innerHTML 뒤에 그린다)
  $("garden").innerHTML = `<h2>포켓몬 동산</h2>` + data.kids.map((k, ki) => {
    const st = pokeState(k.name, (data.pokeCounts || {})[k.name] || 0);
    const rows = (data.pokeRows || {})[k.name] || [];
    // ── 지금 키우는 포켓몬 ──
    // 단계 번호: 0 = 알, 1 = 첫 모습, 2 = 진화한 모습 (전설은 진화하지 않아 1에 머문다)
    const stageIdx = !st.cur ? 0 : Math.min(st.nextAt === 10 ? 1 : 2, st.chain.length);
    const isEgg = stageIdx === 0;
    // 알인 동안에는 어떤 포켓몬인지 화면(HTML)에 전혀 넣지 않는다 — 이름·그림 주소·실루엣 모두 "?"
    // 부화하면 바로 다음 진화 하나만 검은 실루엣으로, 그 뒤는 "?"
    const box = (content, cls = "", done = false) => `<div class="box ${cls}">${content}${done ? `<span class="done">✓</span>` : ""}</div>`;
    const eggId = `gEgg${ki}`, eggSmall = `gEggS${ki}`;
    const boxes = [box(`<canvas id="${eggSmall}"></canvas>`, isEgg ? "cur" : "", !isEgg)];
    eggs.push([eggSmall, eggColors(st.type, k.skin), isEgg ? st.level : 0]);
    st.chain.forEach((p, j) => {
      const n = j + 1;
      if (isEgg) boxes.push(box(`<span class="mystery">?</span>`, "future"));
      else if (n < stageIdx) boxes.push(box(`<img src="${POKE_SPRITE(p[0])}" alt="${escapeHtml(p[1])}">`, "", true));
      else if (n === stageIdx) boxes.push(box(`<img src="${POKE_SPRITE(p[0])}" alt="${escapeHtml(p[1])}">`, "cur"));
      else if (n === stageIdx + 1) boxes.push(box(`<img class="silhouette" src="${POKE_SPRITE(p[0])}" alt="다음 진화">`, "future"));
      else boxes.push(box(`<span class="mystery">?</span>`, "future"));
    });
    const evo = boxes.join(`<span class="arrow">▶</span>`);
    let pic, pname, pstage, msg, next;
    if (isEgg) {
      pic = `<canvas id="${eggId}" class="crack${st.level}"></canvas>`; eggs.push([eggId, eggColors(st.type, k.skin), st.level]);
      pname = st.type ? eggLabel(st.type) : "알"; pstage = "어떤 포켓몬이 나올까요?";
      msg = st.level === 0 ? "새 알이 왔어요! 따뜻하게 품어 줘요." : "알이 조금씩 움직여요… 곧 태어날 것 같아요!";
      next = `다음: 루틴 ${st.left}개면 부화`;
    } else {
      const cur = st.cur, prev = stageIdx === 2 ? st.chain[0] : null;
      pic = `<img src="${POKE_SPRITE(cur[0])}" alt="${escapeHtml(cur[1])}">`;
      pname = cur[1];
      pstage = st.legendary ? "✨ 전설의 포켓몬" : `${st.chain.length}단계 중 ${stageIdx}단계`;
      msg = st.legendary ? `알에서 전설의 포켓몬 ${iga(cur[1])} 나타났어요!`
        : prev && prev[0] !== cur[0] ? `${iga(prev[1])} ${ro(cur[1])} 진화했어요!`
        : `알에서 ${iga(cur[1])} 태어났어요!`;
      next = st.nextAt === 10 && st.chain.length > 1 ? `다음: 루틴 ${st.left}개면 진화` : `다음: 루틴 ${st.left}개면 다 키워서 동산으로`;
    }
    // ── 다 키운 포켓몬 (동산 들판) ──
    // 응원이 있으면 가장 최근에 동산에 온 포켓몬 머리 위에 말풍선을 붙인다 (2026-11-17 아빠 요청).
    // 예전처럼 장면 왼쪽 아래에 포켓몬 이미지를 하나 더 그리지 않는다 — 그게 동산에 한 마리가 더 있는 것처럼 보였다.
    const gardenCheer = cheerBubbleHtml(data, k);
    const scene = st.garden.length
      ? st.garden.map((g, i) => {
          const spot = GARDEN_SPOTS[(pokeHash(`${k.name}#${i}#${g.dex}`)) % GARDEN_SPOTS.length];
          const delay = ((pokeHash(`${k.name}#${i}#${g.dex}#delay`) % 10) / 10 * 1.8).toFixed(2);
          const isCheer = i === st.garden.length - 1 && gardenCheer;
          // 말풍선이 장면 밖으로 잘리지 않게: 가장자리 포켓몬은 말풍선을 안쪽으로 붙인다
          const align = spot[0] < 30 ? " b-left" : spot[0] > 70 ? " b-right" : "";
          const bubble = isCheer ? gardenCheer.replace('class="bubble"', `class="bubble${align}"`) : "";
          return `<div class="garden-poke${isCheer ? " has-cheer" : ""}" style="left:${spot[0]}%;top:${spot[1]}%;animation-delay:-${delay}s">${bubble}<img src="${POKE_SPRITE(g.dex)}" alt="${escapeHtml(g.name)}" onerror="this.style.display='none'"><span>${escapeHtml(g.name)}${pokeTierBadge(g.dex)}${g.legendary ? " ✨" : ""}</span></div>`;
        }).join("")
      : `<div class="garden-empty">아직 다 키운 포켓몬이 없어요.<br>루틴을 28개 마치면 첫 포켓몬이 여기에 살아요.</div>`;
    const recent = rows.slice(-4).reverse().map((r) => `<div class="recent-row"><span class="d">${escapeHtml((r.date || "").slice(5).replace("-", "/"))}</span><span class="p">+1</span><span>${escapeHtml(r.routine)}</span></div>`).join("");
    // 두 번째부터 알을 아직 안 골랐으면: 지금 키우는 포켓몬 칸에 '알 3개 중 고르기'
    const nowCard = st.needPick
      ? `<div class="gc-card now-poke"><h3 style="align-self:stretch">${escapeHtml(k.name)}의 새 알</h3>${eggPickerHtml(k, st)}</div>`
      : `<div class="gc-card now-poke"><h3 style="align-self:stretch">${escapeHtml(k.name)}의 지금 키우는 포켓몬</h3>
        ${st.garden.length ? "" : nowCheerHtml(data, k)}
        <div class="stage-pic">${pic}</div>
        <div class="pname">${escapeHtml(pname)}${!isEgg ? pokeTierBadge(st.cur[0]) : ""}</div><div class="pstage">${escapeHtml(pstage)}</div>
        <div class="lvline"><b>Lv.${st.level}</b> · 루틴 ${st.total}개 완료<div class="bar"><i style="width:${st.pct}%;background:${k.skin.bar}"></i></div></div>
        <div class="evo">${evo}</div>
        <div class="poke-msg">${escapeHtml(msg)}<small>${escapeHtml(next)}</small></div></div>`;
    return `<div class="garden-child">
      ${nowCard}
      <div class="gc-col">
        <div class="gc-card"><h3>다 키운 포켓몬 ${st.garden.length}마리</h3><div class="garden-scene">${gardenBackdrop()}${scene}</div></div>
        ${releaseCardHtml(k, st)}
        <div class="gc-card"><h3>최근 루틴</h3>${recent || `<div class="empty">아직 완료한 루틴이 없어요.</div>`}</div>
        ${typeof dexCardHtml === "function" ? dexCardHtml(data, k) : ""}
        ${typeof tradeCardHtml === "function" ? tradeCardHtml(data, k) : ""}
        ${typeof growthCardHtml === "function" ? growthCardHtml(data, k) : ""}
      </div></div>`;
  }).join("");
  for (const [id, colors, lv] of eggs) if ($(id)) drawPixels($(id), eggGrid(lv), colors, 4);   // 알 고르는 중이면 그 칸은 없다
  drawPickerEggs($("garden"));
}

/* 7. 엄마·아빠 응원 한마디 (일정/응원.md) — 오늘 날짜 것만. 날짜가 지나면 저절로 안 보인다 */
const cheersToday = (data) => (data.cheers || []).filter((c) => c.date === ymd(new Date()));
const cheersFrom = (data, who) => cheersToday(data).filter((c) => c.from === who);
const cheersFor = (data, kid) => cheersToday(data).filter((c) => c.to === kid || c.to === "모두");
// 응원 말풍선 내용 (오늘 날짜 것, 최대 2개): "아빠가 전해 달래! …" — 없으면 빈 글자
function cheerBubbleHtml(data, k) {
  const cs = cheersFor(data, k.name);
  if (!cs.length) return "";
  return `<div class="bubble">${cs.slice(0, 2).map((c) => `<div><b>${escapeHtml(c.from)}${jong(c.from) ? "이" : "가"} 전해 달래!</b> ${escapeHtml(c.text)}</div>`).join("")}</div>`;
}
// 동산 말풍선은 이제 scene을 그릴 때 가장 최근 동산 포켓몬의 .garden-poke 안에 직접 들어간다 (위 참조).
// 예전 gardenCheerHtml은 장면 왼쪽 아래에 같은 포켓몬 이미지를 하나 더 그려서 동산에 한 마리가 더 있는 것처럼 보여 삭제했다.
// 동산이 비었으면 지금 키우는 포켓몬 위 nowCheerHtml이 대신 뜬다. 응원이 없으면 말풍선은 아예 안 뜬다.
// 동산이 비었으면 지금 키우는 포켓몬이 응원을 전해 준다 — 포켓몬 그림 위 말풍선
function nowCheerHtml(data, k) {
  const b = cheerBubbleHtml(data, k);
  return b ? `<div class="now-cheer">${b}</div>` : "";
}

/* 6-7. 아빠는 지금 · 엄마는 지금 — 하루 일과 표에서 지금 시각에 맞는 줄을 골라 복셀 장면으로 */
const SCENE_EMOJI = { 버스: "🚌", 전철: "🚇", 회사: "💻", 식사: "🍚", 운동: "🏃", 잠: "😴", 집: "🏠", 산책: "🌳" };
let nowIdx = 0;          // 여러 사람이면 8초마다 돌아가며 보여 준다
// '○○는 지금' 카드를 누르면 그때 보이던 사람이 6초 동안 일어나서 춤춘다(신나는 리듬과 함께). 그동안은 차례 넘김도 멈춘다
// 노래: 엄마·아빠 메뉴 '💃 춤 음악'에 등록한 유튜브 중 하나를 튼다(노래가 나오는 동안 최대 3분 춤). 이미 음악이 나오면 그 노래에 맞춰 춤만.
//       춤 음악이 없으면 6.5초 동안 삑삑 리듬. 다시 누르면 춤과(춤이 튼) 노래를 같이 멈춘다.
let nowDance = null;
const NOW_DANCE_MS = 6500, NOW_DANCE_SONG_MS = 3 * 60000;
const musicPlaying = () => typeof musicNow !== "undefined" && musicNow && !musicNow.chooser;
function startNowDance() {
  if (!lastData) return;
  const h2 = $("home").querySelector("h2");
  const who = h2 && ["아빠", "엄마", ...Object.keys(lastData.routines || {})].find((w) => h2.textContent.startsWith(w + topic(w)));
  if (!who) return;
  const songs = typeof danceLists === "function" ? danceLists() : [];      // 💃 춤 음악(엄마·아빠 메뉴에서 따로 등록)
  let withMusic = false, ownSong = false;
  if (musicPlaying()) withMusic = true;                                     // 이미 나오는 노래에 맞춰
  else if (songs.length) {                                                  // 미리 불러 둔 춤 음악이 있으면 바로, 없으면 지금 불러서
    if (!(typeof playWarmDance === "function" && playWarmDance())) playChoice(pickDance(songs), { dance: true });
    withMusic = ownSong = true;
  }
  nowDance = { who, withMusic, ownSong, until: Date.now() + (withMusic ? NOW_DANCE_SONG_MS : NOW_DANCE_MS) };
  if (ownSong && !(musicNow && musicNow.started)) {                         // 노래가 실제로 나오기 시작할 때 화면을 바꾼다
    nowDance.waiting = true;
    nowDance.until = Date.now() + 15000;                                    // 15초 안에 소리 소식이 없으면 그냥 춤
    nowDance.giveUp = setTimeout(nowDanceGo, 15000);
    return;
  }
  renderNow(lastData);
  if (!withMusic) {
    audio();
    for (let i = 0; i < 12; i++) {                                        // 쿵짝쿵짝 6초
      const at = i * 0.5;
      beep(i % 2 ? 330 : 165, at, 0.12, "square", 0.07);
      beep([523, 659, 784, 659][i % 4], at + 0.25, 0.12, "triangle", 0.06);
    }
  }
}
// 춤 노래가 나오기 시작함(music.js 가 'music-playing' 을 알림) → 그때 일어나서 춤
function nowDanceGo() {
  if (!nowDance || !nowDance.waiting) return;
  clearTimeout(nowDance.giveUp);
  nowDance.waiting = false;
  nowDance.until = Date.now() + NOW_DANCE_SONG_MS;
  if (lastData) renderNow(lastData);
}
window.addEventListener("music-playing", nowDanceGo);
function stopNowDance() {
  if (!nowDance) return;
  clearTimeout(nowDance.giveUp);
  const own = nowDance.ownSong;
  nowDance = null;
  if (own && musicPlaying() && musicNow.dance) stopMusic();               // 춤이 튼 노래만 끈다
  if (lastData) renderNow(lastData);
}
// 춤 끝내기: 정한 시간이 지나거나, 노래에 맞춰 추던 중 노래가 꺼지면
setInterval(() => {
  if (!nowDance) return;
  if (Date.now() >= nowDance.until || (nowDance.withMusic && !musicPlaying())) stopNowDance();
}, 1000);
document.addEventListener("click", (ev) => {
  const card = ev.target.closest("#home");
  if (!card || ev.target.closest("button, a")) return;
  if (nowDance) return stopNowDance();                                    // 춤추는 중에 누르면 멈춤
  startNowDance();
});
let lastData = null;
// 받침이 있으면 "은", 없으면 "는" (하늘은 / 아빠는)
const topic = (name) => { const c = name.charCodeAt(name.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "은" : "는"; };
// 지금 시각 이전에 시작한 마지막 일과 (새벽처럼 첫 줄보다 이르면 전날 마지막 일과가 이어지는 중)
function currentActivity(list, mins) {
  if (!list || !list.length) return null;
  let cur = list[list.length - 1];
  for (const r of list) if (r.min <= mins) cur = r;
  return cur;
}
// 한 사람의 "지금": ① 지금 진행 중인 캘린더 일정 ② 오늘 하루짜리 캘린더 일정 ③ 하루 일과 표 ④ 주말 기본
const hm = (d) => `${d.getHours() % 12 === 0 ? 12 : d.getHours() % 12}:${pad(d.getMinutes())}`;
function nowFor(who, data, now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const weekend = isOffDay(now);
  const r = (data.routines || {})[who] || {};
  const mine = (data.cal || []).filter((e) => e.explicit && (e.who === who || e.who === "가족"));
  const sleeping = (() => { const a = currentActivity(r["평일"] || r["매일"], mins); return a && a.scene === "잠" ? a : null; })();
  const live = mine.find((e) => !e.allDay && e.start <= now && now < e.end);
  if (live) return { text: live.rest, sub: `📅 캘린더 일정 · ${hm(live.end)}까지`, scene: guessScene(live.rest) };
  const allDay = mine.find((e) => e.allDay && e.start <= now && now < e.end);
  if (allDay && !sleeping) return { text: allDay.rest, sub: "📅 오늘 하루 캘린더 일정", scene: guessScene(allDay.rest) };
  const list = weekend ? r["주말"] : r["평일"];
  const a = currentActivity(list || r["매일"], mins);
  if (a && (list || !weekend || r["매일"])) return a;
  if (weekend && (sleeping || r["평일"])) {
    if (sleeping) return sleeping;
    const next = mine.find((e) => !e.allDay && e.start > now && ymd(e.start) === ymd(now));
    return { text: `${holidayOf(now) || "주말"}, 집에서 쉬는 중`, sub: next ? `📅 다음 일정 ${hm(next.start)} ${next.rest}` : "일정이 생기면 캘린더에 적어 주세요", scene: "집" };
  }
  return null;
}
function renderNow(data) {
  const el = $("home");
  const now = new Date();
  const whos = [...new Set(["아빠", "엄마", ...Object.keys(data.routines || {})])];
  const people = whos.map((who) => { const a = nowFor(who, data, now); return a && { who, ...a }; }).filter(Boolean);
  if (!people.length || !window.VoxelScenes) { renderHome(true); return; }
  const p = people[nowIdx % people.length];
  const dancing = nowDance && !nowDance.waiting && nowDance.who === p.who && Date.now() < nowDance.until;   // 카드를 누르면 잠깐 일어나서 춤!
  if (dancing) { p.text = "🎉 신나게 춤추는 중!"; p.sub = "눌러 줘서 신났어요"; }
  const scene = dancing && window.VoxelScenes.has("춤") ? "춤" : window.VoxelScenes.has(p.scene) ? p.scene : "집";
  const dark = !dancing && (scene === "잠" || now.getHours() >= 18 || now.getHours() < 6);   // 저녁 6시부터는 밤 화면(춤출 땐 환하게)
  el.className = "card home" + (dark ? " dark" : "");
  el.innerHTML = `<h2><span class="bar" style="background:${colorOf(p.who)}"></span>${escapeHtml(p.who + topic(p.who))} 지금</h2>
    ${(() => {
      // 오늘의 한마디(3개까지) → 장면 바로 위 칸의 말풍선, 1분마다 다음 것.
      // 장면 위에 겹쳐 띄우면 사람 얼굴을 가려서, 말풍선이 있으면 장면 위에 따로 두고 장면을 조금 줄인다(2026-11-15 아빠 요청)
      const says = cheersFrom(data, p.who).filter((c) => c.to === "가족").slice(-3);
      const say = says.length ? says[Math.floor(Date.now() / 60000) % says.length] : null;
      return `<div class="scene${say ? " has-say" : ""}">${say ? `<div class="now-say">${escapeHtml(say.text)}</div>` : ""}${window.VoxelScenes.render(scene, p.who)}</div>`;
    })()}
    <div class="msg">${dancing ? "" : (SCENE_EMOJI[scene] || "🙂") + " "}${escapeHtml(p.text)}${p.sub ? `<small>${escapeHtml(p.sub)}</small>` : ""}</div>
    <div class="who-dots">${people.length > 1 ? people.map((_, i) => `<i class="${i === nowIdx % people.length ? "on" : ""}"></i>`).join("") : ""}</div>`;
}

/* 6-8. 다가오는 날: 위키(md)에 적힌 생일·기념일(해마다)과 일정표의 가족 일정만 D-day 순으로.
   구글 캘린더 일정은 달력·오늘/내일 칸에 이미 나오므로 여기선 뺀다 */
function renderUpcoming(data) {
  const today = startOfDay(new Date());
  const seen = new Set();
  const list = data.events.filter((e) => {
    const d = parseYMD(e.date);
    if (!d || d < today || daysBetween(today, d) > 366) return false;
    const pick = !e.cal && (e.yearly || e.who === "가족");
    const key = e.date + "|" + e.title;
    if (!pick || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
  // 같은 날 생일은 한 줄로: 🎂 첫째 생일 + 🎂 둘째 생일 → 🎂 첫째·둘째 생일
  const BDAY = /^🎂\s*(.+?)\s*생일$/;
  for (let j = 0; j < list.length; j++) {
    const m = list[j].title.match(BDAY);
    if (!m) continue;
    const names = [m[1]];
    for (let q = j + 1; q < list.length && list[q].date === list[j].date; q++) {
      const m2 = list[q].title.match(BDAY);
      if (m2) { names.push(m2[1]); list.splice(q--, 1); }
    }
    if (names.length > 1) list[j] = { ...list[j], title: `🎂 ${names.join("·")} 생일` };
  }
  list.splice(CONFIG.upcomingMax);
  $("upcoming").innerHTML = `<h2>다가오는 날</h2>` + (list.length ? list.map((e) => {
    const d = parseYMD(e.date), n = daysBetween(today, d);
    return `<div class="up-row"><span class="dd ${n === 0 ? "today" : ""}">${n === 0 ? "오늘" : "D-" + n}</span>
      <span>${escapeHtml(e.title)}</span><span class="dt">${d.getMonth() + 1}/${d.getDate()}</span></div>`;
  }).join("") : `<div class="empty">다가오는 가족 행사가 없어요.<br>생일은 <b>가족 구성원</b>, 기념일은 <b>가족 연간 일정</b>, 행사는 구글 캘린더에 적어 주세요.</div>`);
}

