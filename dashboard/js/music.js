/* 가족 대시보드 — 3. 소리 설정 · 저녁 음악
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것)
   - 설정(serve.py /api/settings, 모든 기기 공통): 효과음 켜기·크기, 저녁 음악 시간대·유튜브 재생목록·직접 만든 집중 소리.
     설정은 서버에 저장된다(부모가 바꾼다). 위키를 다시 읽을 때 함께 다시 읽는다.
   - 화면 구석 🎵 버튼(하루 종일 — 2026-11-14 아빠 결정, 예전엔 저녁 시간대에만) → 고르는 창: 🎵 음악(유튜브에서 추가한 것, 🎲 아무거나) / 🌧️ 집중 소리(직접 만든 소리).
     재생 중 ⏭ 는 같은 갈래 안에서만 바꾸고, ↩ 다시 고르기 · ⏹ 끄기. 저절로 끄지 않는다.
   - 유튜브는 공식 플레이어(youtube-nocookie 삽입)를 그대로 보이게 둔다. 빗소리·잔잔한 소음은 브라우저가 직접 만든다(파일 없음).
*/
"use strict";
let SETTINGS = null;
const DEMO_SETTINGS = { sound: true, volume: 0.7, music: { from: "19:00", to: "21:00", ambient: true, lists: [], dance: [] } };
async function loadSettings() {
  if (DEMO) SETTINGS ||= JSON.parse(JSON.stringify(DEMO_SETTINGS));
  else {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) SETTINGS = j.settings;
    } catch (e) { /* 예전 serve.py 거나 끊김 — config.js 기본값 그대로 */ }
  }
  applySettings();
}
function applySettings() {
  if (!SETTINGS) return;
  CONFIG.sound = SETTINGS.sound !== false;
  CONFIG.soundVolume = typeof SETTINGS.volume === "number" ? SETTINGS.volume : CONFIG.soundVolume;
  updateMusicButton();
  if (!(musicNow && musicNow.dance)) warmDance();                 // 💃 춤 음악 미리 준비(목록이 바뀌었으면 새로)
}

// 유튜브 주소 → 공식 삽입 플레이어 주소 (재생목록이면 목록째, 영상 하나면 그 영상을 되풀이)
// auto=false 면 불러만 두고 재생하지 않는다(춤 음악 미리 준비용). enablejsapi=1 이라 나중에 postMessage 로 '재생' 명령을 보낼 수 있다
function ytEmbed(url, auto = true) {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)) return "";
    const list = u.searchParams.get("list");
    const v = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
    const opt = `autoplay=${auto ? 1 : 0}&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(location.origin)}`;
    if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&${opt}`;
    if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}?${opt}&loop=1&playlist=${encodeURIComponent(v)}`;
  } catch (e) { /* 주소가 아님 */ }
  return "";
}

// 🎵 버튼은 하루 종일 보인다(설정만 받아 왔으면). 설정의 from·to 는 예전 저녁 시간대 값으로 남아 있지만 쓰지 않는다
function musicOpen() { return !!(SETTINGS && SETTINGS.music); }
// 두 갈래로 나눈다: 🎵 음악 = 엄마·아빠가 유튜브에서 추가한 것 / 🌧️ 집중 소리 = 브라우저가 직접 만드는 소리
const AMBIENTS = [{ kind: "rain", title: "🌧️ 빗소리" }, { kind: "drip", title: "💧 똑똑 물방울" }, { kind: "calm", title: "🌊 잔잔한 소음" },
  // 집중 소리 5가지(빗소리·물방울·잔잔한 소음·로파이·숲·파도)
  // ☔ 잔잔한 비는 🌧️ 빗소리와 똑같고, ☕ 카페는 카페 같지 않아서 뺐다(2026-11-15 아빠 결정)
  { kind: "a-lofi", title: "🎧 로파이" }, { kind: "a-forest", title: "🌲 숲 산책" }, { kind: "a-ocean", title: "🏖️ 파도" }];
const ambIcon = (kind) => ((AMBIENTS.find((a) => a.kind === kind) || {}).title || "🎵").split(" ")[0];

