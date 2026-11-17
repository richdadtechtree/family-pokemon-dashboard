/* 가족 대시보드 — 6. 등교 카운트다운
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 평일(빨간 날 제외) '학교 출발' 루틴 시각(아이들/루틴.md 시간 칸, 예: "8시 15분 (평일만)") 15분 전부터 화면 위에 큰 카운트다운.
   - 5분 남으면 화면 전체가 노란빛으로 1초 간격 부드럽게 깜박(눈 아프지 않게 옅게).
   - 멈춤: 아이 화면은 그 아이가 오늘 '학교 출발'을 체크하면, 그 밖의 화면은 아이들이 모두 체크하면. 출발 시각이 지나도 멈춘다.
   - 미리 보기: 주소 끝 ?countdown=7 → 이 화면을 연 때부터 7분 뒤가 출발인 것처럼(요일·체크와 상관없이) */
"use strict";
const CD_LEAD_MIN = 15, CD_FLASH_MIN = 5;
const cdPreview = params.has("countdown") ? Date.now() + (+params.get("countdown") || 7) * 60000 : 0;
// '학교 출발' 루틴과 그 시각(오늘 날짜의 Date). 없거나 시각을 못 읽으면 null
function departRoutine(data) {
  const rt = (data.kidRoutines || []).find((r) => /학교\s*출발|등교/.test(r.name));
  if (!rt) return null;
  const m = rt.when.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return null;
  const now = new Date();
  return { name: rt.name, at: new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +(m[2] || 0)) };
}
function departedToday(data, kidName) {
  const today = ymd(new Date());
  const dep = departRoutine(data);
  return ((data.pokeRows || {})[kidName] || []).some((r) => r.date === today && dep && sameRoutine(r.routine, dep.name));
}
function cdTick() {
  const el = document.getElementById("cdBar"), fl = document.getElementById("cdFlash");
  const off = () => { el?.remove(); fl?.remove(); };
  if (!lastData) return off();
  let target;
  if (cdPreview) target = new Date(cdPreview);
  else {
    const dep = departRoutine(lastData), now = new Date();
    if (!dep || isOffDay(now)) return off();
    target = dep.at;
    const v = currentView();
    const kid = (v.kind === "garden" || v.kind === "todo") ? lastData.kids[v.idx] : null;
    const done = kid ? departedToday(lastData, kid.name) : lastData.kids.every((k) => departedToday(lastData, k.name));
    if (done) return off();
  }
  const left = Math.ceil((target - Date.now()) / 1000);
  if (left <= 0 || left > CD_LEAD_MIN * 60) return off();
  let bar = el;
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "cdBar"; bar.setAttribute("role", "timer");
    document.body.appendChild(bar);
  }
  const v = currentView();
  const kid = (v.kind === "garden" || v.kind === "todo") ? lastData.kids[v.idx] : null;
  const waiting = kid ? "" : lastData.kids.filter((k) => !departedToday(lastData, k.name)).map((k) => k.name).join("·");
  bar.innerHTML = `<span class="cd-label">🎒 학교 출발까지</span><b class="cd-time">${Math.floor(left / 60)}:${pad(left % 60)}</b>${waiting && !cdPreview ? `<span class="cd-who">${escapeHtml(waiting)}</span>` : ""}`;
  bar.classList.toggle("hurry", left <= CD_FLASH_MIN * 60);
  if (left <= CD_FLASH_MIN * 60) {
    if (!fl) { const f = document.createElement("div"); f.id = "cdFlash"; f.setAttribute("aria-hidden", "true"); document.body.appendChild(f); }
  } else fl?.remove();
}
setInterval(cdTick, 1000);
