// Reads PokeTokenBar and exports only the public companion snapshot.
// Without --advance it never changes the app state. With --advance (app not running) it graduates/hatches like the app does.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..');
const appDir = process.env.POKETOKENBAR_APP_DIR || 'D:/PokeTokenBar/poketokenbar-windows-source/poketokenbar-windows';
const candidates = process.env.POKETOKENBAR_STATE_FILE ? [process.env.POKETOKENBAR_STATE_FILE] :
  ['poketokenbar-windows', 'PokeTokenBar'].map(n => path.join(process.env.APPDATA || '', n, 'state.json'));
const existing = candidates.filter(p => fs.existsSync(p));
if (existing.length !== 1) throw new Error('Set POKETOKENBAR_STATE_FILE: expected exactly one PokeTokenBar state file.');
const stateFile = existing[0];
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^\uFEFF/, ''));
const { scanAll, aggregateDaily } = require(path.join(appDir, 'src/tokenReader.js'));
const { buildDadCompanionExport } = require(path.join(appDir, 'src/dadExport.js'));
const { hatchCompanion, companionStatus } = require(path.join(appDir, 'src/pokemon.js'));
const { entries } = scanAll({claudeCustomRoots: state.settings?.claudeRoots || [], codexCustomRoots: state.settings?.codexRoots || []});
const agg = aggregateDaily(entries, 30);
// --advance: PokeTokenBar\uAC00 \uAEBC\uC838 \uC788\uC5B4\uB3C4 \uC131\uC7A5\uC774 \uBA48\uCD94\uC9C0 \uC54A\uAC8C, \uC571 main.js refresh()\uC640 \uAC19\uC740 \uADDC\uCE59\uC73C\uB85C
// \uC878\uC5C5(\uB3C4\uAC10\uC5D0 \uB123\uAE30) \u2192 \uC0C8 \uC54C\uC744 state.json \uC5D0 \uC801\uB294\uB2E4(\uBC14\uAFB8\uAE30 \uC804 \uBC31\uC5C5). \uC571\uC774 \uCF1C\uC838 \uC788\uC73C\uBA74
// sync-dad-companion.ps1 \uC774 \uC774 \uC635\uC158\uC744 \uBE7C\uACE0 \uC571\uC5D0 \uB9E1\uAE34\uB2E4(\uB450 \uACF3\uC774 \uACB9\uCCD0 \uC4F0\uC9C0 \uC54A\uAC8C).
let advanced = 'none';
if (process.argv.includes('--advance') && process.argv.includes('--write')) {
  if (!Array.isArray(state.pokedex)) state.pokedex = [];
  const startTokens = typeof state.companionStartTokens === 'number' ? state.companionStartTokens : 0;
  if (!state.companion) {
    state.companion = hatchCompanion();
    state.companionStartTokens = agg.totalTokens;
    advanced = 'new-egg';
  } else {
    const sinceStart = Math.max(0, agg.totalTokens - startTokens);
    const status = companionStatus(state.companion, sinceStart);
    if (status.graduated) {
      state.pokedex.push({...status.current, shiny: state.companion.shiny, rarity: state.companion.rarity,
        graduatedAt: new Date().toISOString(), tokensUsed: sinceStart});
      state.companion = hatchCompanion();
      state.companionStartTokens = agg.totalTokens;
      advanced = 'graduated';
    }
  }
  if (advanced !== 'none') {
    fs.copyFileSync(stateFile, stateFile + '.before-auto-' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15));
    fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(stateFile + '.tmp', stateFile);
  }
}
if (!state.companion || !Array.isArray(state.companion.line)) throw new Error('No current companion. Open PokeTokenBar first.');
const snapshot = buildDadCompanionExport(state, agg);
// Only stages already reached are shared; never reveal an unhatched egg's species.
snapshot.met = state.companion.line.slice(0, snapshot.companion.stageIndex).map(p => ({dex: p.dex, ko: p.ko, shiny: !!state.companion.shiny}));
const dest = path.join(repo, '아빠', '포켓몬-동료.json');
if (process.argv.includes('--write')) {
  fs.writeFileSync(dest + '.tmp', JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  fs.renameSync(dest + '.tmp', dest);
}
console.log(JSON.stringify({written: process.argv.includes('--write'), advanced, companion: snapshot.companion.ko,
  stage: snapshot.companion.stageLabel, progress: snapshot.progress, graduated: snapshot.pokedexCount,
  todayTokens: snapshot.todayTokens}, null, 2));
