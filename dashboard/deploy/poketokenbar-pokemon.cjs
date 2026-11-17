// Family catalogue integration. Token milestones: 156000000 / 312000000 / 468000000.
'use strict';

const HATCH_AT = 156000000;
const EVOLVE_2_AT = 312000000;   // 동료 시작 이후 누적
const GRADUATE_AT = 468000000;   // 동료 시작 이후 누적
const SHINY_ODDS = 1 / 128;

function line(ko1, en1, id1, ko2, en2, id2, ko3, en3, id3, rarity) {
  return {
    rarity,
    chain: [
      { dex: id1, ko: ko1, en: en1 },
      { dex: id2, ko: ko2, en: en2 },
      { dex: id3, ko: ko3, en: en3 },
    ],
  };
}

// 3단계 라인 20개 = 60종 (Gen 1~5 스타터 + 인기 라인)
const BASE_LINES = [
  line('이상해씨', 'Bulbasaur', 1, '이상해풀', 'Ivysaur', 2, '이상해꽃', 'Venusaur', 3, 'common'),
  line('파이리', 'Charmander', 4, '리자드', 'Charmeleon', 5, '리자몽', 'Charizard', 6, 'common'),
  line('꼬부기', 'Squirtle', 7, '어니부기', 'Wartortle', 8, '거북왕', 'Blastoise', 9, 'common'),
  line('캐터피', 'Caterpie', 10, '단데기', 'Metapod', 11, '버터플', 'Butterfree', 12, 'common'),
  line('치코리타', 'Chikorita', 152, '베이리프', 'Bayleef', 153, '메가니움', 'Meganium', 154, 'common'),
  line('브케인', 'Cyndaquil', 155, '마그케인', 'Quilava', 156, '블레이범', 'Typhlosion', 157, 'common'),
  line('리아코', 'Totodile', 158, '엘리게이', 'Croconaw', 159, '장크로다일', 'Feraligatr', 160, 'common'),
  line('나무지기', 'Treecko', 252, '나무돌이', 'Grovyle', 253, '나무킹', 'Sceptile', 254, 'common'),
  line('아차모', 'Torchic', 255, '영치코', 'Combusken', 256, '번치코', 'Blaziken', 257, 'common'),
  line('물짱이', 'Mudkip', 258, '늪짱이', 'Marshtomp', 259, '대짱이', 'Swampert', 260, 'common'),
  line('모부기', 'Turtwig', 387, '수풀부기', 'Grotle', 388, '토대부기', 'Torterra', 389, 'common'),
  line('불꽃숭이', 'Chimchar', 390, '파이숭이', 'Monferno', 391, '초염몽', 'Infernape', 392, 'common'),
  line('팽도리', 'Piplup', 393, '팽태자', 'Prinplup', 394, '엠페르트', 'Empoleon', 395, 'common'),
  line('주리비얀', 'Snivy', 495, '샤비', 'Servine', 496, '샤로다', 'Serperior', 497, 'common'),
  line('애버라스', 'Larvitar', 246, '데기라스', 'Pupitar', 247, '마기라스', 'Tyranitar', 248, 'rare'),
  line('아공이', 'Bagon', 371, '쉘곤', 'Shelgon', 372, '보만다', 'Salamence', 373, 'rare'),
  line('메탕구', 'Beldum', 374, '메탕', 'Metang', 375, '메타그로스', 'Metagross', 376, 'rare'),
  line('딱구리', 'Gible', 443, '한바이트', 'Gabite', 444, '한카리아스', 'Garchomp', 445, 'rare'),
  line('터검니', 'Axew', 610, '액슨도', 'Fraxure', 611, '액스라이즈', 'Haxorus', 612, 'rare'),
  line('모노두', 'Deino', 633, '디헤드', 'Zweilous', 634, '삼삼드래', 'Hydreigon', 635, 'rare'),
];

// 전설 (1단계 라인 — 부화하면 바로 최종 형태, 졸업은 GRADUATE_AT)
const BASE_LEGENDARIES = [
  { dex: 150, ko: '뮤츠', en: 'Mewtwo' },
  { dex: 151, ko: '뮤', en: 'Mew' },
  { dex: 249, ko: '루기아', en: 'Lugia' },
  { dex: 250, ko: '칠색조', en: 'Ho-Oh' },
  { dex: 384, ko: '레쿠쟈', en: 'Rayquaza' },
  { dex: 483, ko: '디아루가', en: 'Dialga' },
  { dex: 484, ko: '펄기아', en: 'Palkia' },
  { dex: 487, ko: '기라티나', en: 'Giratina' },
  { dex: 643, ko: '레시라무', en: 'Reshiram' },
  { dex: 644, ko: '제크로무', en: 'Zekrom' },
];

