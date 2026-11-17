// Read-only comparison; species counts include all evolution stages.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appDir = process.argv[2] || 'D:/PokeTokenBar/poketokenbar-windows-source/poketokenbar-windows';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pokemon.js'), 'utf8') + ';this.catalog = POKE_ALL;', context);
const app = require(path.join(appDir, 'src/pokemon.js'));
const family = new Map(context.catalog.flatMap(e => e.chain.flatMap(s => Array.isArray(s[0]) ? s : [s])));
const dad = new Map([...app.LINES.flatMap(e => e.chain), ...app.LEGENDARIES].map(p => [p.dex, p.ko]));
console.log(JSON.stringify({family: family.size, dad: dad.size, shared: [...dad.keys()].filter(d => family.has(d)).length,
  union: new Set([...family.keys(), ...dad.keys()]).size, dadOnly: [...dad].filter(([d]) => !family.has(d))}, null, 2));
