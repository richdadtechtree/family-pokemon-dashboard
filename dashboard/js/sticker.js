/* 가족 대시보드 — 14-7. 스티커 팝업 (예전 칭찬 스티커 보기)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 공개 버전에는 스티커를 주는 메뉴가 없다. 예전 `⭐ 칭찬` 줄이 기록에 남아 있으면,
     아이가 자기 할 일 화면(#todo-N)에 들어올 때 아직 안 본 스티커를
     스티커 내용 → 그 스티커가 올린 포켓몬 레벨업 순으로 보여준다.
     새 스티커는 영어 퀴즈로 번다(퀴즈 스티커는 quiz.js가 따로 보여준다).
   - 누가 접속했는지: 할 일 화면이 아이마다 따로 있다(#todo-0 첫째·#todo-1 둘째).
     아이가 자기 이름을 눌러 들어오면 그 아이 거다. 따로 로그인·비밀번호 안 한다.
     거실 화면은 아이들이 함께 쓰지만, 들어온 화면이 곧 그 아이다.
   - 본 표시는 서버 sticker-shown.json 에(아이마다, 스티커마다 본 횟수) — 거실 화면·폰 어디서 봐도 한 번만.
   - 레벨업은 그 스티커가 올린 순간을 다시 보여준다(pokeEvent(kid, before) — before는 스티커 줄이
     아이 기록에서 몇 번째인지, 서버가 /api/sticker-pending 으로 알려 준다).
   - 아이는 자기 화면에서 따로 본다. */
"use strict";
let stickerShowing = false;
async function showStickerPopups(kidName) {
  if (stickerShowing || !lastData || DEMO) return;
  const kid = lastData.kids.find((k) => k.name === kidName);
  if (!kid) return;
  let list;
  try { list = (await post("/api/sticker-pending", { kid: kidName })).stickers || []; }
  catch (e) { return; }
  if (!list.length) return;
  stickerShowing = true;
  try {
    for (const s of list) {
      const wait2 = () => new Promise((res) => { const t = setInterval(() => { if (!document.querySelector(".celebrate, .ladder-bg")) { clearInterval(t); res(); } }, 400); });
      await wait2();                                               // 다른 축하 화면이 떠 있으면 끝난 뒤에
      const cv = currentView();
      if (cv.kind !== "todo" || (lastData.kids[cv.idx] || {}).name !== kidName) return;   // 할 일 화면을 떠났으면 다음에
      await celebrate(kid.skin, { kind: "sticker", reason: s.reason, giver: s.giver, date: s.date });
      const cv2 = currentView();
      if (cv2.kind !== "todo" || (lastData.kids[cv2.idx] || {}).name !== kidName) return;
      await celebrate(kid.skin, pokeEvent(kidName, s.before));    // 그 스티커가 올린 레벨업(부화·진화면 그 장면)
      try { await post("/api/sticker-shown", { kid: kidName, ids: [s.id] }); } catch (e) { /* 다음에 다시 보여 준다 */ }
    }
  } finally { stickerShowing = false; }
}