// Shared 164-species catalogue; existing companions keep their saved evolution chain.
const FAMILY_CATALOG = require('./family-catalog.json');
const oldNames = new Map([...BASE_LINES.flatMap(e => e.chain), ...BASE_LEGENDARIES].map(p => [p.dex, p]));
const oldRarity = new Map(BASE_LINES.map(e => [e.chain[0].dex, e.rarity]));
const species = p => ({...p, en: oldNames.get(p.dex)?.en || p.ko});
const LINES = FAMILY_CATALOG.filter(e => !e.legendary).sort((a, b) => { const rank = e => { const i = BASE_LINES.findIndex(l => l.chain[0].dex === e.chain[0].dex); return i < 0 ? 1000 : i; }; return rank(a) - rank(b); }).map(e => ({
  rarity: oldRarity.get(e.chain[0].dex) || 'common', chain: e.chain.map(species)
}));
const LEGENDARIES = FAMILY_CATALOG.filter(e => e.legendary).map(e => species(e.chain[0]));

const RARITY_WEIGHT = { common: 70, rare: 25, legendary: 5 };

function pickWeighted(rng) {
  const entries = [];
  for (const l of LINES) entries.push({ kind: 'line', line: l, weight: RARITY_WEIGHT[l.rarity] / LINES.filter((x) => x.rarity === l.rarity).length });
  for (const s of LEGENDARIES) entries.push({ kind: 'legendary', species: s, weight: RARITY_WEIGHT.legendary / LEGENDARIES.length });
  const total = entries.reduce((a, e) => a + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) { r -= e.weight; if (r <= 0) return e; }
  return entries[entries.length - 1];
}

/** 알 부화: 가중 랜덤으로 동료 결정. rng은 () => [0,1) (기본 Math.random). */
function hatchCompanion(rng = Math.random) {
  const picked = pickWeighted(rng);
  const shiny = rng() < SHINY_ODDS;
  if (picked.kind === 'legendary') {
    return {
      line: [{ ...picked.species }],
      rarity: 'legendary',
      shiny,
      hatchedAt: new Date().toISOString(),
    };
  }
  return {
    line: picked.line.chain.map((s) => ({ ...s })),
    rarity: picked.line.rarity,
    shiny,
    hatchedAt: new Date().toISOString(),
  };
}

/** 라인 길이에 따른 누적 임계값 (동료 시작 이후 누적 토큰). */
function thresholdsFor(lineLength) {
  if (lineLength <= 2) return [HATCH_AT, GRADUATE_AT];
  return [HATCH_AT, EVOLVE_2_AT, GRADUATE_AT];
}

/**
 * 동료 시작 이후 누적 토큰으로 현재 단계 계산.
 * 반환: { stage: 0=알, 1..n=진화단계, graduated: bool,
 *          current: species|null, nextAt: number|null, progress: 0..1, tokensIntoStage }
 */
function companionStatus(companion, tokensSinceStart) {
  const n = companion.line.length;
  const thresholds = thresholdsFor(n);
  let stage = 0;
  let prevAt = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (tokensSinceStart >= thresholds[i]) { stage = i + 1; prevAt = thresholds[i]; }
    else break;
  }
  const isGraduated = tokensSinceStart >= thresholds[thresholds.length - 1];
  const nextAt = isGraduated ? null : thresholds[stage];
  const base = stage === 0 ? 0 : thresholds[stage - 1];
  const span = (nextAt ?? tokensSinceStart) - base;
  const progress = nextAt == null ? 1 : Math.min(1, Math.max(0, (tokensSinceStart - base) / (span || 1)));
  return {
    stage: isGraduated ? n : stage,
    graduated: isGraduated,
    current: stage === 0 ? null : companion.line[Math.min(stage, n) - 1],
    nextAt,
    nextLabel: isGraduated ? null : stage === 0 ? '부화' : nextAt === GRADUATE_AT ? '졸업' : '진화',
    progress,
    tokensIntoStage: tokensSinceStart - base,
    tokensToNext: nextAt == null ? 0 : nextAt - tokensSinceStart,
    thresholds,
  };
}

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** PokéAPI 스프라이트 URL. animated: Gen V black-white GIF, shiny면 shiny 폴더. */
function spriteUrl(dex, { animated = true, shiny = false } = {}) {
  if (animated) {
    return `${SPRITE_BASE}/versions/generation-v/black-white/animated/${shiny ? 'shiny/' : ''}${dex}.gif`;
  }
  return `${SPRITE_BASE}/${shiny ? 'shiny/' : ''}${dex}.png`;
}
function staticSpriteUrl(dex, { shiny = false } = {}) {
  return spriteUrl(dex, { animated: false, shiny });
}

module.exports = {
  LINES, LEGENDARIES, HATCH_AT, EVOLVE_2_AT, GRADUATE_AT, SHINY_ODDS,
  hatchCompanion, companionStatus, thresholdsFor, spriteUrl, staticSpriteUrl,
};