/* ASMR Focus 소리 (일정 페이지 synthSound 를 그대로 옮김). out 에 이어 붙이고 { nodes, stop } 을 돌려준다 */
function asmrNoise(ac, type) {
  const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (type === "brown") { b0 = (b0 + 0.02 * w) / 1.02; d[i] = b0 * 3.5; }
    else d[i] = w;
  }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; return src;
}
function asmrStart(ac, kind, out) {
  const nodes = [];
  let timer = 0, alive = true;
  const gain = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; return x; };
  const osc = (f, type = "sine") => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; };
  if (kind === "a-ocean") {
    const n = asmrNoise(ac, "brown"), lfoG = gain(0.3), lfo = osc(0.12), lfoAmt = gain(0.25);
    n.connect(lfoG).connect(out); lfo.connect(lfoAmt).connect(lfoG.gain);
    const n2 = asmrNoise(ac, "brown");
    n2.connect(filt("lowpass", 400)).connect(gain(0.5)).connect(out);
    nodes.push(n, n2, lfo);
  } else if (kind === "a-forest") {
    const n = asmrNoise(ac, "pink");
    n.connect(filt("bandpass", 800, 0.8)).connect(gain(0.35)).connect(out);
    nodes.push(n);
    const chirp = () => {                                      // 새소리: 가끔 짧게 올라가는 사인파
      if (!alive) return;
      const o = osc(1800 + Math.random() * 800), g = gain(0), t = ac.currentTime;
      o.connect(g).connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.04, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 0.15 + Math.random() * 0.1);
      o.frequency.setValueAtTime(1800 + Math.random() * 600, t); o.frequency.linearRampToValueAtTime(2400 + Math.random() * 400, t + 0.08);
      o.start(t); o.stop(t + 0.3);
      timer = setTimeout(chirp, 800 + Math.random() * 3200);
    };
    timer = setTimeout(chirp, 500);
  } else if (kind === "a-lofi") {                              // 200·240Hz(40Hz 차이) + 낮은 드론 + 옅은 핑크 노이즈
    const l = osc(200), r = osc(240);
    l.connect(gain(0.15)).connect(out); r.connect(gain(0.15)).connect(out);
    const drone = osc(55, "sawtooth");
    drone.connect(filt("lowpass", 200)).connect(gain(0.08)).connect(out);
    const n = asmrNoise(ac, "pink");
    n.connect(gain(0.04)).connect(out);
    nodes.push(l, r, drone, n);
  }
  nodes.forEach((x) => x.start());
  return () => { alive = false; clearTimeout(timer); nodes.forEach((x) => { try { x.stop(); } catch (e) { /* 이미 멈춤 */ } }); };
}
function musicLists() {
  const m = (SETTINGS && SETTINGS.music) || {};
  return (m.lists || []).filter((l) => ytEmbed(l.url)).map((l) => ({ group: "music", kind: "yt", title: l.title, url: l.url }));
}
// 💃 춤 음악 — '아빠는 지금' 카드를 누르면 이 목록에서 (엄마·아빠 메뉴에서 따로 등록)
function danceLists() {
  const m = (SETTINGS && SETTINGS.music) || {};
  return (m.dance || []).filter((l) => ytEmbed(l.url)).map((l) => ({ group: "dance", kind: "yt", title: l.title, url: l.url }));
}
function ambientList() {
  const m = (SETTINGS && SETTINGS.music) || {};
  return m.ambient ? AMBIENTS.map((a) => ({ group: "ambient", ...a })) : [];
}
const musicChoices = () => [...musicLists(), ...ambientList()];

