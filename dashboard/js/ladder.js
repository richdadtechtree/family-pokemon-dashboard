/* 가족 대시보드 — 2-4. 동산 사다리: 동산 포켓몬이 5마리 늘 때마다(5·10·15…) 사다리타기 한 번 → 💗 엄마와 데이트 / 💙 아빠와 데이트 쿠폰
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 탈 수 있는지: 동산 마릿수(기록 줄 수 ÷ 28) ≥ m 이고, 쿠폰.md 에 '동산 m마리 사다리' 까닭의 줄이 아직 없을 때. 서버(take_ladder)도 같은 규칙으로 막는다.
   - 아이 화면(동산·할 일)을 열면 한 번 저절로 뜨고, 닫아도 쿠폰함의 '🪜 사다리 타기' 버튼으로 다시 열 수 있다. */
"use strict";
const LADDER_STEP = 5;
const LADDER_PRIZES = ["💗 엄마와 데이트", "💙 아빠와 데이트"];
const LADDER_COLS = 4, LADDER_ROWS = 8;
const ladderWhy = (m) => `동산 ${m}마리 사다리`;
// 아직 안 탄 가장 작은 단계(5·10·15…) — 없으면 0
function ladderPending(data, kid) {
  const garden = pokeState(kid, (data.pokeCounts || {})[kid] || 0).garden.length;   // 졸업 + 동산 장부(찾아옴·교환)
  const taken = new Set((data.coupons || []).filter((c) => c.kid === kid).map((c) => c.why));
  for (let m = LADDER_STEP; m <= garden; m += LADDER_STEP) if (!taken.has(ladderWhy(m))) return m;
  return 0;
}
const ladderAutoShown = new Set();         // 저절로 뜨는 건 이 화면을 연 동안 단계마다 한 번
function maybeAutoLadder(data, i) {
  const k = data.kids[i];
  const m = k && ladderPending(data, k.name);
  if (!m || ladderAutoShown.has(`${k.name}#${m}`) || document.querySelector(".celebrate, .ladder-bg, .sheet-bg")) return;
  ladderAutoShown.add(`${k.name}#${m}`);
  openLadder(k, m);
}
const ladderBtnHtml = (data, k) => {
  const m = ladderPending(data, k.name);
  return m ? `<button type="button" class="ladder-go" data-ladder="${escapeHtml(k.name)}">🪜 동산 ${m}마리 기념 사다리 타기!</button>` : "";
};

function openLadder(k, m) {
  document.querySelector(".ladder-bg")?.remove();
  // 아래 상품: 💗 2개 · 💙 2개를 섞는다
  const prizes = [0, 1, 0, 1].sort(() => Math.random() - 0.5).map((j) => LADDER_PRIZES[j]);
  // 가로줄: 줄마다 이웃한 두 세로줄 사이에 50% — 같은 줄에서 붙어 있는 가로줄은 만들지 않는다
  const rungs = Array.from({ length: LADDER_ROWS }, () => {
    const row = Array(LADDER_COLS - 1).fill(false);
    for (let j = 0; j < LADDER_COLS - 1; j++) if (!(j > 0 && row[j - 1]) && Math.random() < 0.5) row[j] = true;
    return row;
  });
  // 줄마다 가로줄이 하나도 없으면 하나 넣어 둔다(너무 단순하지 않게)
  rungs.forEach((row) => { if (!row.some(Boolean)) row[Math.floor(Math.random() * (LADDER_COLS - 1))] = true; });
  const W = 360, H = 300, top = 20, gap = (H - 2 * top) / LADDER_ROWS;
  const X = (c) => 45 + c * ((W - 90) / (LADDER_COLS - 1));
  const Y = (r) => top + (r + 0.5) * gap;
  const lines = [...Array(LADDER_COLS).keys()].map((c) => `<line x1="${X(c)}" y1="${top}" x2="${X(c)}" y2="${H - top}" />`).join("") +
    rungs.flatMap((row, r) => row.map((on, j) => (on ? `<line x1="${X(j)}" y1="${Y(r)}" x2="${X(j + 1)}" y2="${Y(r)}" />` : ""))).join("");
  const bg = document.createElement("div");
  bg.className = "ladder-bg";
  bg.innerHTML = `<div class="ladder" style="--c:${k.skin.bar}">
    <h2>🌳 동산 포켓몬 ${m}마리! 🪜</h2><p>${escapeHtml(k.name)}, 출발할 번호를 골라요</p>
    <div class="lad-top">${[...Array(LADDER_COLS).keys()].map((c) => `<button type="button" data-lad-start="${c}" style="left:${(X(c) / W) * 100}%">${c + 1}</button>`).join("")}</div>
    <svg viewBox="0 0 ${W} ${H}" class="lad-svg"><g class="lad-lines">${lines}</g><polyline class="lad-path" points="" /></svg>
    <div class="lad-bottom">${prizes.map((p, c) => `<span data-lad-end="${c}" style="left:${(X(c) / W) * 100}%">${p.split(" ")[0]}<small>${escapeHtml(p.split(" ")[1])}</small></span>`).join("")}</div>
    <div class="lad-msg"></div>
    <button type="button" class="lad-close">나중에 할래요</button></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelector(".lad-close").addEventListener("click", close);
  let busy = false;
  bg.querySelectorAll("[data-lad-start]").forEach((b) => b.addEventListener("click", async () => {
    if (busy) return;
    busy = true; audio();
    bg.querySelectorAll("[data-lad-start]").forEach((x) => { x.disabled = true; x.classList.toggle("on", x === b); });
    bg.querySelector(".lad-close").hidden = true;
    bg.querySelector("p").textContent = "내려가는 중…";
    // 길 찾기: 줄마다 오른쪽 가로줄이 있으면 오른쪽, 왼쪽에 있으면 왼쪽으로
    let c = +b.dataset.ladStart;
    const pts = [[X(c), top]];
    for (let r = 0; r < LADDER_ROWS; r++) {
      pts.push([X(c), Y(r)]);
      if (rungs[r][c]) c++; else if (c > 0 && rungs[r][c - 1]) c--;
      pts.push([X(c), Y(r)]);
    }
    pts.push([X(c), H - top]);
    const path = bg.querySelector(".lad-path");
    // 한 칸씩 그리며 삑 — 점이 늘어날 때마다 소리
    for (let n = 1; n <= pts.length; n++) {
      path.setAttribute("points", pts.slice(0, n).map((p) => p.join(",")).join(" "));
      if (n % 2 === 0) beep(440 + n * 30, 0, 0.06, "square", 0.05);
      await wait(110);
    }
    const prize = prizes[c];
    bg.querySelector(`[data-lad-end="${c}"]`).classList.add("on");
    try {
      await post("/api/ladder", { kid: k.name, m, prize });
      SFX.fanfare();
      bg.querySelector("p").textContent = "";
      bg.querySelector(".lad-msg").innerHTML = `<b>${escapeHtml(prize)}</b> 쿠폰을 받았어요! 🎉<br><small>쿠폰함에 넣어 뒀어요</small>`;
    } catch (e) {
      bg.querySelector(".lad-msg").textContent = "⚠️ " + e.message;
    }
    const ok = bg.querySelector(".lad-close");
    ok.textContent = "좋아요!"; ok.hidden = false;
    ok.addEventListener("click", () => refreshWiki(), { once: true });
  }));
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-ladder]");
  if (!b || !lastData) return;
  const k = lastData.kids.find((x) => x.name === b.dataset.ladder), m = k && ladderPending(lastData, k.name);
  if (m) openLadder(k, m);
});
