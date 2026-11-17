/* 가족 대시보드 — 9. 영어 단어 퀴즈 (협동)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 아이들/영어 단어.md (| 그림 | 단어 | 뜻 |, 초등 1~2학년) 에서 하루 한 문제 — 날짜·아이로 정해져서 새로고침해도 같다.
   - 그림 보고 4개 중 고르기 → 틀리면 한 번 더 → 맞히면 🔊 들어 보기 + 🎤 따라 읽기(음성 인식) → 성공하면 ⭐ 스티커 1장.
     음성 인식이 안 되는 기기는 부모가 '들었어요'로 표시한다(서버 /api/quiz heard=true).
     '들었어요'로 준 스티커는 부모 화면에서 바로 축하하지 않고, 아이가 자기 동산(#garden-N)에 들어갈 때
     스티커 내용 → 레벨업 순으로 보여준다(9-1, showQuizHeardPopups). 직접 따라 읽은 성공은 그 자리에서 바로 축하.
   - 💡 힌트(첫 글자)는 형제가 옆에서 눌러 주라고 둔 버튼. 아이들이 모두 오늘 받으면 '영어 팀 완성!'.
   - 하루 아이당 1장(서버 give_quiz 가 막는다). 틀린 횟수·맞힘·힌트는 이 기기에만 기억(localStorage). */
