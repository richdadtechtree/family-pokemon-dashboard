/* 가족 대시보드 — 6-9. 상단 메뉴 · 아이 할 일 화면 · 알 고르기
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 6-9. 상단 메뉴: 대시보드 / 아이별 동산 / 아이별 할 일
   (주소 끝 #garden-0, #todo-1 처럼 바뀐다) */
function currentView() {
  const mt = location.hash.match(/^#meeting(?:-(\d{4}-\d{2}-\d{2}))?$/);   // 11. 가족회의 (#meeting = 오늘)
  if (mt) return { kind: "meeting", date: mt[1] || ymd(new Date()) };
  if (location.hash === "#ideas") return { kind: "ideas" };               // 11-2. 가족회의 아이디어
  if (location.hash === "#playroom") return { kind: "playroom" };            // 🎮 우리가족 놀이방
  const m = location.hash.match(/^#(garden|todo)-(\d+)$/);
  return m ? { kind: m[1], idx: +m[2] } : { kind: "home" };
}
function renderTabs(data) {
  const v = currentView();
  const tab = (href, icon, label, on) => `<a href="${href}" class="${on ? "on" : ""}"><i>${icon}</i>${escapeHtml(label)}</a>`;
  $("tabs").innerHTML = tab("#", "🏠", "대시보드", v.kind === "home") +
    tab("#playroom", "🎮", "우리가족 놀이방", v.kind === "playroom") +
    data.kids.map((k, i) => tab(`#garden-${i}`, "🌳", `${k.name} 동산`, v.kind === "garden" && v.idx === i)).join("") +
    data.kids.map((k, i) => tab(`#todo-${i}`, "✅", `${k.name} 할 일`, v.kind === "todo" && v.idx === i)).join("");
  // 폰: 위 메뉴가 한 줄로 옆으로 넘치면 지금 보는 메뉴가 가운데 오게 밀어 둔다
  const tabsEl = $("tabs"), onTab = tabsEl.querySelector("a.on");
  if (onTab && tabsEl.scrollWidth > tabsEl.clientWidth) tabsEl.scrollLeft = onTab.offsetLeft - (tabsEl.clientWidth - onTab.offsetWidth) / 2;
  // 아래 메뉴: 가족회의 (위 메뉴가 두 줄로 넘치지 않게)
  const t2 = document.getElementById("tabs2");
  if (t2) t2.innerHTML =
    tab("#meeting", "🗣️", "가족회의", v.kind === "meeting") +
    tab("#ideas", "💡", "회의 아이디어", v.kind === "ideas");
}
// 포켓몬 기록 중 루틴이 아닌 줄: ⭐ 스티커(영어 퀴즈·예전 칭찬) · 🎁 하루 완료 보너스 · 🤝 형제 보너스
const isBonusRow = (s) => /^\s*(⭐|🎁|🤝)/u.test(s || "");
// 루틴 이름이 조금 달라도(“책상 정리” / “스스로 책상 정리”) 같은 것으로 본다
const sameRoutine = (a, b) => { const x = a.replace(/\s/g, ""), y = b.replace(/\s/g, ""); return x && y && (x.includes(y) || y.includes(x)); };
// 오늘 해야 할 루틴 (주말·빨간 날엔 '평일만' 빼고, 평일엔 '주말·빨간 날만' 빼기) — 서버 routines_due 와 같은 규칙
const routineOff = (rt, off) => (rt.weekdayOnly && off) || (rt.weekendOnly && !off);
const kidRoutinesDue = (data, now = new Date()) => data.kidRoutines.filter((rt) => !routineOff(rt, isOffDay(now)));
// 아이의 오늘 진행: { done: 한 루틴 수, total: 할 루틴 수 }
function kidDayProgress(data, name, now = new Date()) {
  const today = ymd(now);
  const did = ((data.pokeRows || {})[name] || []).filter((r) => r.date === today && !isBonusRow(r.routine)).map((r) => r.routine);
  const need = kidRoutinesDue(data, now);
  return { done: need.filter((rt) => did.some((d) => sameRoutine(d, rt.name))).length, total: need.length };
}
// 쿠폰함: 아직 안 쓴 쿠폰(아이들/쿠폰.md 의 '쓴 날'이 빈 줄). '사용'을 누르면 정말 쓸지 묻고 쓴 날을 적는다
function couponBoxHtml(data, k) {
  const mine = (data.coupons || []).filter((c) => c.kid === k.name && !c.used);
  const md = (s) => s.slice(5).replace("-", "/");
  const card = (c) => `<div class="cpn"><div class="cpn-name">${escapeHtml(c.name)}</div>
    <div class="cpn-why">${md(c.got)} 받음${c.why ? ` · ${escapeHtml(c.why)}` : ""}</div>
    <button type="button" class="cpn-use" data-act="coupon" data-kid="${escapeHtml(k.name)}" data-got="${escapeHtml(c.got)}" data-name="${escapeHtml(c.name)}" data-why="${escapeHtml(c.why)}">사용</button></div>`;
  return `<h3 style="margin-top:14px">🎟️ ${escapeHtml(k.name)} 쿠폰함${mine.length ? ` <small>${mine.length}장</small>` : ""}</h3>
    ${ladderBtnHtml(data, k)}${mine.length ? mine.map(card).join("") : `<div class="empty">아직 쿠폰이 없어요. 월~금 루틴을 모두 하면 🏪 이용권을 받아요!</div>`}`;
}
/* 🏦 은행 — 할 일 화면의 🏦 은행가기 버튼으로 여는 팝업.
   토큰을 맡기면 매일 이자가 붙는다(단리). 기간 7일 10% · 14일 15% · 21일 20% · 28일 25% (일 금리). 만기가 되면 원금+이자를 찾는다.
   금액은 아이가 직접 적는다(#bankAmt). */
const BANK_RATES = { 7: 10, 14: 15, 21: 20, 28: 25 };
const bankDays = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
function bankSheetHtml(kid) {
  const bal = (lastData.tokens || {})[kid] || 0;
  const today = ymd(new Date());
  const mine = (lastData.bank || []).filter((d) => d.kid === kid);
  const active = mine.filter((d) => d.status === "예금중");
  const done = mine.filter((d) => d.status !== "예금중");
  const depRow = (d) => {
    const elapsed = Math.max(0, Math.min(d.term, bankDays(d.date, today)));
    const interest = Math.floor(d.principal * d.rate * elapsed / 100);
    const total = d.principal + Math.floor(d.principal * d.rate * d.term / 100);
    const matured = today >= d.maturity;
    const remain = bankDays(today, d.maturity);
    const md = (s) => (s || "").slice(5).replace("-", "/");
    return `<div class="bank-row${matured ? " matured" : ""}"><div><b>🏦 ${d.principal}토큰 · ${d.term}일 (일 ${d.rate}%)</b><br>
      <span>${md(d.date)} ~ ${md(d.maturity)} · ${matured ? "만기! 찾을 수 있어요 🎉" : `D-${remain}일 남음 · 이자 ${interest}토큰`}</span></div>
      <div class="bank-total">만기 ${total}토큰</div>
      ${matured ? `<button type="button" class="bank-btn" data-act="bank-withdraw" data-kid="${escapeHtml(kid)}" data-id="${d.id}">찾기</button>` : ""}</div>`;
  };
  return `<h2>🏦 ${escapeHtml(kid)} 은행 <button type="button" class="dex-close">닫기</button></h2>
    <div class="bank-how"><b>은행 이용법</b><br>
      ① 맡길 토큰을 아래에 직접 적어요. (지금 지갑: 🪙 ${bal}토큰)<br>
      ② 기간을 눌러요. 기간이 길수록 매일 붙는 이자가 커요.<br>
      ③ 만기가 되면 원금 + 이자를 찾을 수 있어요.<br>
      <span class="bank-rates">7일 일 10% · 14일 일 15% · 21일 일 20% · 28일 일 25%<br>이자는 매일 원금의 금리만큼 붙어요. 맡긴 토큰은 만기 전까지 못 찾아요.</span></div>
    ${active.length ? active.map(depRow).join("") : `<div class="empty">맡긴 토큰이 없어요. 은행에 맡기면 매일 이자가 붙어요!</div>`}
    <div class="bank-form">
      <label>맡길 토큰 <span class="bank-bal">· 🪙 ${bal}토큰 있어요</span></label>
      <input type="number" id="bankAmt" min="1" max="${bal}" placeholder="몇 토큰 맡길까요?" inputmode="numeric">
      <div class="bank-terms">${[7, 14, 21, 28].map((t) => `<button type="button" class="bank-btn bank-term" data-act="bank-deposit" data-kid="${escapeHtml(kid)}" data-term="${t}">${t}일 · 일 ${BANK_RATES[t]}%</button>`).join("")}</div>
      <div class="empty">맡길 토큰을 적고 기간을 눌러요. 예) 10토큰을 7일 맡기면 만기에 17토큰을 받아요.</div>
    </div>
    ${done.length ? `<div class="bank-done">${done.slice(-3).map((d) => `<span>✅ ${d.principal}토큰 ${d.term}일 찾음</span>`).join("")}</div>` : ""}`;
}
function refreshBankSheet(kid) {
  const bg = document.querySelector(".sheet-bg.bank");
  if (!bg) return;
  const sheet = bg.querySelector(".sheet");
  if (!sheet) return;
  const top = sheet.scrollTop;
  sheet.innerHTML = bankSheetHtml(kid);
  sheet.scrollTop = top;
}
function openBank(kid) {
  if (!lastData) return;
  document.querySelector(".sheet-bg.bank")?.remove();
  const bg = document.createElement("div");
  bg.className = "sheet-bg bank";
  bg.innerHTML = `<div class="sheet">${bankSheetHtml(kid)}</div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", (ev) => {
    if (ev.target === bg || ev.target.closest(".dex-close")) bg.remove();
  });
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-bank-go]");
  if (b) openBank(b.dataset.bankGo);
});
// 형제들 오늘 진행 막대 — 서로 응원하라고. 모두 다 하면 🤝 형제 보너스 +1씩
function siblingsHtml(data, i, now) {
  if (data.kids.length < 2) return "";
  const today = ymd(now);
  const got = ((data.pokeRows || {})[data.kids[i].name] || []).some((r) => r.date === today && /^\s*🤝/u.test(r.routine));
  const sib = data.kids.map((k, j) => {
    if (j === i) return "";
    const p = kidDayProgress(data, k.name, now), left = p.total - p.done;
    return `<div class="sib"><b>${escapeHtml(k.name)}</b><span class="sib-bar"><i style="width:${p.total ? (p.done / p.total) * 100 : 0}%;background:${k.skin.bar}"></i></span>
      <small>${left > 0 ? `${left}개 남음` : "다 했어요 ✓"}</small></div>`;
  }).join("");
  return `<div class="sibs"><span class="sib-title">${got ? "🤝 형제 보너스 받았어요!" : "🤝 모두 다 하면 +1씩"}</span>${sib}</div>`;
}
function renderKidTodo(data, i) {
  const k = data.kids[i];
  if (!k) { $("kidTodo").innerHTML = `<div class="empty">아이 정보가 없어요.</div>`; return; }
  const now = new Date(), today = ymd(now);
  const weekend = isOffDay(now);
  // 오늘 한 루틴 (⭐ 스티커 같은 보너스 줄은 루틴이 아니므로 뺀다 — 레벨에는 들어간다)
  const doneToday = ((data.pokeRows || {})[k.name] || []).filter((r) => r.date === today && !isBonusRow(r.routine)).map((r) => r.routine);
  const items = data.kidRoutines.map((rt) => ({ ...rt, done: doneToday.some((d) => sameRoutine(d, rt.name)), off: routineOff(rt, weekend) }));
  const active = items.filter((x) => !x.off);
  const doneN = active.filter((x) => x.done).length;
  const parts = [...new Set(items.map((x) => x.part))];
  const todos = data.todos.filter((t) => t.who === k.name);
  // 이 아이 준비물 (+ 온 가족 준비물) — 오늘 것 + 전날 오후(낮 12시)부터 내일 것
  const sups = (data.supplies || []).filter((s) => s.who === k.name || s.who === "가족")
    .map((s) => ({ ...s, day: supplyDay(s, now) })).filter((s) => s.day)
    .sort((a, b) => (a.day === "내일") - (b.day === "내일"));
  const sup = (s) => `<div class="rt sup ${s.done ? "done" : ""}" ${supplyAttrs(s)}><span class="box"></span>${escapeHtml(s.text)}<span class="when">${s.day}${s.done ? " · 챙겼어요" : ""}</span></div>`;
  const pst = pokeState(k.name, (data.pokeCounts || {})[k.name] || 0);   // 알을 골라야 하는지 보려고
  // 달력(구글 캘린더 '[첫째] 태권도'·일정표의 누구 칸)에 이 아이 이름으로 넣은 오늘·내일 일정
  const tmr = ymd(addDays(now, 1)), nowMin = now.getHours() * 60 + now.getMinutes();
  const nameRe = new RegExp(`^\\s*(?:\\[${k.name}\\]|\\(${k.name}\\)|${k.name})\\s*[:·\\-]?\\s*`);
  const scheds = data.events.filter((e) => (e.whos || [e.who]).includes(k.name) && !e.yearly && (e.date === today || e.date === tmr))
    .map((e) => {
      const m = (e.time || "").match(/(\d{1,2}):(\d{2})/);
      const min = m ? +m[1] * 60 + +m[2] : -1;
      const others = (e.whos || []).filter((n) => n !== k.name);   // 같이 하는 형제 → "파마 (둘째랑)"
      const base = e.rest || e.title.replace(nameRe, "") || e.title;
      return { ...e, min, title: others.length ? `${base} (${others.map((n) => n + (jong(n) ? "이" : "")).join("·")}랑)` : base,
        tm: m ? `${+m[1] < 12 ? "오전" : "오후"} ${+m[1] % 12 || 12}:${m[2]}` : "하루 종일",
        past: e.date === today && m && min < nowMin };
    })
    .filter((e, j, a) => a.findIndex((x) => x.date === e.date && x.title === e.title && x.time === e.time) === j)
    .sort((a, b) => a.date.localeCompare(b.date) || a.min - b.min);
  const sched = (e) => `<div class="rt sched ${e.past ? "past" : ""}"><span class="day ${e.date === tmr ? "tmr" : ""}">${e.date === tmr ? "내일" : "오늘"}</span><span class="tm">${escapeHtml(e.tm)}</span>${escapeHtml(e.title)}</div>`;
  const rt = (x) => `<div class="rt ${x.done ? "done" : ""} ${x.off ? "off" : ""}" ${x.off ? "" : `data-act="routine" data-kid="${escapeHtml(k.name)}" data-routine="${escapeHtml(x.name)}" data-done="${x.done ? 1 : 0}"`}><span class="box"></span>${escapeHtml(x.name)}<span class="when">${escapeHtml(x.off ? (x.weekendOnly ? "주말·빨간 날만" : holidayOf(new Date()) ? "빨간 날엔 쉬어요" : "주말엔 쉬어요") : x.when)}</span></div>`;
  $("kidTodo").innerHTML = `
    <div class="kid-head"><div id="kidPet"></div>
      <div class="today">오늘 루틴<b>${doneN} / ${active.length}</b>${DOW[now.getDay()]}요일<span class="kid-tokens">🪙 ${(data.tokens || {})[k.name] || 0}토큰</span></div></div>
    ${siblingsHtml(data, i, now)}
    <div class="kid-row2"><button type="button" class="dress-go" data-dress="${escapeHtml(k.name)}"><i>👕</i><span>옷 갈아입기</span></button><button type="button" class="bank-go" data-bank-go="${escapeHtml(k.name)}"><i>🏦</i><span>은행가기</span></button><div class="kid-row2-main">${typeof quizCardHtml === "function" ? quizCardHtml(data, i) : ""}</div></div>
    ${pst.needPick ? eggPickerHtml(k, pst) : ""}
    ${items.length ? `<div class="routine-grid">${parts.map((p) => `<div><h3>${p === "아침" ? "☀️" : p === "저녁" ? "🌙" : "⭐"} ${escapeHtml(p)} 루틴</h3>${items.filter((x) => x.part === p).map(rt).join("")}</div>`).join("")}
      <div><h3>🎒 ${escapeHtml(k.name)} 준비물</h3>${sups.length ? sups.map(sup).join("") : `<div class="empty">오늘·내일 준비물이 없어요</div>`}
        <h3 style="margin-top:14px">📝 ${escapeHtml(k.name)} 할 일</h3>${todos.length ? todos.map((t) => `<div class="rt" data-act="todo" data-text="${escapeHtml(t.text)}" data-who="${escapeHtml(k.name)}"><span class="box"></span>${escapeHtml(t.text)}${t.due ? `<span class="when">~${t.due}</span>` : ""}</div>`).join("") : `<div class="empty">따로 할 일이 없어요</div>`}
        ${couponBoxHtml(data, k)}
        <h3 style="margin-top:14px">📅 ${escapeHtml(k.name)} 일정</h3>${scheds.length ? scheds.map(sched).join("") : `<div class="empty">오늘·내일 일정이 없어요.<br>달력에 <b>[${escapeHtml(k.name)}] 태권도</b>처럼 이름을 앞에 붙여 넣으면 여기 나와요.</div>`}</div></div>`
      : `<div class="empty"><b>아이들/루틴.md</b>에 루틴이 아직 없어요.</div>`}
    <div class="kid-tip">루틴을 마치면 눌러서 체크해요 — 포켓몬 레벨이 1 올라요. 잘못 눌렀으면 한 번 더 누르면 취소돼요.</div>`;
  // 위 '우리 아이들' 카드의 이 아이 줄을 그대로 복사해 보여 준다 (알 그림은 다시 그림)
  const src = $("pets").querySelectorAll(".pet")[i];
  if (src) {
    const c = src.cloneNode(true);
    c.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    const from = src.querySelector("canvas"), to = c.querySelector("canvas");
    if (from && to) { to.width = from.width; to.height = from.height; to.getContext("2d").drawImage(from, 0, 0); }
    $("kidPet").appendChild(c);
  }
  drawPickerEggs($("kidTodo"));
}
/* 6-9-1. 알 고르기 (두 번째 포켓몬부터) — 알 3개 중 하나를 눌러 고르고 '○○ 알로 할래요!'를 누른다
   화면(HTML)에는 알 타입과 몇 번째 칸(slot)만 넣는다. 어떤 포켓몬인지는 누른 뒤 코드가 계산한다. */
function eggPickerHtml(k, st) {
  return `<div class="egg-pick" data-kid="${escapeHtml(k.name)}" data-n="${st.n}">
    <div class="ep-title">🥚 ${st.n}번째 포켓몬! 알 3개 중 하나를 골라요</div>
    <div class="ep-eggs">${st.choices.map((e, j) => `<button type="button" class="ep-egg" data-slot="${j}"><canvas data-egg-type="${escapeHtml(e.type)}"></canvas><span>${escapeHtml(eggLabel(e.type))}</span></button>`).join("")}</div>
    ${(st.friends || []).length ? `<div class="ep-or">또는 🐾 데려온 친구를 진화시킬래요?</div>
    <div class="ep-eggs">${st.friends.map(([dex, nm]) => `<button type="button" class="ep-egg ep-friend" data-friend="${dex}" data-name="${escapeHtml(nm)}"><img src="${POKE_SPRITE(dex)}" alt=""><span>${escapeHtml(nm)}</span></button>`).join("")}</div>` : ""}
    <button type="button" class="ep-ok" disabled>${(st.friends || []).length ? "알이나 친구를 눌러서 골라요" : "알을 눌러서 골라요"}</button>
    <div class="ep-hint">${st.waiting ? `벌써 루틴 ${st.waiting}개를 했어요. 고르면 바로 자라요!` : "어떤 포켓몬이 나올지는 부화할 때까지 비밀!"}</div></div>`;
}
function drawPickerEggs(root) {
  root.querySelectorAll("canvas[data-egg-type]").forEach((c) => drawPixels(c, eggGrid(0), eggColors(c.dataset.eggType, {}), 4));
}
// 첫 알처럼 랜덤으로 정해진 포켓몬은 부화하면 '아이들/포켓몬 알.md'에 적어 둔다(목록을 고쳐도 안 바뀌게)
const eggSaving = new Set();
function recordEggs(data) {
  if (DEMO) return;
  for (const k of data.kids) {
    for (const u of pokeState(k.name, (data.pokeCounts || {})[k.name] || 0).unrecorded) {
      const id = `${k.name}#${u.n}`;
      if (eggSaving.has(id)) continue;
      eggSaving.add(id);
      post("/api/egg-pick", { kid: k.name, n: u.n, dex: u.key }).catch(() => eggSaving.delete(id));
    }
  }
}
document.addEventListener("click", async (ev) => {
  const egg = ev.target.closest(".ep-egg"), ok = ev.target.closest(".ep-ok");
  if (!egg && !ok) return;
  const box = ev.target.closest(".egg-pick");
  if (egg) {                                       // 알을 누르면 '선택됨' 표시만
    box.querySelectorAll(".ep-egg").forEach((b) => b.classList.toggle("on", b === egg));
    const okb = box.querySelector(".ep-ok");
    const nm = egg.querySelector("span").textContent;
    okb.disabled = false; okb.textContent = egg.dataset.friend ? `${nm}${jong(nm) ? "을" : "를"} 진화시킬래요!` : `${nm}로 할래요!`;
    beep(880, 0, 0.08, "square", 0.06);
    return;
  }
  const sel = box.querySelector(".ep-egg.on");
  if (!sel || ok.disabled) return;
  audio();
  const kidName = box.dataset.kid, n = +box.dataset.n;
  const before = ((lastData && lastData.pokeCounts) || {})[kidName] || 0;
  const st = pokeState(kidName, before), fdex = +sel.dataset.friend || 0;
  const e = fdex ? null : st.choices && st.choices[+sel.dataset.slot];
  if (!st.needPick || st.n !== n || (fdex ? !(st.friends || []).some(([d]) => d === fdex) : !e)) return;
  ok.disabled = true; ok.textContent = "고르는 중…";
  try {
    // 10-4. 친구를 고르면 서버가 '포켓몬 알.md'에 비고 '친구' 줄 + 동산 장부에 '- 진화하러 감'(동산에서 나와 키운다)
    await post("/api/egg-pick", fdex ? { kid: kidName, n, dex: fdex, friend: true, name: sel.dataset.name } : { kid: kidName, n, dex: e.key });
    await refreshWiki();
    const kid = lastData.kids.find((k) => k.name === kidName), now = pokeState(kidName, before);
    if (kid) celebrate(kid.skin, now.friend ? { kind: "friendpick", to: now.cur, st: now } : now.cur ? { kind: "hatch", to: now.cur, st: now } : { kind: "picked", st: now });
  } catch (err) { ok.disabled = false; ok.textContent = "다시 눌러 볼까요?"; toast("⚠️ " + err.message); }
});

