/* 가족 대시보드 — 10-3. 포켓몬이 친구를 데려와요 (2026-11-15 아빠 요청 — 예전 '찾아오는 몬스터')
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 아이 화면(동산·할 일)을 열면 서버(/api/visit)에 그날 뽑기를 묻는다. 서버가 아침 7시 이후 하루 한 번만 뽑고
     (2% + 동산 수×0.1%, 최대 5%), 당첨이면 이 아이가 아직 못 만난 포켓몬(도감 그림자 칸) 중 하나가 동산 장부에 들어온다.
   - 데려오는 포켓몬(bringer): 동산 포켓몬 중 하나(날짜로 정함), 동산이 비었으면 지금 키우는 포켓몬. 장부 까닭은 '파이리가 데려옴'.
     알만 있으면 '찾아옴'.
   - 데려온 친구는 그 아이 '○○ 동산' 메뉴에 들어가면 팝업으로 보인다(그림자가 흔들리다 번쩍 → 어떻게 생겼는지).
     다른 화면이면 '동산에 가 보세요' 알림만.
   - 본 표시는 서버 friend-shown.json 에(아이마다, 친구마다 본 횟수) — 거실 화면·폰 어디서 봐도 한 번만.
     (2026-11-17 버그 고침: 예전엔 기기마다 localStorage라 다른 기기에서 다시 떴고, 동산을 떠난 친구의 들어온 줄도
     14일 안이면 팝업이 떴다. 이제 안 본 친구 목록은 서버 /api/friend-pending 이 정한다 — 동산을 떠난 친구는 안 보인다.)
   - 진화할 수 있는 친구면 팝업에 알려 주고, 지금 포켓몬을 다 키운 뒤 알 대신 그 친구를 골라 진화시킬 수 있다(kid.js eggPickerHtml).
   - 예시 화면은 ?visit 을 붙이면 반드시 데려온다(시험용). */
"use strict";
const visitAsked = new Set();                  // 이 화면을 연 동안 아이마다 한 번만 서버에 묻는다
// 이 아이의 동산 포켓몬 중 오늘 친구를 데려올 포켓몬 — 동산이 비면 지금 키우는 포켓몬, 알뿐이면 없음
function friendBringer(kidName) {
  const st = pokeState(kidName, (lastData.pokeCounts || {})[kidName] || 0);
  const g = (st.garden || []).filter((x) => x.name);
  if (g.length) return g[pokeHash(`${ymd(new Date())}#${kidName}#bring`) % g.length].name;
  return st.cur ? st.cur[1] : "";
}
async function checkVisit(kidName) {
  const key = `${ymd(new Date())}|${kidName}`;
  if (!lastData || visitAsked.has(key)) return;
  visitAsked.add(key);
  const st = pokeState(kidName, (lastData.pokeCounts || {})[kidName] || 0);
  const met = new Set(st.met || []);
  const candidates = DEX_ALL.filter(([d]) => !met.has(d)).map(([dex, name]) => ({ dex, name }));
  let r;
  try { r = await post("/api/visit", { kid: kidName, candidates, bringer: friendBringer(kidName) }); } catch (e) { return; }
  const v = r && r.visit;
  if (!v) return;
  if (r.changed) await refreshWiki();                              // 방금 들어왔으면 동산·도감을 새로 그린다(동산 화면이면 팝업도)
  const cv = currentView(), here = cv.kind === "garden" && (lastData.kids[cv.idx] || {}).name === kidName;
  if (here) showFriendPopups(kidName);
  else {
    // 오늘 온 친구가 아직 안 본 친구면 '동산에 가 보세요' 알림 (본 표시는 서버에 — 거실·폰 어디서 봐도 한 번만)
    let pending = [];
    try { pending = (await post("/api/friend-pending", { kid: kidName })).friends || []; } catch (e) { /* 다음에 다시 보여 준다 */ }
    if (pending.length) toast(`🌳 ${kidName} 동산에 누가 놀러 왔어요! 동산에 가 보세요`, "lv");
  }
}

// 서버 /api/friend-pending 가 정한 아직 안 본 친구만 동산 화면에서 하나씩 팝업 (동산을 떠난 친구는 서버가 빼고 준다)
let friendShowing = false;
async function showFriendPopups(kidName) {
  if (friendShowing || !lastData) return;
  let rows;
  try { rows = (await post("/api/friend-pending", { kid: kidName })).friends || []; } catch (e) { return; }
  if (!rows.length) return;
  friendShowing = true;
  try {
    for (const r of rows) {
      const wait2 = () => new Promise((res) => { const t = setInterval(() => { if (!document.querySelector(".celebrate, .ladder-bg")) { clearInterval(t); res(); } }, 400); });
      await wait2();                                               // 다른 축하 화면이 떠 있으면 끝난 뒤에
      const cv = currentView();
      if (cv.kind !== "garden" || (lastData.kids[cv.idx] || {}).name !== kidName) return;   // 동산을 떠났으면 다음에
      try { await post("/api/friend-shown", { kid: kidName, ids: [r.id] }); } catch (e) { /* 다음에 다시 보여 준다 */ }
      const k = lastData.kids.find((x) => x.name === kidName);
      const m = r.why.match(/^(.+?)[이가] 데려옴$/);
      await celebrate(k ? k.skin : KID_SKINS[0], { kind: "visit", dex: r.dex, name: r.name, kid: kidName, bringer: m ? m[1] : "", evo: friendEvolvable(r.dex) });
    }
  } finally { friendShowing = false; }
}