"use strict";
const QUIZ_MARK = "⭐ 영어 퀴즈";
const QUIZ_KEY = "quizState";
// pokeHash(djb2)는 33을 곱해 가서 3·11로 나눈 나머지가 끝 글자로만 정해진다 → 퀴즈는 한 번 더 고르게 섞어서 쓴다
// (pokeHash 자체를 바꾸면 이미 정해진 포켓몬이 바뀌므로 그대로 둔다)
function quizHash(s) {
  let h = pokeHash(s);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
// 이 아이가 그날 전까지 ⭐ 스티커를 받은(맞힌) 단어 — 다시 내지 않는다. 틀린 단어는 스티커가 없으니 다시 나올 수 있다
const quizWordOf = (routine) => routine.slice(QUIZ_MARK.length).trim().toLowerCase();
function quizFor(data, kid, day = ymd(new Date())) {
  const W = data.words || [];
  if (W.length < 4) return null;
  const rows = ((data.pokeRows || {})[kid] || []).filter((r) => r.routine.startsWith(QUIZ_MARK));
  const todayRow = rows.find((r) => r.date === day);
  const solved = new Set(rows.filter((r) => r.date < day).map((r) => quizWordOf(r.routine)));
  // 오늘 이미 받았으면 그 단어 그대로(카드에 '다 했어요'), 아니면 아직 안 맞힌 단어 중에서 날짜·아이로 정해서
  let ans = todayRow && W.find((w) => w.word.toLowerCase() === quizWordOf(todayRow.routine));
  if (!ans) {
    const pool = W.filter((w) => !solved.has(w.word.toLowerCase()));
    const P = pool.length ? pool : W;                                    // 다 맞혔으면 처음부터 다시
    ans = P[quizHash(`quiz#${day}#${kid}`) % P.length];
  }
  const picks = [ans];
  for (let j = 1; picks.length < 4 && j < 60; j++) {
    const w = W[quizHash(`quiz#${day}#${kid}#${j}`) % W.length];
    if (!picks.includes(w)) picks.push(w);
  }
  const choices = picks.map((w, i) => ({ w, o: quizHash(`${day}#${kid}#o#${i}`) })).sort((a, b) => a.o - b.o).map((x) => x.w);
  return { ans, choices };
}
const quizDone = (data, kid) => ((data.pokeRows || {})[kid] || []).some((r) => r.date === ymd(new Date()) && r.routine.startsWith(QUIZ_MARK));
// 이 기기의 오늘 상태 { tries, solved, hint }
function quizState(kid) {
  const key = `${ymd(new Date())}|${kid}`;
  let all = {};
  try { all = JSON.parse(localStorage.getItem(QUIZ_KEY) || "{}"); } catch (e) { all = quizMem; }
  return { key, st: all[key] || { tries: 0, solved: false, hint: false }, all };
}
let quizMem = {};
function quizSave(kid, st) {
  const { key, all } = quizState(kid);
  const today = ymd(new Date());
  const keep = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(today)));   // 지난날 것은 버린다
  keep[key] = st;
  try { localStorage.setItem(QUIZ_KEY, JSON.stringify(keep)); } catch (e) { quizMem = keep; }
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function quizCardHtml(data, i) {
  const k = data.kids[i], q = k && quizFor(data, k.name);
  if (!q) return "";
  const nth = ["첫째", "둘째", "셋째", "넷째"][i] || `${i + 1}번째`;
  const team = data.kids.filter((x) => quizDone(data, x.name)).length;
  const teamLine = data.kids.length > 1 ? `<span class="qz-team">영어 팀 ${team}/${data.kids.length}</span>` : "";
  const head = `<h3>🔤 오늘의 영어 <small>${nth} 문제</small>${teamLine}</h3>`;
  const a = q.ans;
  if (quizDone(data, k.name)) {
    return `<div class="quiz done">${head}<div class="qz-big">${escapeHtml(a.emoji)}</div><div class="qz-msg">✅ <b>${escapeHtml(a.word)}</b> (${escapeHtml(a.mean)}) 다 했어요! ⭐ 스티커 받았어요. 내일 또 만나요</div></div>`;
  }
  const { st } = quizState(k.name);
  if (st.tries >= 2 && !st.solved) {
    return `<div class="quiz">${head}<div class="qz-big">${escapeHtml(a.emoji)}</div><div class="qz-msg">아쉬워요! 정답은 <b>${escapeHtml(a.word)}</b> (${escapeHtml(a.mean)})예요. 내일 또 해요 💪</div>
      <button type="button" class="qz-btn" data-quiz="say" data-word="${escapeHtml(a.word)}">🔊 들어 보기</button></div>`;
  }
  if (st.solved) {
    return `<div class="quiz">${head}<div class="qz-big">${escapeHtml(a.emoji)}</div><div class="qz-word">${escapeHtml(a.word)} <small>${escapeHtml(a.mean)}</small></div>
      <div class="qz-msg">정답! 이제 소리 내어 따라 읽어 봐요</div>
      <div class="qz-row"><button type="button" class="qz-btn" data-quiz="say" data-word="${escapeHtml(a.word)}">🔊 들어 보기</button>
      ${SR ? `<button type="button" class="qz-btn go" data-quiz="read" data-kid="${escapeHtml(k.name)}" data-word="${escapeHtml(a.word)}">🎤 따라 읽기</button>` : ""}</div>
      <div class="qz-tip">${SR ? "잘 안 되면 " : "이 기기는 따라 읽기를 못 들어요. "}엄마·아빠에게 들려주고, 엄마·아빠 메뉴에서 '들었어요'를 눌러 달라고 해요</div></div>`;
  }
  const hint = st.hint ? `<div class="qz-hint">💡 첫 글자는 <b>${escapeHtml(a.word[0])}</b></div>` : "";
  return `<div class="quiz">${head}<div class="qz-big">${escapeHtml(a.emoji)}</div><div class="qz-msg">이 그림은 영어로 뭘까요?${st.tries ? " <b>한 번 더!</b>" : ""}</div>${hint}
    <div class="qz-choices">${q.choices.map((w) => `<button type="button" class="qz-choice" data-quiz="pick" data-kid="${escapeHtml(k.name)}" data-word="${escapeHtml(w.word)}">${escapeHtml(w.word)}</button>`).join("")}</div>
    ${st.hint ? "" : `<button type="button" class="qz-hint-btn" data-quiz="hint" data-kid="${escapeHtml(k.name)}">💡 힌트 (형제가 눌러 줘요)</button>`}</div>`;
}
function quizSay(word) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US"; u.rate = 0.8;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { /* 소리 내기를 못 하는 기기 */ }
}
const rerenderKid = () => { const v = currentView(); if (v.kind === "todo" && lastData) renderKidTodo(lastData, v.idx); };
async function quizGive(kid, word, heard = false) {
  const before = ((lastData && lastData.pokeCounts) || {})[kid] || 0;
  const r = await post("/api/quiz", { kid, word, heard });
  if (heard) { await refreshWiki(); return r; }   // 9-1. '들었어요'는 부모 화면에서 바로 축하하지 않는다 —
  // 아이가 자기 동산에 들어갈 때 showQuizHeardPopups 가 스티커 내용 → 레벨업 순으로 보여준다.
  const k = lastData && lastData.kids.find((x) => x.name === kid);
  if (k) {
    celebrate(k.skin, pokeEvent(kid, before)).then(() => (r && r.all ? celebrate(k.skin, { kind: "quizteam" }) : null));
  }
  await refreshWiki();
  return r;
}

