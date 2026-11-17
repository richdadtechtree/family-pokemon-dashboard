/* 가족 대시보드 — 10-2. 아이별 포켓몬 도감
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 전체 = 포켓몬 목록(pokemon.js POKE_ALL)의 모든 모습(이브이 진화형 포함). 만난 것 = pokeState().met
     (키운 계열의 모든 모습 + 지금 키우는 포켓몬의 지금까지 모습 + 동산 장부로 찾아온·교환해 온 포켓몬).
   - 동산 화면에는 '📖 도감 n/전체' 카드, 누르면 큰 창: 만난 칸은 그림·이름·등급·종족값, 못 만난 칸은 검은 그림자 + ? + 등급 배지만(2026-11-15 아빠 요청 — 이름·종족값은 안 보임).
   - 알인 동안의 포켓몬은 만난 것이 아니다(알 속을 보여 주지 않는 규칙). */
"use strict";
const DEX_ALL = (() => {
  const seen = new Map();
  for (const e of POKE_ALL) for (const s of e.chain) for (const p of (Array.isArray(s[0]) ? s : [s])) if (!seen.has(p[0])) seen.set(p[0], p[1]);
  return [...seen.entries()].sort((a, b) => a[0] - b[0]);
})();
function dexOf(data, kidName) {
  const st = pokeState(kidName, (data.pokeCounts || {})[kidName] || 0);
  const met = new Set(st.met || []);
  return { met, n: DEX_ALL.filter(([d]) => met.has(d)).length, total: DEX_ALL.length };
}
function dexCardHtml(data, k) {
  const d = dexOf(data, k.name);
  return `<div class="gc-card dex-card"><h3>📖 ${escapeHtml(k.name)} 도감</h3>
    <div class="dex-sum"><b>${d.n}</b> / ${d.total}<div class="bar"><i style="width:${Math.round((d.n / d.total) * 100)}%;background:${k.skin.bar}"></i></div></div>
    <button type="button" class="weight-go" data-dex="${escapeHtml(k.name)}">📖 도감 열기</button></div>`;
}
function openDex(kidName) {
  if (!lastData) return;
  document.querySelector(".sheet-bg.dex")?.remove();
  const d = dexOf(lastData, kidName);
  const cell = ([dex, name]) => d.met.has(dex)
    ? `<div class="dex-cell met"><img loading="lazy" src="${POKE_SPRITE(dex)}" alt="${escapeHtml(name)}"><span>${escapeHtml(name)}${pokeTierBadge(dex)}</span><span class="bst">종족값 ${POKE_BST[dex] || ""}</span></div>`
    : `<div class="dex-cell"><img loading="lazy" class="silhouette" src="${POKE_SPRITE(dex)}" alt="?"><span>?${pokeTierBadge(dex)}</span></div>`;
  const bg = document.createElement("div");
  bg.className = "sheet-bg dex";
  bg.innerHTML = `<div class="sheet"><h2>📖 ${escapeHtml(kidName)} 도감 <small>${d.n} / ${d.total}마리 만났어요</small><button type="button" class="dex-close">닫기</button></h2>
    <div class="dex-grid">${DEX_ALL.map(cell).join("")}</div></div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", (ev) => { if (ev.target === bg || ev.target.closest(".dex-close")) bg.remove(); });
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-dex]");
  if (b) openDex(b.dataset.dex);
});
