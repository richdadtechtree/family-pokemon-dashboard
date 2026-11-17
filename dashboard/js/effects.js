/* 가족 대시보드 — 6-11. 레벨업·부화·진화 축하 화면
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 6-11. 레벨업·부화·진화 축하 화면
   루틴 하나를 누르기 전 개수(before)와 누른 뒤(before+1)의 포켓몬 상태를 비교해 무슨 일이 일어났는지 정한다. */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function pokeEvent(kid, before) {
  const b = pokeState(kid, before), a = pokeState(kid, before + 1);
  if (a.total % POKE_CYCLE_LEN === 0 && b.chain.length) {   // Lv.15 최종 진화 → 동산으로
    const last = b.chain[b.chain.length - 1];
    return { kind: b.cur && b.cur[0] !== last[0] ? "evolve" : "grown", from: b.cur, to: last, final: true, st: b };
  }
  if (a.needPick) return { kind: "pickwait", st: a };                               // 알을 아직 안 골랐을 때
  if (!b.cur && a.cur) return { kind: "hatch", to: a.cur, st: a };                  // 알 → 부화
  if (b.friend && a.friend && b.n === a.n && b.cur[0] !== a.cur[0])                 // 데려온 친구가 Lv.15 → 진화
    return { kind: "evolve", from: b.cur, to: a.cur, st: a };
  if (b.cur && b.nextAt === 10 && a.nextAt === 15)                                  // 1단계 → 2단계 진화
    return { kind: a.cur[0] !== b.cur[0] ? "evolve" : "grown", from: b.cur, to: a.cur, st: a };   // (전설처럼 모습이 같으면 '더 강해졌어요')
  return { kind: a.cur ? "level" : "crack", st: a };                                // 보통 레벨업 / 알에 금
}
// 레벨이 한 번에 여러 개 오를 때(보너스) 그사이 가장 큰 일: 최종 진화 > 진화 > 부화 > 알 고르기 > 레벨업
const EVENT_RANK = { evolve: 4, grown: 4, hatch: 3, pickwait: 2, level: 1, crack: 1 };
const eventRank = (e) => (e ? (EVENT_RANK[e.kind] || 0) + (e.final ? 1 : 0) : -1);
function pokeEventRange(kid, from, n) {
  let best = null;
  for (let i = 0; i < n; i++) { const e = pokeEvent(kid, from + i); if (eventRank(e) > eventRank(best)) best = e; }
  return best;
}
// 루틴 하나 체크 → 축하. 하루 완료 보너스(+n)가 붙었으면 🎁 장면, 그사이 부화·진화가 있었으면 그 장면까지 이어서
// 형제 보너스(team)가 붙었으면 🤝 장면도
async function celebrateRoutine(skin, kid, before, bonus = 0, team = 0, coupon = 0) {
  await celebrate(skin, pokeEvent(kid, before));
  bonus = Math.max(0, bonus); team = Math.max(0, team);
  if (bonus) await celebrate(skin, { kind: "bonus", n: bonus, st: pokeState(kid, before + 1 + bonus) });
  if (team) await celebrate(skin, { kind: "team", n: team, st: pokeState(kid, before + 1 + bonus + team) });
  if (coupon > 0) {                               // 쿠폰 이름은 방금 받은 것(새로 읽은 쿠폰.md)에서
    const c = lastData && (lastData.coupons || []).filter((x) => x.kid === kid && !x.used).pop();
    await celebrate(skin, { kind: "coupon", name: c ? c.name : "🏪 주간 보상", st: pokeState(kid, before + 1) });
  }
  if (!bonus && !team) return;
  const big = pokeEventRange(kid, before + 1, bonus + team);
  if (eventRank(big) >= 3) await celebrate(skin, big);
}
async function celebrate(skin, ev) {
  document.querySelector(".celebrate")?.remove();
  const ov = document.createElement("div");
  ov.className = "celebrate";
  ov.innerHTML = `<div class="cel-stage"><div class="cel-rays"></div></div><div class="cel-title"></div><div class="cel-sub"></div><div class="cel-tap">화면을 누르면 닫혀요</div>`;
  document.body.appendChild(ov);
  let closed = false;
  const close = () => { closed = true; ov.remove(); };
  ov.addEventListener("click", close);                                    // 아무 데나 누르면 바로 닫힘
  const stage = ov.querySelector(".cel-stage"), rays = ov.querySelector(".cel-rays");
  const title = ov.querySelector(".cel-title"), sub = ov.querySelector(".cel-sub");
  // 글자 바꾸기 (튀어나오는 애니메이션을 처음부터 다시)
  const say = (t, s) => {
    title.textContent = t; sub.textContent = s;
    title.classList.remove("on"); sub.classList.remove("on"); void title.offsetWidth;
    title.classList.add("on"); sub.classList.add("on");
  };
  const eggCanvas = (lv) => { const c = document.createElement("canvas"); drawPixels(c, eggGrid(lv), eggColors(ev.st.type, skin), 4); return c; };
  const sprite = (p) => { const im = new Image(); im.src = POKE_SPRITE(p[0]); im.alt = p[1]; return im; };
  // 사방으로 날아가는 별·조각: --dx --dy 로 날아갈 방향을 정한다
  const fly = (cls, n, dist, make) => {
    for (let i = 0; i < n; i++) {
      const el = document.createElement("span"), ang = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = dist * (0.7 + Math.random() * 0.5);
      el.className = cls; make(el, i);
      el.style.setProperty("--dx", `${Math.cos(ang) * r}px`); el.style.setProperty("--dy", `${Math.sin(ang) * r}px`);
      el.style.setProperty("--r", `${Math.random() * 540 - 270}deg`);
      stage.appendChild(el); setTimeout(() => el.remove(), 1200);
    }
  };
  const stars = (n = 14) => fly("cel-star", n, 200, (el, i) => { el.textContent = i % 3 ? "⭐" : "✨"; });
  const shards = () => fly("cel-shard", 10, 230, (el, i) => { el.style.setProperty("--c", i % 2 ? skin.B : "#fffdf3"); });
  const flash = () => { const f = document.createElement("div"); f.className = "cel-flash"; document.body.appendChild(f); setTimeout(() => f.remove(), 900); };
  const name = (p) => p[1];

  if (ev.kind === "bday") {                        // 🎂 생일 아이의 그날 첫 루틴 — 생일 축하 노래
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🎂</div>`);
    stars(24); rays.classList.add("on");
    say(`${ev.name}${jong(ev.name) ? "아" : "야"} 생일 축하해!`, "🎵 생일 축하합니다~ 사랑하는 우리 " + ev.name);
    const len = SFX.birthday();
    await wait(Math.max(4000, len * 1000 + 600));
  } else if (ev.kind === "bonus") {                // 🎁 하루 완료 보너스 (그날 루틴을 다 했을 때)
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🎁</div>`);
    SFX.fanfare(); stars(18); rays.classList.add("on");
    const now = ev.st.needPick ? "새 알을 고르면 바로 자라요" : ev.st.cur ? `${name(ev.st.cur)} Lv.${ev.st.level}` : `알 Lv.${ev.st.level}`;
    say("오늘 루틴 다 했어요!", `🎁 하루 완료 보너스 +${ev.n} · ${now}`);
    await wait(3400);
  } else if (ev.kind === "sticker") {              // ⭐ 스티커 (예전 칭찬 스티커 — 아이가 자기 할 일 화면에서 본다)
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">⭐</div>`);
    SFX.fanfare(); stars(18); rays.classList.add("on");
    const when = ev.date ? ` · ${ev.date.slice(5).replace("-", "/")}` : "";
    say(`${iga(ev.giver || "엄마·아빠")} 칭찬 스티커를 줬어요!`, `⭐ ${ev.reason}${when}`);
    await wait(3400);
  } else if (ev.kind === "quizheard") {            // 🔤 '들었어요' 영어 스티커 — 아이가 자기 동산에 들어갈 때 본다(9-1)
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🔤</div>`);
    SFX.fanfare(); stars(18); rays.classList.add("on");
    const when = ev.date ? ` · ${ev.date.slice(5).replace("-", "/")}` : "";
    say(`${iga(ev.giver || "엄마·아빠")} 영어 들었어요!`, `⭐ ${ev.emoji ? ev.emoji + " " : ""}${ev.word}${ev.mean ? ` (${ev.mean})` : ""} — 따라 읽는 걸 들었어요${when}`);
    await wait(3400);
  } else if (ev.kind === "coupon") {               // 🏪 주간 보상 쿠폰 (월~금 모두 하루 완료)
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🎟️</div>`);
    flash(); SFX.fanfare(); stars(24); rays.classList.add("on");
    say("이번 주 다 해냈어요!", `${ev.name} 쿠폰을 받았어요! 쿠폰함에 있어요`);
    await wait(4200);
  } else if (ev.kind === "visit") {                // 🌟 포켓몬이 데려온 친구(10-3): 그림자가 흔들리다 번쩍 → 어떻게 생겼는지 공개
    const im = new Image(); im.src = POKE_SPRITE(ev.dex); im.alt = ev.name; im.className = "silhouette cel-shake";
    stage.appendChild(im);
    say(ev.bringer ? `${iga(ev.bringer)} 친구를 데려왔어요!` : "누군가 찾아왔어요!", `${ev.kid}의 동산에 누가 왔을까요…?`);
    SFX.shake(false); await wait(1500);
    if (closed) return;
    im.classList.add("fast"); SFX.shake(true); await wait(900);
    if (closed) return;
    flash(); SFX.burst(); im.classList.remove("silhouette", "cel-shake", "fast"); im.classList.add("cel-pop"); stars(20); rays.classList.add("on");
    say(`${ev.name}${jong(ev.name) ? "이에요" : "예요"}!`, ev.evo
      ? `진화할 수 있는 친구예요! ✨ 지금 포켓몬을 다 키우면, 새 알 대신 ${ev.name}${jong(ev.name) ? "을" : "를"} 골라 진화시킬 수 있어요`
      : `${ev.kid}의 동산에서 같이 살아요 🌳 도감에도 올랐어요`);
    SFX.fanfare(); await wait(7000);
  } else if (ev.kind === "friendpick") {           // 🐾 알 대신 데려온 친구를 골랐을 때(10-4)
    const im = sprite(ev.to); im.className = "cel-pop"; stage.appendChild(im);
    SFX.levelup(); stars(14); rays.classList.add("on");
    say(`${name(ev.to)}${jong(name(ev.to)) ? "을" : "를"} 키워요!`, "루틴을 하면 자라고, Lv.15가 되면 진화해요 ✨");
    await wait(3200);
  } else if (ev.kind === "quizteam") {             // 🔤 영어 팀 완성 (아이들이 모두 오늘 영어 퀴즈 성공)
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🔤</div>`);
    flash(); SFX.fanfare(); stars(24); rays.classList.add("on");
    say("영어 팀 완성!", "오늘 모두 영어를 맞히고 따라 읽었어요! 🎉");
    await wait(3600);
  } else if (ev.kind === "team") {                 // 🤝 형제 보너스 (형제 모두 하루 완료)
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🤝</div>`);
    SFX.fanfare(); stars(22); rays.classList.add("on");
    const names = (lastData ? lastData.kids.map((k) => k.name) : []).join("·");
    say(`${names ? names + " " : ""}모두 다 했어요!`, `🤝 형제 보너스 +${ev.n} — 모두 함께 받아요!`);
    await wait(3400);
  } else if (ev.kind === "picked") {               // 알 3개 중 하나를 골랐을 때
    const c = eggCanvas(0); c.className = "cel-pop"; stage.appendChild(c);
    SFX.levelup(); stars(12); rays.classList.add("on");
    say("알을 골랐어요!", `${eggLabel(ev.st.type)}이 왔어요! 루틴을 하면 알이 자라요`);
    await wait(2800);
  } else if (ev.kind === "pickwait") {             // 루틴은 했는데 새 알을 아직 안 골랐을 때
    stage.insertAdjacentHTML("beforeend", `<div class="cel-pop" style="font-size:120px;position:relative;z-index:2">🥚</div>`);
    SFX.levelup(); stars(10);
    say("잘했어요! +1", `루틴 ${ev.st.waiting}개 모였어요. 새 알을 고르면 바로 자라요!`);
    await wait(2600);
  } else if (ev.kind === "crack") {                // 알 Lv.1~4: 알에 금이 하나 더
    const c = eggCanvas(ev.st.level); c.className = "cel-shake fast"; stage.appendChild(c);
    SFX.crack(); stars(8);
    setTimeout(() => c.classList.remove("cel-shake", "fast"), 600);
    say(`알 Lv.${ev.st.level}`, ev.st.left === 1 ? "알에 금이 쩍! 다음 루틴이면 부화해요!" : `알에 금이 갔어요! 부화까지 ${ev.st.left}개`);
    await wait(2600);
  } else if (ev.kind === "level") {                // 보통 레벨업
    const im = sprite(ev.st.cur); im.className = "cel-pop"; stage.appendChild(im);
    SFX.levelup(); stars(); rays.classList.add("on");
    say("LEVEL UP!", `${name(ev.st.cur)} Lv.${ev.st.level - 1} → Lv.${ev.st.level}`);
    await wait(2600);
  } else if (ev.kind === "hatch") {                // 부화: 알이 흔들흔들 → 더 빨리 → 번쩍! 조각이 튀고 포켓몬 등장
    const born = sprite(ev.to);                    // 그림을 미리 받아 둔다(흔드는 동안)
    const c = eggCanvas(4); c.className = "cel-shake"; stage.appendChild(c);
    say("어라…?", "알이 움직여요!");
    SFX.shake(false); await wait(1000);
    if (closed) return;
    c.classList.add("fast"); say("어어…!", "곧 나올 것 같아요!"); SFX.shake(true); await wait(1000);
    if (closed) return;
    flash(); SFX.burst(); c.remove(); shards(); stars(18);
    born.className = "cel-pop"; stage.appendChild(born); rays.classList.add("on");
    say("알이 부화했어요!", ev.st.legendary ? `✨ 전설의 포켓몬 ${iga(name(ev.to))} 태어났어요!` : `${iga(name(ev.to))} 태어났어요!`);
    SFX.fanfare(); await wait(4200);
  } else if (ev.kind === "evolve") {               // 진화: 하얗게 번갈아 깜빡이다가(점점 빨리) 번쩍! 새 모습
    const a = sprite(ev.from), b = sprite(ev.to);
    b.hidden = true; stage.append(a, b);
    say("어라…?", `${name(ev.from)}의 모습이…!`);
    await wait(700);
    if (closed) return;
    a.classList.add("cel-white"); b.classList.add("cel-white");
    const gaps = [420, 380, 330, 280, 240, 200, 170, 140, 120, 100, 85, 70, 60, 55, 50, 50];
    SFX.rise(gaps.reduce((s, x) => s + x, 0) / 1000);
    for (const g of gaps) { a.hidden = !a.hidden; b.hidden = !b.hidden; await wait(g); if (closed) return; }
    flash(); SFX.burst(); a.remove(); b.hidden = false; b.classList.remove("cel-white"); b.classList.add("cel-pop");
    rays.classList.add("on"); stars(18);
    say(ev.final ? "최종 진화!" : "진화했어요!", `${iga(name(ev.from))} ${ro(name(ev.to))} 진화했어요!${ev.final ? " 동산으로 가고, 새 알 3개가 와요 🥚" : ""}`);
    SFX.fanfare(); await wait(4400);
  } else {                                         // grown: 모습은 같지만 단계가 오름(전설 등)
    const im = sprite(ev.to); im.className = "cel-pop"; stage.appendChild(im);
    flash(); SFX.fanfare(); stars(18); rays.classList.add("on");
    say(ev.final ? "다 키웠어요!" : "더 강해졌어요!", ev.final ? `${iga(name(ev.to))} 동산으로 이동해요 🌳 새 알 3개가 와요!` : `${name(ev.to)} 2단계 Lv.1`);
    await wait(3800);
  }
  if (!closed) close();
}

