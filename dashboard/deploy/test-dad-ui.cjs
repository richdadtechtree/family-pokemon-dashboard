// Run with the existing Electron executable. Uses demo authentication only; no real wiki writes.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
app.setPath('userData', path.join(root, '.dad-ui-check'));
fs.mkdirSync(path.join(root, '.dad-ui-check'), {recursive:true});
const checks = [];
const report = data => fs.writeFileSync(path.join(root, '.dad-ui-check/result.json'), JSON.stringify(data,null,2));
report({status:'running'});
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false, width:1200, height:900, webPreferences:{contextIsolation:true}});
  try {
    await win.loadURL('http://127.0.0.1:18081/dashboard/?demo#parent-0');
    const snapshot = fs.readFileSync(path.join(root, '아빠/포켓몬-동료.json'), 'utf8');
    // Wait for the page's initial async demo load, with a bounded timeout.
    for (let i=0;i<30;i++) {
      if (await win.webContents.executeJavaScript('typeof lastData !== "undefined" && !!lastData')) break;
      await new Promise(resolve=>setTimeout(resolve, 100));
    }
    await win.webContents.executeJavaScript(`lastData.dadCompanion=${snapshot}; demoParentApi('setup',{who:'아빠',pin:'1111'}); parentRefresh();`);
    for (const width of [1200,390]) {
      win.setSize(width,900);
      const result = await win.webContents.executeJavaScript(`(() => {
        renderParent(lastData,0);
        const card=document.querySelector('#parent .dad-garden');
        const button=document.querySelector('#parent [data-dad-dex]');
        if (!card || !button) throw new Error('Missing dad card or dex button');
        button.click();
        const modal=document.querySelector('.dad-dex');
        const cells=modal.querySelectorAll('.dex-cell').length;
        const found=modal.querySelectorAll('.dex-cell.met').length;
        const bounds=modal.querySelector('.sheet').getBoundingClientRect();
        modal.querySelector('.dex-close').click();
        return {cells,found,closed:!document.querySelector('.dad-dex'),left:bounds.left,right:bounds.right,width:innerWidth};
      })()`);
      assert.equal(result.cells,164);
      assert.ok(result.found>=1);
      assert.equal(result.closed,true);
      assert.ok(result.left>=-1 && result.right<=result.width+1, JSON.stringify(result));
      console.log(`PASS ${width}px: dad card, 164-species dex, collected species, close, bounds`);
      checks.push({width,...result});
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(root, `.dad-ui-check/parent-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    report({status:'passed',checks}); win.destroy(); app.exit(0);
  } catch(e) { report({status:'failed',error:String(e),checks}); console.error(e); win.destroy(); app.exit(1); }
});
