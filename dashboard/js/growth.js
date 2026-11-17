/* 가족 대시보드 — 8. 키 나무 (성장 기록)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 아이들/성장 기록.md | 날짜 | 아이 | 키(cm) | 몸무게(kg) | 를 읽어, 아이 동산에 '키 나무'를 그린다.
     키가 기록될 때마다 나무가 한 칸 자라고, 칸 옆에 cm 눈금과 날짜가 붙는다(최근 8칸까지).
   - 몸무게는 아이가 동산 화면에서 숫자 패드로 적는다(serve.py /api/growth {kid, weight}).
     키는 부모만 적는다(서버도 부모 확인이 없으면 막는다).
   - 성장 백분위는 계산·어림하지 않는다(AGENTS.md 아이 기록 규칙). 화면에는 숫자와 나무만. */
"use strict";
const TREE_MAX = 8;
function growthCardHtml(data, k) {
  const rows = (data.growth || {})[k.name] || [];
  const hs = rows.filter((r) => r.height != null);
  const ws = rows.filter((r) => r.weight != null);
  const md = (s) => s.slice(5).replace("-", "/");
  const shown = hs.slice(-TREE_MAX);
  // 나무: 아래가 처음, 위가 최근. 칸마다 줄기 + 잎, 옆에 cm·날짜
  const rings = shown.map((r, i) => `<div class="tree-ring ${i === shown.length - 1 ? "top" : ""}"><span class="trunk"></span><span class="leaf l${i % 2}">🌿</span>
      <span class="tick"><b>${r.height}cm</b><small>${md(r.date)}</small></span></div>`).reverse().join("");
  const last = hs[hs.length - 1], prev = hs[hs.length - 2];
  const grew = last && prev ? Math.round((last.height - prev.height) * 10) / 10 : null;
  const lw = ws[ws.length - 1];
  return `<div class="gc-card growth"><h3>🌳 ${escapeHtml(k.name)} 키 나무</h3>
    <div class="tree">${hs.length ? `<div class="tree-crown">${hs.length > 1 ? "🌳" : "🌱"}</div>${rings}` : `<div class="empty">아직 키 기록이 없어요.<br>엄마·아빠가 키를 재서 적으면 나무가 자라요 🌱</div>`}<div class="tree-pot"></div></div>
    <div class="growth-now">${last ? `키 <b>${last.height}cm</b>${grew != null && grew > 0 ? ` <small>(지난번보다 +${grew}cm)</small>` : ""}` : ""}
      ${lw ? `<span>몸무게 <b>${lw.weight}kg</b> <small>${md(lw.date)}</small></span>` : ""}</div>
    <button type="button" class="weight-go" data-weight="${escapeHtml(k.name)}">⚖️ 몸무게 적기</button></div>`;
}

// 몸무게 숫자 패드 (아이용) — 숫자·점·지우기, 2~150kg
function openWeightPad(kidName) {
  document.querySelector(".sheet-bg.wpad")?.remove();
  let val = "";
  const bg = document.createElement("div");
  bg.className = "sheet-bg wpad";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
  bg.innerHTML = `<div class="sheet"><h2>⚖️ ${escapeHtml(kidName)} 몸무게</h2>
    <div class="wp-val"><b>-</b> kg</div><div class="pin-msg"></div>
    <div class="pin-pad">${keys.map((k) => `<button type="button" data-wk="${k}" class="${k === "del" ? "del" : ""}">${k === "del" ? "⌫" : k}</button>`).join("")}</div>
    <div class="wp-btns"><button type="button" class="wp-cancel">닫기</button><button type="button" class="wp-ok">적기</button></div></div>`;
  document.body.appendChild(bg);
  const show = () => { bg.querySelector(".wp-val b").textContent = val || "-"; };
  bg.addEventListener("click", async (ev) => {
    const k = ev.target.closest("[data-wk]");
    if (ev.target === bg || ev.target.closest(".wp-cancel")) return bg.remove();
    if (k) {
      const c = k.dataset.wk;
      if (c === "del") val = val.slice(0, -1);
      else if (c === ".") { if (val && !val.includes(".")) val += "."; }   // 점은 한 번, 숫자 뒤에만
      else if (val.includes(".")) { if (val.split(".")[1].length < 1) val += c; }   // 소수점 아래는 한 자리
      else if (val.length < 3) val += c;                                   // 정수는 세 자리까지
      show();
      return;
    }
    if (ev.target.closest(".wp-ok")) {
      const w = parseFloat(val);
      if (!(w >= 2 && w <= 150)) { bg.querySelector(".pin-msg").textContent = "몸무게를 다시 확인해 주세요"; return; }
      try {
        await post("/api/growth", { kid: kidName, weight: w });
        bg.remove(); SFX.ding(); toast(`몸무게 ${w}kg 적었어요 ⚖️`, "lv");
        await refreshWiki();
      } catch (e) { bg.querySelector(".pin-msg").textContent = "⚠️ " + e.message; }
    }
  });
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-weight]");
  if (b) openWeightPad(b.dataset.weight);
});
