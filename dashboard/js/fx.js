/* 가족 대시보드 — 4-1·4-2. 연출: 루틴 체크 → 동산 포켓몬이 화면을 가로질러 달리기 / 그날 다 하면 춤
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 동산(다 키운 포켓몬)에서 무작위 한 마리. 동산이 비었으면 지금 키우는 알(없으면 기본 알)이 데굴데굴 굴러간다.
   - 축하 화면(effects.js)이 끝난 뒤에 나온다. 화면을 누르는 데 방해되지 않게 클릭은 통과시킨다.
   - 춤은 이 기기에서 아이마다 하루 한 번(localStorage). 저장이 막힌 기기면 그 화면을 연 동안 한 번. */
"use strict";
// 이 아이의 연출 주인공: { img } 동산 포켓몬 그림 / { egg } 알 캔버스
function fxActor(kidName) {
  const kid = lastData && lastData.kids.find((k) => k.name === kidName);
  const st = pokeState(kidName, ((lastData && lastData.pokeCounts) || {})[kidName] || 0);
  if (st.garden.length) {
    const g = st.garden[Math.floor(Math.random() * st.garden.length)];
    const im = new Image(); im.src = POKE_SPRITE(g.dex); im.alt = g.name;
    return { el: im, name: g.name, egg: false };
  }
  const c = document.createElement("canvas");
  drawPixels(c, eggGrid(st.cur ? 0 : st.level), eggColors(st.type, kid ? kid.skin : KID_SKINS[0]), 4);
  return { el: c, name: "알", egg: true };
}
// 4-1. 화면을 왼쪽에서 오른쪽으로 가로질러 달린다(알이면 굴러간다)
function fxRun(kidName) {
  if (!lastData) return;
  const a = fxActor(kidName);
  const w = document.createElement("div");
  w.className = "fx-run" + (a.egg ? " egg" : "");
  w.style.top = `${45 + Math.random() * 30}vh`;
  w.appendChild(a.el);
  document.body.appendChild(w);
  w.addEventListener("animationend", () => w.remove());
  setTimeout(() => w.remove(), 6000);                         // 혹시 animationend 가 안 오면
}
// 4-2. 그날 다 하면: 화면 아래 가운데로 와서 춤추며 "다 했다!"
const DANCE_KEY = "danceDone";
function danceSeen(kidName) {
  const key = `${ymd(new Date())}|${kidName}`;
  try {
    const seen = JSON.parse(localStorage.getItem(DANCE_KEY) || "{}");
    if (seen[key]) return true;
    localStorage.setItem(DANCE_KEY, JSON.stringify({ [key]: 1, ...Object.fromEntries(Object.entries(seen).filter(([k]) => k.startsWith(ymd(new Date())))) }));
    return false;
  } catch (e) {
    fxDanceMem ||= new Set();
    if (fxDanceMem.has(key)) return true;
    fxDanceMem.add(key); return false;
  }
}
let fxDanceMem = null;
function fxDance(kidName) {
  if (!lastData || danceSeen(kidName)) return false;
  const a = fxActor(kidName);
  const w = document.createElement("div");
  w.className = "fx-dance" + (a.egg ? " egg" : "");
  w.innerHTML = `<div class="fx-bubble">다 했다! 🎉</div>`;
  w.appendChild(a.el);
  document.body.appendChild(w);
  // 춤 소리: 짧은 리듬
  [[659, 0], [784, 0.18], [659, 0.36], [988, 0.54]].forEach(([f, at]) => beep(f, at, 0.12, "square", 0.05));
  setTimeout(() => w.classList.add("bye"), 4200);
  setTimeout(() => w.remove(), 5000);
  return true;
}
// 루틴 체크 뒤: 그날 다 했으면(🎁 보너스가 붙었으면) 춤, 아니면 달리기
function fxAfterRoutine(kidName, dayDone) {
  if (dayDone && fxDance(kidName)) return;
  fxRun(kidName);
}
