/* 가족 대시보드 — 13. 사진 액자
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 2분 동안 아무도 화면을 안 만지면(절전): 큰 시계만. 22시~6시엔 아주 어두운 화면에 작은 시계(아빠 결정).
     2026-11-14 아빠 결정으로 사진 슬라이드쇼는 쓰지 않는다(FRAME_PHOTOS = true 로 되살릴 수 있다).
   - 화면을 한 번 누르거나 키를 누르면 바로 대시보드로(그 누름은 아래 화면에 전해지지 않는다).
   - 사진: 위키 폴더 안 사진액자/ (serve.py /api/photos). GitHub엔 올리지 않는다(.gitignore) — 서버에만 둔다.
   - 미리 보기: 주소 끝 ?frame=0.1 → 0.1분(6초) 만에 시계 화면 */
"use strict";
const FRAME_IDLE_MIN = params.has("frame") ? (+params.get("frame") || 0.1) : 5;   // 5분 동안 안 만지면 절전 시계 (2026-11-15 아빠 결정, 예전 2분)
const FRAME_PHOTOS = false;                      // 사진 슬라이드쇼(사진액자/) — 지금은 끔
const FRAME_NIGHT = [22, 6];                     // 이 시각 사이는 어두운 화면
const FRAME_EVERY = 10000;
let frameLast = Date.now(), frameOn = false, frameTimer = 0, framePhotos = [], frameIdx = 0;
const frameNight = (d = new Date()) => d.getHours() >= FRAME_NIGHT[0] || d.getHours() < FRAME_NIGHT[1];
["pointerdown", "keydown", "touchstart", "wheel"].forEach((ev) => document.addEventListener(ev, (e) => {
  frameLast = Date.now();
  if (frameOn) { e.preventDefault(); e.stopPropagation(); closeFrame(); }   // 액자를 닫는 누름은 아래로 안 보낸다
}, { capture: true, passive: false }));
async function openFrame() {
  if (frameOn) return;
  frameOn = true;
  if (!DEMO && FRAME_PHOTOS) {
    try { const j = await (await fetch("/api/photos", { cache: "no-store" })).json(); framePhotos = j.photos || []; } catch (e) { framePhotos = []; }
  }
  const night = frameNight();
  const fr = document.createElement("div");
  fr.id = "frame";
  fr.className = night ? "night" : framePhotos.length ? "photos" : "clock-only";
  fr.innerHTML = `<img class="fr-a" alt=""><img class="fr-b" alt=""><div class="fr-clock"></div>`;
  document.body.appendChild(fr);
  frameTick();
  if (!night && framePhotos.length) { frameIdx = Math.floor(Math.random() * framePhotos.length); frameShow(); }
}
function frameShow() {
  const fr = document.getElementById("frame");
  if (!fr || !framePhotos.length) return;
  const [show, hide] = fr.dataset.front === "a" ? [fr.querySelector(".fr-b"), fr.querySelector(".fr-a")] : [fr.querySelector(".fr-a"), fr.querySelector(".fr-b")];
  show.onload = () => { show.classList.add("on"); hide.classList.remove("on"); };
  show.src = CONFIG.wikiRoot + "사진액자/" + encodeURIComponent(framePhotos[frameIdx % framePhotos.length]);
  fr.dataset.front = show.classList.contains("fr-a") ? "a" : "b";
  frameIdx++;
  frameTimer = setTimeout(frameShow, FRAME_EVERY);
}
function frameTick() {
  const c = document.querySelector("#frame .fr-clock");
  if (!c) return;
  const d = new Date();
  c.innerHTML = `<b>${d.getHours() % 12 || 12}:${pad(d.getMinutes())}</b><span>${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일</span>`;
}
function closeFrame() {
  frameOn = false; clearTimeout(frameTimer);
  document.getElementById("frame")?.remove();
}
setInterval(() => {
  if (frameOn) { frameTick(); return; }
  if (Date.now() - frameLast >= FRAME_IDLE_MIN * 60000 && !document.querySelector(".celebrate, .sheet-bg, .ladder-bg")) openFrame();
}, 2000);
