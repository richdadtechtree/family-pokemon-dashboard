/* 가족 대시보드 — 6-10. 효과음(Web Audio)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* 6-10. 효과음 — 소리 파일 없이 브라우저가 직접 '삑삑' 8비트 소리를 만든다(Web Audio)
   브라우저는 사람이 화면을 누르기 전엔 소리를 막아 두므로, 루틴을 누르는 순간 audio()로 소리를 깨운다. */
let audioCtx = null;
function audio() {
  if (!CONFIG.sound) return null;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }   // 소리를 못 내는 기기면 조용히 넘어간다
}
// 음 하나: freq(Hz) 소리를 at초 뒤에 dur초 동안. slideTo를 주면 그 높이까지 미끄러진다
function beep(freq, at, dur, type = "square", vol = 0.1, slideTo = 0) {
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);                                            // 딸깍 소리 안 나게 살짝 키웠다가
  g.gain.exponentialRampToValueAtTime(vol * CONFIG.soundVolume, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);                        // 자연스럽게 줄인다
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.03);
}
// '빠직' 깨지는 소리: 무작위 잡음(지지직)을 짧게
function crackNoise(at, dur, vol = 0.3) {
  const ac = audio(); if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);   // 점점 작아지는 잡음
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = "highpass"; f.frequency.value = 900; g.gain.value = vol * CONFIG.soundVolume;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(ac.currentTime + at);
}
const SFX = {
  // 생일 축하 노래 멜로디(공개 곡) — 돌려주는 값은 길이(초)
  birthday() {
    const G4 = 392, A4 = 440, B4 = 494, C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, b = 0.42;
    const tune = [[G4, .75], [G4, .25], [A4, 1], [G4, 1], [C5, 1], [B4, 2], [G4, .75], [G4, .25], [A4, 1], [G4, 1], [D5, 1], [C5, 2],
      [G4, .75], [G4, .25], [G5, 1], [E5, 1], [C5, 1], [B4, 1], [A4, 2], [F5, .75], [F5, .25], [E5, 1], [C5, 1], [D5, 1], [C5, 3]];
    let t = 0;
    for (const [f, n] of tune) { beep(f, t, n * b * 0.92, "triangle", 0.16); beep(f * 2, t, Math.min(0.12, n * b * 0.5), "square", 0.025); t += n * b; }
    return t;
  },
  ding() { beep(1319, 0, 0.08, "square", 0.06); beep(1760, 0.07, 0.18, "square", 0.05); },                    // 띵! (준비물·할 일·장보기 체크)
  levelup() { [523, 659, 784, 1047].forEach((f, i) => beep(f, i * 0.08, i === 3 ? 0.35 : 0.1)); },            // 도미솔도↑
  crack() { crackNoise(0, 0.09, 0.35); beep(1400, 0, 0.05, "square", 0.04); [784, 988].forEach((f, i) => beep(f, 0.12 + i * 0.09, 0.12, "triangle", 0.12)); },
  shake(fast) { const n = fast ? 8 : 4, gap = fast ? 0.11 : 0.22; for (let i = 0; i < n; i++) beep(i % 2 ? 170 : 200, i * gap, 0.07, "triangle", 0.18); },   // 들썩들썩
  burst() { crackNoise(0, 0.4, 0.5); beep(260, 0, 0.3, "sawtooth", 0.07, 70); },                              // 쩌억! (알 깨짐·진화 번쩍)
  rise(sec) { beep(220, 0, sec, "square", 0.04, 1500); beep(330, 0, sec, "triangle", 0.06, 2200); },          // 진화 중 '우우웅~' 올라가는 소리
  fanfare() {                                                                                                   // 빠밤빠밤~ 축하 음악
    [[523, 0, 0.11], [523, 0.13, 0.11], [523, 0.26, 0.11], [698, 0.4, 0.45], [659, 0.9, 0.13], [698, 1.05, 0.13], [880, 1.2, 0.7]]
      .forEach(([f, at, d]) => beep(f, at, d, "square", 0.09));
    [[262, 0.4, 0.45], [330, 0.9, 0.25], [349, 1.2, 0.7]].forEach(([f, at, d]) => beep(f, at, d, "triangle", 0.14));
  },
};

