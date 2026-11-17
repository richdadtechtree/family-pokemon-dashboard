// 한 번만: PC PokeTokenBar의 지금 알·도감·진행을 서버 장부(~/.config/family-dashboard/dad-pokemon.json)로 옮길 JSON을 만든다.
// 이후 경험치는 서버가 토큰 사용량(/api/usage-totals)으로 쌓는다(serve.py dad_tick).
//   node dashboard/deploy/dad-pokemon-init.cjs > dad-pokemon.json
//   (서버에 이미 장부가 있으면 덮어쓰지 말 것 — 키우던 알이 바뀐다)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const stateFile = process.env.POKETOKENBAR_STATE_FILE || path.join(process.env.APPDATA || '', 'poketokenbar-windows', 'state.json');
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^﻿/, ''));
if (!state.companion || !Array.isArray(state.companion.line)) throw new Error('No current companion in PokeTokenBar state.');
// 지금까지 키운 만큼(마지막 동기화 값)은 이어서 — 서버가 첫 토큰을 받을 때 startExp 를 맞춘다
const snap = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../아빠/포켓몬-동료.json'), 'utf8'));
const since = Math.max(0, Math.floor(Number(snap.sinceStartTokens) || 0));
const pick = p => ({dex: p.dex, ko: p.ko, en: p.en || ''});
const out = {
  version: 1,
  migratedAt: new Date().toISOString(),
  companion: {line: state.companion.line.map(pick), rarity: state.companion.rarity || 'common',
    shiny: !!state.companion.shiny, hatchedAt: state.companion.hatchedAt || ''},
  pokedex: (state.pokedex || []).map(p => ({...pick(p), shiny: !!p.shiny, rarity: p.rarity || '', graduatedAt: p.graduatedAt || '', tokensUsed: p.tokensUsed || 0})),
  initSinceStart: since,
  days: {},
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