/* 직접 만든 집중 소리 — Web Audio 잡음. 빗소리 = 높은 쪽 잡음 + 가끔 톡톡, 잔잔한 소음 = 낮게 깐 갈색 잡음 */
function ambientStart(kind) {
  let ac;
  try { ac = audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); }
  catch (e) { return null; }
  const vol = (SETTINGS ? SETTINGS.volume : 0.7) || 0.5;
  const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = kind === "calm" ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;   // 갈색 잡음 / 흰 잡음
  }
  const master = ac.createGain();                         // 🔊 막대가 바꾸는 마지막 단계 소리 크기
  master.gain.value = musicVol() / 70;                    // 70(기본)일 때 예전과 같은 크기
  master.connect(ac.destination);
  if (kind.startsWith("a-")) {                            // 일정 페이지 ASMR — 그쪽 기본 크기(0.5×0.7)에 맞춰 효과음 크기를 곱한다
    const out = ac.createGain(); out.gain.value = 0.35 * vol; out.connect(master);
    const halt = asmrStart(ac, kind, out);
    const stop = () => { halt(); out.disconnect(); master.disconnect(); };
    stop.setVol = (v) => { master.gain.setTargetAtTime(v / 70, ac.currentTime, 0.05); };
    return stop;
  }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ac.createBiquadFilter(), g = ac.createGain();
  if (kind === "calm") { f.type = "lowpass"; f.frequency.value = 500; g.gain.value = 0.35 * vol; }
  else if (kind === "drip") { f.type = "lowpass"; f.frequency.value = 1200; g.gain.value = 0.04 * vol; }   // 멀리서 아주 작게 비 오는 소리만 깔고
  else { f.type = "bandpass"; f.frequency.value = 2500; f.Q.value = 0.4; g.gain.value = 0.12 * vol; }
  src.connect(f).connect(g).connect(master);
  src.start();
  let timer = 0;
  if (kind === "drip") {                                    // 똑… 똑똑 — 처마 끝에서 떨어지는 굵은 물방울
    // 물방울 '똑'은 음이 아래에서 위로 빠르게 미끄러지며 짧게 울린다(뿅 하고 튀는 소리)
    const plop = (at, pitch) => {
      const o = ac.createOscillator(), dg = ac.createGain(), t = ac.currentTime + at;
      o.type = "sine";
      o.frequency.setValueAtTime(pitch, t); o.frequency.exponentialRampToValueAtTime(pitch * 2.6, t + 0.035);
      dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.004);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(dg).connect(master); o.start(t); o.stop(t + 0.16);
    };
    const drip = () => {
      const base = 380 + Math.random() * 260;               // 물방울마다 높이가 조금씩 다르다
      plop(0, base);
      if (Math.random() < 0.3) plop(0.16 + Math.random() * 0.1, base * (0.9 + Math.random() * 0.25));   // 가끔 '똑똑' 두 번
      timer = setTimeout(drip, 450 + Math.random() * 1100);
    };
    drip();
  }
  if (kind === "rain") {                                    // 톡… 톡톡 — 가끔 떨어지는 빗방울
    const drop = () => {
      const o = ac.createOscillator(), dg = ac.createGain(), t = ac.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(1800 + Math.random() * 1500, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
      dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.03 * vol, t + 0.005); dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(dg).connect(master); o.start(t); o.stop(t + 0.08);
      timer = setTimeout(drop, 60 + Math.random() * 400);
    };
    drop();
  }
  const stop = () => { clearTimeout(timer); try { src.stop(); } catch (e) { /* 이미 멈춤 */ } src.disconnect(); master.disconnect(); };
  stop.setVol = (v) => { master.gain.setTargetAtTime(v / 70, ac.currentTime, 0.05); };
  return stop;
}

/* 🔊 음악 소리 크기 — 재생 패널의 막대로 조절. 이 기기에서 기억(효과음 크기와 따로, 2026-11-15 아빠 요청).
   유튜브는 플레이어에 setVolume 명령을, 집중 소리는 마지막 단계 소리 크기(master)를 바꾼다 */
const VOL_KEY = "musicVolume";
function musicVol() { try { const v = parseInt(localStorage.getItem(VOL_KEY), 10); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 70; } catch (e) { return 70; } }
function ytCommand(iframe, func, args = []) {
  try { iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), "*"); } catch (e) { /* 아직 없음 */ }
}
function applyMusicVol(v = musicVol()) {
  const f = document.querySelector("#musicPanel iframe");
  if (f) ytCommand(f, "setVolume", [v]);
  if (musicNow && musicNow.stop && musicNow.stop.setVol) musicNow.stop.setVol(v);
  const lab = document.querySelector("#musicPanel .mp-vol-num");
  if (lab) lab.textContent = v;
  const ic = document.querySelector("#musicPanel .mp-vol-ic");
  if (ic) ic.textContent = v === 0 ? "🔇" : v < 40 ? "🔈" : v < 75 ? "🔉" : "🔊";
}
document.addEventListener("input", (ev) => {
  const r = ev.target.closest && ev.target.closest("#musicPanel .mp-vol input");
  if (!r) return;
  const v = +r.value;
  try { localStorage.setItem(VOL_KEY, String(v)); } catch (e) { /* 저장 못 해도 지금 소리는 바뀐다 */ }
  applyMusicVol(v);
});

