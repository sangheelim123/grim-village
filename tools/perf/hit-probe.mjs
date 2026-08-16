/* 친구 탭 히트 영역을 격자로 훑어 실제 반응 지점을 그린다 */
import { chromium, nodeRequire as require, ROOT as REPO, BASE as ENV_BASE, TMP, currentVersion } from '../e2e/_env.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOUCH = process.argv.includes('--touch');
const seed = () => { const ring=(k,r)=>Array.from({length:k},(_,i)=>{const a=(i/k)*Math.PI*2;return [Math.round(50+Math.cos(a)*r),Math.round(50+Math.sin(a)*r)];});
  return { v:1, chars:[{s:[ring(24,34)],c:0,e:0,pt:0,p:0,g:0,f:0,n:'모리',sc:'egg',b:1}], trails:[], aqua:[], arts:[],
    kid:{name:'',call:1}, flowers:0, stars:{road:0,egg:0,feed:0,sort:0}, lvl:{road:1,egg:1,feed:1,sort:1},
    hist:{road:[],egg:[],feed:[],sort:[]}, decor:[], stats:{d:'2000-1-1',sec:0,plays:0}, intro:true }; };
const b = await chromium.launch();
const ctx = await b.newContext(TOUCH ? { viewport:{width:390,height:844}, hasTouch:true, isMobile:true } : { viewport:{width:1024,height:700} });
await ctx.addInitScript(p => { try{localStorage.setItem('village-v4-p0',JSON.stringify(p));}catch(e){} }, seed());
const OLD = process.argv.includes('--old');
await ctx.addInitScript(o => { window.__OLD = o; }, OLD);
const page = await ctx.newPage();
const cdp = TOUCH ? await ctx.newCDPSession(page) : null;
await page.goto('http://127.0.0.1:8331/index.html');
await page.waitForFunction("window.__game && window.__game.scene.isActive('Profile')");
await sleep(500);
const c = await page.evaluate(() => { const c = window.__game.scene.getScene('Profile').cards[0]; return [c.x,c.y]; });
await page.mouse.click(c[0], c[1]);
await page.waitForFunction("window.__game.scene.isActive('Village')");
await sleep(1500);
const info = await page.evaluate(() => {
  const v = window.__game.scene.getScene('Village');
  const w = v.walkers[0];
  v.moveStop(w);
  w.setPosition(v.scale.width * 0.3, v.scale.height * 0.64);
  if (window.__OLD) w.input.hitArea = new Phaser.Geom.Circle(0, 0, w.baseSize * 0.7);
  w.on('pointerdown', () => { window.__hit = true; });
  const ha = w.input.hitArea;
  return { x: w.x, y: w.y, size: w.baseSize, hit: `Circle(${ha.x},${ha.y},r=${ha.radius.toFixed(1)})` };
});
const R = Math.round(info.size * 0.8);
const step = Math.max(6, Math.round(R / 5));
const grid = [];
for (let dy = -R; dy <= R; dy += step) {
  let row = '';
  for (let dx = -R; dx <= R; dx += step) {
    await page.evaluate(() => {
      window.__hit = false;
      const v = window.__game.scene.getScene('Village'); const w = v.walkers[0];
      v.moveStop(w); w.setScale(1); w.setAlpha(1);
      w.setPosition(v.scale.width * 0.3, v.scale.height * 0.64);   // 탭마다 제자리로(이젤·간판에서 떨어진 곳)
    });
    const x = info.x + dx, y = info.y + dy;
    if (TOUCH) {
      await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] });
      await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    } else { await page.mouse.click(x, y); }
    await sleep(45);
    row += (await page.evaluate(() => window.__hit)) ? '#' : (dx === 0 && dy === 0 ? '+' : '.');
  }
  grid.push(row);
}
const still = await page.evaluate(() => window.__game.scene.isActive('Village'));
console.log(`마을 씬 유지: ${still ? '예' : '아니오 — 프로브가 다른 것을 눌렀다'}`);
console.log(`히트영역 ${info.hit}`);
console.log(`친구 크기 ${info.size}px, 격자 ${step}px  (+ = 친구 정중앙, # = 반응함)`);
grid.forEach(r => console.log('   ' + r.split('').join(' ')));
await b.close();