// 9-1. '들었어요' 영어 스티커 미루기 (2026-11-17 아빠 요청): 엄마·아빠가 '들었어요'로 준 건 아이가
// 자기 동산(#garden-N)에 들어갈 때 스티커 내용 → 그 스티커가 올린 레벨업 순으로 보여준다.
// 본 표시는 서버 quiz-heard-pending.json 에 — 거실·폰 어디서 봐도 한 번만. 할 일 화면에서는 안 뜬다.
let quizHeardShowing = false;
async function showQuizHeardPopups(kidName) {
  if (quizHeardShowing || !lastData || DEMO) return;
  const kid = lastData.kids.find((k) => k.name === kidName);
  if (!kid) return;
  let list;
  try { list = (await post("/api/quiz-heard-pending", { kid: kidName })).quizzes || []; }
  catch (e) { return; }
  if (!list.length) return;
  quizHeardShowing = true;
  try {
    for (const q of list) {
      const wait2 = () => new Promise((res) => { const t = setInterval(() => { if (!document.querySelector(".celebrate, .ladder-bg")) { clearInterval(t); res(); } }, 400); });
      await wait2();                                               // 다른 축하 화면이 떠 있으면 끝난 뒤에
      const cv = currentView();
      if (cv.kind !== "garden" || (lastData.kids[cv.idx] || {}).name !== kidName) return;   // 동산을 떠났으면 다음에
      const w = (lastData.words || []).find((x) => x.word && x.word.toLowerCase() === (q.word || "").toLowerCase());
      await celebrate(kid.skin, { kind: "quizheard", word: q.word, emoji: w ? w.emoji : "", mean: w ? w.mean : "", giver: q.giver, date: q.date });
      const cv2 = currentView();
      if (cv2.kind !== "garden" || (lastData.kids[cv2.idx] || {}).name !== kidName) return;
      await celebrate(kid.skin, pokeEvent(kidName, q.before));    // 그 스티커가 올린 레벨업(부화·진화면 그 장면)
      try { await post("/api/quiz-heard-shown", { kid: kidName, ids: [q.id] }); } catch (e) { /* 다음에 다시 보여 준다 */ }
    }
  } finally { quizHeardShowing = false; }
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-quiz]");
  if (!b || !lastData) return;
  const act = b.dataset.quiz, kid = b.dataset.kid;
  if (act === "say") return quizSay(b.dataset.word);
  const q = kid && quizFor(lastData, kid);
  if (!q) return;
  const { st } = quizState(kid);
  if (act === "hint") { st.hint = true; quizSave(kid, st); return rerenderKid(); }
  if (act === "pick") {
    audio();
    if (b.dataset.word === q.ans.word) { st.solved = true; quizSave(kid, st); SFX.levelup(); quizSay(q.ans.word); }
    else { st.tries += 1; quizSave(kid, st); beep(220, 0, 0.25, "square", 0.08, 150); toast(st.tries >= 2 ? "아쉬워요! 내일 또 해요" : "다시 한 번! 💪"); }
    return rerenderKid();
  }
  if (act === "read" && SR) {                                     // 🎤 따라 읽기 — 영어로 들어서 단어가 들리면 성공
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 5;
    b.disabled = true; b.textContent = "🎤 듣는 중… 말해 봐요!";
    const want = q.ans.word.toLowerCase().replace(/\s/g, "");
    let ok = false;
    rec.onresult = (e) => {
      const said = [...e.results[0]].map((x) => x.transcript.toLowerCase().replace(/\s/g, ""));
      ok = said.some((s) => s.includes(want) || want.includes(s) && s.length >= want.length - 1);
    };
    rec.onerror = () => { /* 마이크 거부·소리 없음 — onend 에서 다시 하기 안내 */ };
    rec.onend = async () => {
      if (ok) {
        try { await quizGive(kid, q.ans.word); toast("잘 읽었어요! ⭐ 스티커 +1", "lv"); }
        catch (e) { toast("⚠️ " + e.message); rerenderKid(); }
      } else { toast("잘 못 들었어요. 한 번 더 또박또박!"); rerenderKid(); }
    };
    try { rec.start(); } catch (e) { toast("⚠️ 마이크를 쓸 수 없어요 — 엄마·아빠에게 들려줘요"); rerenderKid(); }
  }
});