let musicNow = null;                    // { title, stop }
function stopMusic() {
  if (musicNow && musicNow.stop) musicNow.stop();
  musicNow = null;
  document.getElementById("musicPanel")?.remove();
  updateMusicButton();
  clearTimeout(danceWarmTimer);
  danceWarmTimer = setTimeout(warmDance, 3000);                   // 다음 춤 음악을 다시 미리 준비
}
// 재생 패널 내리기·올리기 — 내려도 소리는 계속 난다(플레이어를 지우지 않고 가리기만). 이 기기에서 마지막 상태를 기억
const FOLD_KEY = "musicPanelFolded";
const panelFolded = () => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch (e) { return false; } };
function toggleFold() {
  const p = document.getElementById("musicPanel");
  if (!p) return;
  const folded = p.classList.toggle("folded");
  try { localStorage.setItem(FOLD_KEY, folded ? "1" : "0"); } catch (e) { /* 저장 못 해도 지금 화면은 바뀐다 */ }
}
/* 🔍 듣고 싶은 노래 찾기 — 고르는 창 맨 위 입력칸. serve.py /api/yt-search 가 유튜브 검색 앞쪽 영상을 주면
   첫 번째를 바로 틀고, 재생 패널 아래에 다른 결과를 보여 준다. ⏭ 는 다음 결과로.
   삽입 재생을 막아 둔 영상이면(플레이어 오류 101·150) 저절로 다음 결과로 넘어간다 */
