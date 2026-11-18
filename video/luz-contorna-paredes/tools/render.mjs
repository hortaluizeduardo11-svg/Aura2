// Captura quadro a quadro da cena (Chromium headless + WebGL) e codificação com ffmpeg.
//
//   node tools/render.mjs --preview 1.5,4,8          -> build/preview/t_XXXX.png
//   node tools/render.mjs --full [--from 0 --to 95]  -> build/frames_<from>_<to>.mp4 (sem áudio)
//   node tools/render.mjs --eventos                  -> build/eventos.json (tempos para o áudio)
//   node tools/render.mjs --retrato                  -> build/retrato.png (pessoa escondida vista da abertura)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const FPS = 30;

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!p.startsWith(ROOT)) { s.writeHead(403); s.end(); return; }
      fs.readFile(p, (e, d) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
        s.end(d);
      });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

async function abrir(srv) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/scene/index.html`);
  await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, cdp };
}

async function quadro(page, cdp, t) {
  await page.evaluate((tt) => window.renderAt(tt), t);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
  return Buffer.from(r.data, 'base64');
}

const srv = await serve();
const { browser, page, cdp } = await abrir(srv);
fs.mkdirSync(BUILD, { recursive: true });

if (args.includes('--retrato')) {
  const r = await page.evaluate(() => window.renderRetrato());
  fs.writeFileSync(path.join(BUILD, 'retrato.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(BUILD, 'retrato.json'), JSON.stringify({ fovVertGraus: r.fovVertGraus, distancia: r.distancia }));
  console.log('retrato ok');
} else if (args.includes('--eventos')) {
  const ev = await page.evaluate(() => window.eventos());
  fs.writeFileSync(path.join(BUILD, 'eventos.json'), JSON.stringify(ev, null, 1));
  console.log('eventos ok');
} else if (args.includes('--preview')) {
  const dir = path.join(BUILD, 'preview');
  fs.mkdirSync(dir, { recursive: true });
  const ts = arg('--preview').split(',').map(Number);
  if (arg('--cam')) {
    const c = arg('--cam').split(',').map(Number);
    await page.evaluate((c) => { window.debugCam = { pos: c.slice(0, 3), target: c.slice(3, 6), fov: c[6] || 40 }; }, c);
  }
  const tag = arg('--tag', '');
  for (const t of ts) {
    const t0 = Date.now();
    const png = await quadro(page, cdp, t);
    const f = path.join(dir, `${tag}t_${t.toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(f, png);
    console.log(f, Date.now() - t0, 'ms');
  }
} else if (args.includes('--full')) {
  const dur = await page.evaluate(() => window.duracao());
  const from = Number(arg('--from', 0)), to = Math.min(Number(arg('--to', dur)), dur);
  const out = path.join(BUILD, `frames_${String(from).padStart(5, '0')}_${String(to).padStart(5, '0')}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
  const t0 = Date.now();
  for (let n = n0; n < n1; n++) {
    const png = await quadro(page, cdp, n / FPS);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((n - n0) % 60 === 0) {
      const el = (Date.now() - t0) / 1000, done = n - n0 + 1;
      console.log(`quadro ${n}/${n1}  ${(el / done).toFixed(2)} s/quadro  restante ~${((n1 - n) * el / done / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('ok', out);
}
await browser.close();
srv.close();
