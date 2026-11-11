// Render determinista cuadro a cuadro con Chromium (Playwright) + ffmpeg.
//   node src/render.mjs stills 12.5,40,100        -> work/stills/*.jpg
//   node src/render.mjs sheet 2                   -> hoja de contactos cada 2 s
//   node src/render.mjs video [workers]           -> salida/kevin_levrone_entropia_gym.mp4
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30, TOTAL = 463.0;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { console.error('ERROR en página:', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${port}/src/index.html`);
  await page.evaluate(() => window.ready);
  return page;
}
async function grab(page, t) {
  const b64 = await page.evaluate(async t => {
    await window.seek(t);
    return document.getElementById('c').toDataURL('image/jpeg', 0.94).split(',')[1];
  }, t);
  return Buffer.from(b64, 'base64');
}

async function main() {
  const [mode = 'stills', arg = '', arg2 = ''] = process.argv.slice(2);
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  try {
    if (mode === 'stills' || mode === 'sheet') {
      const out = path.join(ROOT, 'work', mode === 'sheet' ? 'sheet' : 'stills');
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(out, { recursive: true });
      let times;
      if (mode === 'sheet') {
        const step = parseFloat(arg || '2');
        const a = parseFloat(arg2 || '0');
        times = [];
        for (let t = a; t < TOTAL; t += step) times.push(+t.toFixed(3));
      } else times = arg.split(',').map(Number);
      const page = await openPage(browser, port);
      for (const t of times) {
        fs.writeFileSync(path.join(out, `${String(Math.round(t * 1000)).padStart(7, '0')}.jpg`), await grab(page, t));
      }
      console.log(`${times.length} fotogramas en ${out}`);
    } else if (mode === 'video') {
      const workers = parseInt(arg || '4', 10);
      const nFrames = Math.round(TOTAL * FPS);
      const segDir = path.join(ROOT, 'work', 'segments');
      fs.rmSync(segDir, { recursive: true, force: true });
      fs.mkdirSync(segDir, { recursive: true });
      const per = Math.ceil(nFrames / workers);
      const t0 = Date.now();
      let done = 0;
      await Promise.all([...Array(workers).keys()].map(async w => {
        const a = w * per, b = Math.min(nFrames, a + per);
        const page = await openPage(browser, port);
        const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
          path.join(segDir, `seg${w}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
        for (let f = a; f < b; f++) {
          const buf = await grab(page, f / FPS);
          if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
          done++;
          if (done % 300 === 0) {
            const el = (Date.now() - t0) / 1000;
            console.log(`${done}/${nFrames} fotogramas · ${el.toFixed(0)} s · ${(done / el).toFixed(1)} fps`);
          }
        }
        ff.stdin.end();
        await new Promise(r => ff.on('close', r));
      }));
      const list = path.join(segDir, 'list.txt');
      fs.writeFileSync(list, [...Array(workers).keys()].map(w => `file 'seg${w}.mp4'`).join('\n'));
      const outDir = path.join(ROOT, 'salida');
      fs.mkdirSync(outDir, { recursive: true });
      const out = path.join(outDir, 'kevin_levrone_entropia_gym.mp4');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(ROOT, 'work', 'mezcla.wav'),
        '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
        '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
      console.log('Vídeo:', out, `(${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    }
  } finally {
    await browser.close();
    srv.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