let searchResults = [];
const searchList = () => searchResults.map((r) => ({ group: "search", kind: "yt", title: r.title, url: "https://www.youtube.com/watch?v=" + r.id, id: r.id, channel: r.channel, length: r.length }));
async function searchSong(q) {
  q = (q || "").trim();
  const msg = document.querySelector("#musicPanel .mp-msg");
  if (!q) return;
  if (msg) msg.textContent = "🔍 찾는 중…";
  try {
    const r = await fetch("/api/yt-search?q=" + encodeURIComponent(q), { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    if (!j.items.length) { if (msg) msg.textContent = "찾는 노래가 없어요. 다른 말로 찾아볼까요?"; return; }
    searchResults = j.items;
    playChoice(searchList()[0]);
  } catch (e) {
    if (msg) msg.textContent = "노래를 찾지 못했어요. 잠시 뒤에 다시 해 주세요.";
  }
}
const groupList = (g) => (g === "music" ? musicLists() : g === "dance" ? danceLists() : g === "search" ? searchList() : ambientList());
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
// 🎵 버튼 → 고르는 창: 위에 🎵 음악(유튜브), 아래에 🌧️ 집중 소리
function openChooser() {
  stopMusic();
  const mus = musicLists(), amb = ambientList();
  const btn = (c, i) => `<button type="button" class="mp-pick" data-music="pick" data-group="${c.group}" data-i="${i}">${escapeHtml(c.title)}</button>`;
  const p = document.createElement("div");
  p.id = "musicPanel";
  p.innerHTML = `<div class="mp-head"><b>무엇을 틀까요?</b><button type="button" data-music="stop" title="닫기">✕</button></div>
    <form class="mp-search"><input type="search" name="q" placeholder="🔍 듣고 싶은 노래" enterkeyhint="search" autocomplete="off" maxlength="80"><button type="submit">찾기</button></form>
    <div class="mp-msg"></div>
    ${mus.length ? `<div class="mp-sec"><h4>🎵 음악</h4>${mus.length > 1 ? `<button type="button" class="mp-pick any" data-music="pick" data-group="music" data-i="-1">🎲 아무거나</button>` : ""}${mus.map(btn).join("")}</div>` : ""}
    ${amb.length ? `<div class="mp-sec"><h4>🌧️ 집중 소리</h4>${amb.map(btn).join("")}</div>` : ""}`;
  document.body.appendChild(p);
  musicNow = { chooser: true };
  updateMusicButton();
}
// 하나 틀기 — ⏭ 는 같은 갈래(음악끼리·집중 소리끼리) 안에서만 바꾼다
// 재생 패널 안쪽(제목줄 + 플레이어). auto=false 면 유튜브를 불러만 둔다
function panelHtml(ch, auto = true) {
  const same = groupList(ch.group).length;
  return `<div class="mp-head"><button type="button" class="mp-fold" data-music="fold" title="내리기·올리기"></button>
      <b>${ch.group === "music" ? "🎵 " : ch.group === "dance" ? "💃 " : ch.group === "search" ? "🔍 " : ""}${escapeHtml(ch.title)}</b>
      ${same > 1 ? `<button type="button" data-music="next" title="${ch.group === "music" ? "다른 음악" : ch.group === "dance" ? "다른 춤 음악" : ch.group === "search" ? "다음 결과" : "다른 집중 소리"}">⏭</button>` : ""}
      <button type="button" data-music="choose" title="다시 고르기">↩</button><button type="button" data-music="stop" title="끄기">⏹</button></div>
    <div class="mp-body"><label class="mp-vol"><span class="mp-vol-ic">🔉</span><input type="range" min="0" max="100" step="5" value="${musicVol()}" aria-label="음악 소리 크기"><span class="mp-vol-num">${musicVol()}</span></label>${ch.kind === "yt" ? `<iframe src="${escapeHtml(ytEmbed(ch.url, auto))}" title="유튜브 음악" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>` : `<div class="mp-amb">${ambIcon(ch.kind)}</div>`}${ch.group === "search" ? searchMoreHtml(ch) : ""}</div>`;
}
// 찾은 노래 목록(지금 트는 것 표시) — 누르면 그 노래로
function searchMoreHtml(ch) {
  return `<ol class="mp-results">${searchList().map((c, i) => `<li><button type="button" class="${c.id === ch.id ? "on" : ""}" data-music="pick" data-group="search" data-i="${i}">${escapeHtml(c.title)}<small>${escapeHtml(c.channel)} · ${escapeHtml(c.length)}</small></button></li>`).join("")}</ol>`;
}
function playChoice(ch, opts = {}) {
  stopMusic();
  const p = document.createElement("div");
  p.id = "musicPanel";
  p.className = "playing" + (panelFolded() ? " folded" : "");
  p.innerHTML = panelHtml(ch);
  document.body.appendChild(p);
  if (ch.kind === "yt") ytListen(p.querySelector("iframe"));
  musicNow = { group: ch.group, title: ch.title, stop: ch.kind === "yt" ? null : ambientStart(ch.kind), dance: !!opts.dance, started: ch.kind !== "yt" };
  if (ch.group === "dance") danceLastSet(ch.url);   // dance: '아빠는 지금' 춤 노래
  updateMusicButton();
  applyMusicVol();
  if (musicNow.started) window.dispatchEvent(new Event("music-playing"));
}

/* 유튜브 플레이어가 '지금 재생 중'이라고 알려 주면 'music-playing' 을 알린다(춤 화면이 노래에 맞춰 시작하도록).
   enablejsapi=1 플레이어에 'listening' 을 보내 두면 상태가 바뀔 때마다 postMessage 로 알려 준다 */
function ytListen(iframe) {
  if (!iframe) return;
  const hello = () => { try { iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch (e) { /* 아직 없음 */ } };
  const vol = () => ytCommand(iframe, "setVolume", [musicVol()]);
  iframe.addEventListener("load", () => { hello(); vol(); [500, 1500, 3000].forEach((t) => setTimeout(() => { hello(); vol(); }, t)); });
}
window.addEventListener("message", (ev) => {
  if (!/youtube(-nocookie)?\.com$/.test(new URL(ev.origin || "http://x").hostname)) return;
  const f = document.querySelector("#musicPanel iframe");
  if (!f || ev.source !== f.contentWindow || !musicNow) return;
  let d; try { d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch (e) { return; }
  if (d && d.event === "onError" && musicNow.group === "search") return playNext();   // 삽입 재생이 막힌 영상 → 다음 결과
  if (musicNow.started) return;
  const state = d && (d.event === "onStateChange" ? d.info : d.event === "infoDelivery" && d.info ? d.info.playerState : undefined);
  if (state === 1) { musicNow.started = true; ytCommand(f, "setVolume", [musicVol()]); window.dispatchEvent(new Event("music-playing")); }   // 1 = 재생 중
});

/* 💃 춤 음악 미리 준비: 한 곡의 유튜브 플레이어를 화면 밖(#danceWarm)에 불러 둔다(재생은 안 함).
   '아빠는 지금'을 누르면 그 자리에서 #musicPanel 로 바꿔 화면에 꺼내고 '재생' 명령만 보낸다 — 다시 불러오지 않아서 빨리 나온다.
   (iframe 을 다른 곳으로 옮기면 다시 불러오므로 같은 요소의 id·class 만 바꾼다) */
let danceWarm = null;                      // { el, ch, ready }
/* 💃 춤 음악은 2곡 이상이면 아무거나 — 바로 전에 춘 곡은 빼고 고른다(같은 곡이 연달아 나오지 않게, 2026-11-15 아빠 요청).
   마지막 곡은 이 기기에 기억 */
const DANCE_LAST = "danceLast";
function danceLastSet(url) { try { localStorage.setItem(DANCE_LAST, url); } catch (e) { /* 기억 못 해도 춤은 춘다 */ } }
function pickDance(list) {
  let last = ""; try { last = localStorage.getItem(DANCE_LAST) || ""; } catch (e) { /* 없음 */ }
  const pool = list.length > 1 ? list.filter((c) => c.url !== last) : list;
  return pickOne(pool.length ? pool : list);
}
let danceWarmTimer = 0;
function warmDance() {
  clearTimeout(danceWarmTimer);
  const list = typeof danceLists === "function" ? danceLists() : [];
  if (danceWarm && !list.some((c) => c.url === danceWarm.ch.url)) { danceWarm.el.remove(); danceWarm = null; }   // 목록에서 빠졌으면 버린다
  if (danceWarm || !list.length) return;
  const ch = pickDance(list);
  const el = document.createElement("div");
  el.id = "danceWarm";
  el.innerHTML = panelHtml(ch, false);
  document.body.appendChild(el);
  const w = (danceWarm = { el, ch, ready: false });
  ytListen(el.querySelector("iframe"));
  el.querySelector("iframe").addEventListener("load", () => setTimeout(() => { w.ready = true; }, 1500));   // 플레이어가 명령을 받을 때까지 조금 더
}
// 미리 준비한 춤 음악을 꺼내 재생. 준비가 안 됐으면 false (그때는 평소처럼 playChoice)
function playWarmDance() {
  if (!danceWarm || !danceWarm.ready) return false;
  const { el, ch } = danceWarm;
  danceWarm = null;
  stopMusic();
  el.id = "musicPanel";
  el.className = "playing" + (panelFolded() ? " folded" : "");
  const send = (func) => el.querySelector("iframe").contentWindow.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  ytCommand(el.querySelector("iframe"), "setVolume", [musicVol()]);
  send("playVideo");
  setTimeout(() => send("playVideo"), 400);                       // 첫 명령을 놓쳤을 때를 대비해 한 번 더
  musicNow = { group: ch.group, title: ch.title, stop: null, dance: true, started: false };
  danceLastSet(ch.url);
  updateMusicButton();
  return true;
}
function playNext() {
  if (!musicNow || !musicNow.group) return;
  if (musicNow.group === "search") {                              // 찾은 노래는 차례대로 (끝이면 처음으로)
    const list = searchList(), i = list.findIndex((c) => c.title === musicNow.title);
    if (list.length > 1) playChoice(list[(i + 1) % list.length]);
    return;
  }
  const pool = groupList(musicNow.group).filter((c) => c.title !== musicNow.title);
  if (pool.length) playChoice(pickOne(pool), { dance: musicNow.dance });
}
function updateMusicButton() {
  let b = document.getElementById("musicBtn");
  const dance = !!(musicNow && musicNow.dance);                 // 춤 노래는 시간대와 상관없이 (끝나면 춤이 끈다)
  const show = musicOpen() || dance;                         // 🔍 노래 찾기가 있어서 목록이 비어도 보인다
  if (!b) {
    if (!show) return;
    b = document.createElement("button");
    b.id = "musicBtn"; b.type = "button"; b.dataset.music = "toggle"; b.title = "음악";
    document.body.appendChild(b);
  }
  b.hidden = !show;
  const playing = !!(musicNow && !musicNow.chooser);
  b.textContent = playing ? "🎶" : "🎵";
  b.classList.toggle("on", playing);
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-music]");
  if (!b) return;
  const a = b.dataset.music;
  if (a === "stop") stopMusic();
  else if (a === "next") playNext();
  else if (a === "choose") openChooser();
  else if (a === "fold") toggleFold();
  else if (a === "pick") {
    const list = groupList(b.dataset.group), i = +b.dataset.i;
    const ch = i < 0 ? pickOne(list) : list[i];                  // -1 = 🎲 아무거나
    if (ch) playChoice(ch);
  } else if (a === "toggle") (musicNow ? stopMusic() : openChooser());
});
document.addEventListener("submit", (ev) => {
  const f = ev.target.closest("#musicPanel .mp-search");
  if (!f) return;
  ev.preventDefault();
  f.q.blur();                                                     // 패드 자판 닫기
  searchSong(f.q.value);
});
setInterval(updateMusicButton, 30000);
