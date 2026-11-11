'use strict';
/* Documental Kevin Levrone — Entropia Gym
 * Motor de motion graphics 100% determinista.
 * window.seek(t) dibuja el fotograma del segundo t sin depender de fotogramas anteriores.
 * No hay Math.random: el grano usa un PRNG con semilla fija (mulberry32).
 */
const W = 1920, H = 1080, FPS = 30, VO = 9.5, TOTAL = 463.0;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// ------------------------------------------------------------------ marca y rejilla
const COL = {
  bg: '#09080c', ink: '#F3F0F6', mute: '#9E97AA', dim: '#57505F',
  p: '#7E4FC0', pl: '#B89DE6', pd: '#2A1744', pdd: '#120A1C', silver: '#CFCBD6',
};
const M = 120;              // margen lateral (rejilla de 12 columnas, medianil 24)
const MB = 110;             // margen inferior
const COLW = (W - 2 * M - 11 * 24) / 12;
const colX = c => M + c * (COLW + 24);

// ------------------------------------------------------------------ utilidades
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  oc: t => 1 - Math.pow(1 - t, 3),
  oq: t => 1 - Math.pow(1 - t, 4),
  ox: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  ioc: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  ios: t => -(Math.cos(Math.PI * t) - 1) / 2,
  ioq: t => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  ic: t => t * t * t,
};
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ recursos
const IMG = {}, IMGB = {};
const IMG_NAMES = ['pose_dos', 'flex_portada', 'gym_barra', 'creatina', 'joven_publico', 'yates', 'coleman',
  'arnold', 'escenario', 'pecho_lateral', 'sandow', 'espalda', 'baltimore', 'adolescente', 'yates_levrone_bn',
  'triceps', 'powerhouse', 'sudadera', 'brazos', 'bateria', 'estudio', 'clasica', 'revista'];
const CLIPS = { carga: 151, banca_top: 151, cara_tumbado: 151, discos: 150, sentado: 241, press1: 241, press2: 241,
  cara1: 240, vendas: 211, pies: 211, barra: 151, press3: 240, hombro: 300, cara2: 241, cara3: 241, torso: 211,
  dobleb: 361, espalda: 240 };
let TIMING = null;
const CF = new Map();
const NEED = new Set();
let GRAIN = [];
let VIGN = null;

async function bitmap(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo cargar ' + url);
  return createImageBitmap(await r.blob());
}
function blurred(img) {
  const w = 384, h = Math.round((img.height / img.width) * w);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d');
  x.filter = 'blur(10px)';
  x.drawImage(img, -12, -12, w + 24, h + 24);
  return c;
}
function makeGrain() {
  for (let k = 0; k < 6; k++) {
    const c = new OffscreenCanvas(256, 256);
    const x = c.getContext('2d');
    const id = x.createImageData(256, 256);
    const r = mulberry32(9000 + k);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = (r() + r() + r()) / 3 * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    GRAIN.push(c);
  }
  const v = new OffscreenCanvas(W, H);
  const vx = v.getContext('2d');
  const g = vx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.62)');
  vx.fillStyle = g;
  vx.fillRect(0, 0, W, H);
  VIGN = v;
}
async function init() {
  const fonts = ['400 20px Anton', '300 20px Oswald', '500 20px Oswald', '700 20px Oswald', '400 20px Fraunces',
    'italic 400 20px Fraunces', '600 20px Fraunces', 'italic 600 20px Fraunces'];
  await Promise.all(fonts.map(f => document.fonts.load(f, 'ÁÉÍÓÚÑ¿?áéíóúñº')));
  TIMING = await (await fetch('timing.json')).json();
  await Promise.all(IMG_NAMES.map(async n => {
    IMG[n] = await bitmap(`../assets/img/${n}.jpg`);
    IMGB[n] = blurred(IMG[n]);
  }));
  META = await (await fetch('../assets/img/meta.json')).json();
  IMG.logo = await bitmap('../assets/img/logo.png');
  IMG.sandow_cut = await bitmap('../assets/img/sandow_cut.png');
  IMG.creatina_cut = await bitmap('../assets/img/creatina_cut.png');
  makeGrain();
  buildTimeline();
  return true;
}
function clipImg(name, frame) {
  const n = CLIPS[name];
  let f = Math.floor(frame);
  // ida y vuelta para no quedarnos nunca sin material
  const period = 2 * (n - 1);
  f = ((f % period) + period) % period;
  if (f >= n) f = period - f;
  const key = `${name}/${String(f + 1).padStart(4, '0')}`;
  const b = CF.get(key);
  if (!b) NEED.add(key);
  return b;
}
async function fetchNeeded() {
  if (CF.size > 360) {
    const it = CF.keys();
    for (let i = 0; i < 180; i++) {
      const k = it.next().value;
      if (NEED.has(k)) continue;
      const b = CF.get(k);
      if (b && b.close) b.close();
      CF.delete(k);
    }
  }
  const keys = [...NEED];
  NEED.clear();
  await Promise.all(keys.map(async k => CF.set(k, await bitmap(`../assets/clips/${k}.jpg`))));
}

// ------------------------------------------------------------------ tiempo del guion
const S = i => TIMING[i].t0 + VO;
const SE = i => TIMING[i].t1 + VO;
function words(i) {
  const u = TIMING[i];
  const ws = u.text.split(/\s+/);
  const wt = ws.map(w => w.replace(/[^\wáéíóúñü]/gi, '').length + 1.5);
  const tot = wt.reduce((a, b) => a + b, 0);
  let c = 0;
  return ws.map((w, k) => {
    const t = S(i) + ((SE(i) - S(i)) * c) / tot;
    c += wt[k];
    return { w, t };
  });
}
function wordT(i, needle) {
  const ws = words(i);
  const f = ws.find(x => x.w.toLowerCase().replace(/[^\wáéíóúñü]/gi, '').startsWith(needle.toLowerCase()));
  if (!f) throw new Error(`palabra "${needle}" no encontrada en la frase ${i}`);
  return f.t;
}

// ------------------------------------------------------------------ dibujo base
function reset() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.letterSpacing = '0px';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}
function bg(c = COL.bg) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
function black(a) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = clamp(a); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function coverMap(img, x, y, w, h, fx, fy, z) {
  const iw = img.width, ih = img.height;
  const s = Math.max(w / iw, h / ih) * z;
  const sw = w / s, sh = h / s;
  const sx = clamp(fx * iw - sw / 2, 0, iw - sw), sy = clamp(fy * ih - sh / 2, 0, ih - sh);
  return { s, sx, sy, sw, sh, map: (u, v) => [x + (u * iw - sx) * s, y + (v * ih - sy) * s] };
}
const GRADE = 'contrast(1.1) saturate(0.86) brightness(0.93)';
const GRADE_BW = 'grayscale(1) contrast(1.18) brightness(0.92)';
function tint(x, y, w, h, a = 0.32) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = a;
  ctx.fillStyle = COL.pd;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
/* ---- Nitidez: nunca ampliar el material por encima de su resolución real ----
 * Si un plano pide más ampliación de la que aguanta el original, la imagen se
 * muestra como tarjeta a tamaño nítido sobre un fondo desenfocado de sí misma. */
const MAX_UP_PHOTO = 1.6, MAX_UP_CLIP = 2.0;
let META = {};
function cardRect(ow, oh, x, y, w, h, maxUp, o) {
  const full = w === W && h === H;
  const maxH = full ? H * 0.78 : h * 0.9, maxW = full ? W * 0.62 : w * 0.9;
  const s = Math.min(maxW / ow, maxH / oh, maxUp);
  const cw = ow * s, ch = oh * s;
  const cx = x + w * (o.cardX ?? 0.5), cy = y + h * (o.cardY ?? (full ? 0.44 : 0.5));
  return { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
}
function cardShadow(r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}
/** Foto con Ken Burns suave controlado por el tiempo local. */
function photo(name, lt, d, o = {}) {
  const img = IMG[name];
  const [ow, oh] = META[name] || [img.width, img.height];
  let x = o.x ?? 0, y = o.y ?? 0, w = o.w ?? W, h = o.h ?? H;
  const p = E.ios(clamp(lt / d));
  const f0 = o.f0 ?? [0.5, 0.5], f1 = o.f1 ?? f0;
  let z = lerp(o.z0 ?? 1.02, o.z1 ?? 1.06, p);
  const need = Math.max(w / ow, h / oh) * Math.max(o.z0 ?? 1.02, o.z1 ?? 1.06);
  if (need > MAX_UP_PHOTO) {
    // fondo: la propia foto desenfocada
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const bgi = IMGB[name];
    const mb = coverMap(bgi, x, y, w, h, 0.5, 0.5, 1.15);
    ctx.filter = 'saturate(0.6)';
    ctx.drawImage(bgi, mb.sx, mb.sy, mb.sw, mb.sh, x, y, w, h);
    ctx.filter = 'none';
    tint(x, y, w, h, 0.4);
    ctx.globalAlpha = 0.62; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.restore();
    const r = cardRect(ow, oh, x, y, w, h, MAX_UP_PHOTO, o);
    // la tarjeta respira muy poco: escala 0.985 -> 1.0
    const k = lerp(0.985, 1.0, p);
    const r2 = { x: r.x + r.w * (1 - k) / 2, y: r.y + r.h * (1 - k) / 2, w: r.w * k, h: r.h * k };
    cardShadow(r2);
    x = r2.x; y = r2.y; w = r2.w; h = r2.h;
    z = lerp(1.0, 1.03, p);
  }
  const m = coverMap(img, x, y, w, h, lerp(f0[0], f1[0], p), lerp(f0[1], f1[1], p), z);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = o.bw ? GRADE_BW : GRADE;
  ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, x, y, w, h);
  ctx.filter = 'none';
  tint(x, y, w, h, o.tint ?? 0.3);
  if (o.dark) { ctx.globalAlpha = o.dark; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
  m.rect = { x, y, w, h };
  return m;
}
function blurBg(name, lt, d, dark = 0.55, z0 = 1.1, z1 = 1.2) {
  const img = IMGB[name];
  const p = E.ios(clamp(lt / d));
  const m = coverMap(img, 0, 0, W, H, 0.5, 0.5, lerp(z0, z1, p));
  ctx.save();
  ctx.filter = 'saturate(0.7)';
  ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, 0, 0, W, H);
  ctx.filter = 'none';
  tint(0, 0, W, H, 0.4);
  ctx.globalAlpha = dark; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
let CB = null, CBX = null;
/** Vídeo adicional: tramos extraídos como secuencias de imágenes a 30 fps (original 480x352). */
function clip(name, lt, o = {}) {
  const d = o.d ?? 4;
  const frame = (o.off ?? 0) * FPS + lt * FPS * (o.speed ?? 1);
  const img = clipImg(name, frame);
  if (!img) return;
  let x = o.x ?? 0, y = o.y ?? 0, w = o.w ?? W, h = o.h ?? H;
  const p = E.ios(clamp(lt / d));
  const ow = 480, oh = 352;
  let z = lerp(Math.min(o.z0 ?? 1.0, 1.04), Math.min(o.z1 ?? 1.03, 1.04), p);
  const filt = o.bw ? 'grayscale(1) contrast(1.32) brightness(0.8)' : 'contrast(1.28) saturate(0.72) brightness(0.82)';
  if (Math.max(w / ow, h / oh) * z > MAX_UP_CLIP) {
    if (!CB) { CB = new OffscreenCanvas(192, 108); CBX = CB.getContext('2d'); }
    CBX.filter = 'blur(5px) ' + filt;
    const mb = coverMap(img, 0, 0, 192, 108, 0.5, 0.5, 1.1);
    CBX.drawImage(img, mb.sx, mb.sy, mb.sw, mb.sh, -8, -8, 208, 124);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(CB, x, y, w, h);
    tint(x, y, w, h, 0.35);
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.restore();
    const r = cardRect(ow, oh, x, y, w, h, MAX_UP_CLIP, o);
    cardShadow(r);
    x = r.x; y = r.y; w = r.w; h = r.h;
  }
  const m = coverMap(img, x, y, w, h, o.fx ?? 0.5, o.fy ?? 0.45, z);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.filter = filt;
  ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, x, y, w, h);
  ctx.filter = 'none';
  tint(x, y, w, h, o.tint ?? 0.16);
  if (o.dark) { ctx.globalAlpha = o.dark; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
/** Velo negro para legibilidad (no es un degradado de color: solo oscurece). */
function scrim(side = 'bottom', a = 0.8, extent = 0.6) {
  let g;
  if (side === 'bottom') g = ctx.createLinearGradient(0, H, 0, H * (1 - extent));
  else if (side === 'left') g = ctx.createLinearGradient(0, 0, W * extent, 0);
  else if (side === 'right') g = ctx.createLinearGradient(W, 0, W * (1 - extent), 0);
  else g = ctx.createLinearGradient(0, 0, 0, H * extent);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ tipografía
function setFont(fam, size, weight = 400, italic = false, ls = 0) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${fam}`;
  ctx.letterSpacing = `${ls}px`;
}
function measure(s) { return ctx.measureText(s).width; }
/** Titular Anton con revelado por máscara (sube desde debajo de su línea). */
function head(s, x, y, p, o = {}) {
  if (p <= 0) return;
  const size = o.size ?? 120;
  setFont('Anton', size, 400, false, o.ls ?? 1);
  const w = measure(s);
  const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  const e = (o.ease ?? E.oq)(clamp(p));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 20, y - size * 1.02, w + 40, size * 1.24);
  ctx.clip();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = o.color ?? COL.ink;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x0, y + (1 - e) * size * 1.45);
  ctx.restore();
  return w;
}
function kicker(s, x, y, p, o = {}) {
  if (p <= 0) return;
  const e = E.oc(clamp(p));
  setFont('Oswald', o.size ?? 28, 500, false, o.ls ?? 6);
  const w = measure(s);
  const lineW = o.noLine ? 0 : 40;
  let x0 = o.align === 'center' ? x - (w + lineW + (lineW ? 18 : 0)) / 2 : x;
  ctx.save();
  ctx.globalAlpha *= e * (o.alpha ?? 1);
  ctx.fillStyle = o.color ?? COL.pl;
  if (lineW) ctx.fillRect(x0, y - (o.size ?? 28) * 0.36, lineW * e, 2);
  ctx.fillText(s, x0 + lineW + (lineW ? 18 : 0) + (1 - e) * 16, y);
  ctx.restore();
}
function serif(s, x, y, p, o = {}) {
  if (p <= 0) return;
  const e = E.oc(clamp(p));
  setFont('Fraunces', o.size ?? 56, o.weight ?? 400, o.italic ?? true, o.ls ?? 0);
  ctx.save();
  ctx.globalAlpha *= e * (o.alpha ?? 1);
  ctx.fillStyle = o.color ?? COL.ink;
  ctx.textAlign = o.align ?? 'left';
  ctx.fillText(s, x, y + (1 - e) * 18);
  ctx.restore();
}
function label(s, x, y, a = 1, o = {}) {
  setFont(o.fam ?? 'Oswald', o.size ?? 22, o.weight ?? 500, false, o.ls ?? 4);
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = o.color ?? COL.mute;
  ctx.textAlign = o.align ?? 'left';
  ctx.fillText(s, x, y);
  ctx.restore();
}
/** Párrafo cuyas palabras aparecen cuando la voz las dice. */
function spoken(i, t, x, y, o = {}) {
  const ws = words(i);
  const size = o.size ?? 72;
  setFont(o.fam ?? 'Fraunces', size, o.weight ?? 400, o.italic ?? false, o.ls ?? 0);
  const maxW = o.maxW ?? W - 2 * M;
  const lh = size * (o.lh ?? 1.18);
  const lines = [[]];
  let cw = 0;
  const sp = measure(' ');
  for (const wd of ws) {
    const txt = o.upper ? wd.w.toUpperCase() : wd.w;
    const ww = measure(txt);
    if (cw + ww > maxW && lines[lines.length - 1].length) { lines.push([]); cw = 0; }
    lines[lines.length - 1].push({ ...wd, txt, ww });
    cw += ww + sp;
  }
  const totalH = lines.length * lh;
  let yy = o.vcenter ? y - totalH / 2 + size : y;
  for (const ln of lines) {
    const lw = ln.reduce((a, b) => a + b.ww, 0) + sp * (ln.length - 1);
    let xx = o.align === 'center' ? x - lw / 2 : x;
    for (const wd of ln) {
      const p = E.oc(P(t, wd.t - 0.05, wd.t + 0.35));
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha *= p;
        ctx.fillStyle = o.color ?? COL.ink;
        ctx.fillText(wd.txt, xx, yy + (1 - p) * size * 0.3);
        ctx.restore();
      }
      xx += wd.ww + sp;
    }
    yy += lh;
  }
}
function counter(v, x, y, size, o = {}) {
  setFont('Anton', size, 400, false, 0);
  ctx.save();
  ctx.fillStyle = o.color ?? COL.ink;
  ctx.textAlign = o.align ?? 'left';
  ctx.fillText((o.prefix ?? '') + v, x, y);
  ctx.restore();
}

// ------------------------------------------------------------------ elementos de marca
/** Remolino de la marca (motivo del logo de Entropia Gym) dibujado con espirales. */
let VC = null, VX = null;
function vortex(t, a, cx = W / 2, cy = H / 2, sc = 1) {
  if (a <= 0) return;
  if (!VC) { VC = new OffscreenCanvas(960, 540); VX = VC.getContext('2d'); }
  const x = VX;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, 960, 540);
  x.filter = 'blur(6px)';
  x.globalCompositeOperation = 'lighter';
  x.translate(480, 270);
  const arms = 13;
  for (let k = 0; k < arms; k++) {
    const base = (k / arms) * Math.PI * 2 + t * 0.09 + Math.sin(k * 2.3) * 0.25;
    x.beginPath();
    for (let s = 0; s <= 70; s++) {
      const r = 18 + s * 7.4;
      const th = base + r * (0.0088 + 0.0016 * Math.sin(k * 1.7)) + 0.18 * Math.sin(r * 0.012 + k);
      const px = Math.cos(th) * r, py = Math.sin(th) * r * 0.94;
      s ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 520);
    g.addColorStop(0, 'rgba(126,79,192,0)');
    g.addColorStop(0.18, 'rgba(126,79,192,0.10)');
    g.addColorStop(0.45, 'rgba(126,79,192,0.42)');
    g.addColorStop(1, 'rgba(42,23,68,0)');
    x.strokeStyle = g;
    x.lineWidth = [3, 9, 5, 14][k % 4];
    x.stroke();
  }
  x.filter = 'none';
  ctx.save();
  ctx.globalAlpha = clamp(a);
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  ctx.scale(sc * 2, sc * 2);
  ctx.drawImage(VC, -480, -270);
  ctx.restore();
}
function logo(cx, cy, size, a = 1, sweep = -1) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 40;
  ctx.drawImage(IMG.logo, cx - size / 2, cy - size / 2, size, size);
  ctx.shadowBlur = 0;
  if (sweep >= 0 && sweep <= 1) {
    ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
    const sx = cx - size + sweep * size * 2;
    const g = ctx.createLinearGradient(sx - 120, cy - size / 2, sx + 120, cy + size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }
  ctx.restore();
}
/** Transición de marca: un panel morado que barre la pantalla. */
function wipe(lt, dir = 1, dur = 0.55) {
  const p = clamp(lt / dur);
  if (p >= 1) return;
  const e = E.ioq(p);
  ctx.save();
  ctx.fillStyle = COL.pd;
  if (dir > 0) ctx.fillRect(W * e, 0, W, H);
  else ctx.fillRect(0, 0, W * (1 - e), H);
  ctx.fillStyle = COL.p;
  const bw = 14;
  if (dir > 0) ctx.fillRect(W * e - bw, 0, bw, H);
  else ctx.fillRect(W * (1 - e), 0, bw, H);
  ctx.restore();
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function callout(x, y, r, lx, ly, p, text, sub, align = 'left') {
  if (p <= 0) return;
  ctx.save();
  ctx.strokeStyle = COL.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * E.oc(P(p, 0, 0.5)));
  ctx.stroke();
  ctx.fillStyle = COL.ink;
  ctx.beginPath(); ctx.arc(x, y, 6 * E.oc(P(p, 0, 0.3)), 0, Math.PI * 2); ctx.fill();
  const lp = E.oc(P(p, 0.3, 0.7));
  if (lp > 0) {
    const sxp = x + (lx > x ? r : -r);
    ctx.beginPath();
    ctx.moveTo(sxp, y);
    const mx = lerp(sxp, lx, lp), my = lerp(y, ly, lp);
    ctx.lineTo(mx, my);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
  const tp = P(p, 0.55, 1);
  const tx = align === 'left' ? lx + 20 : lx - 20;
  head(text, tx, ly + 34, tp, { size: 92, align });
  if (sub) serif(sub, tx, ly + 100, P(p, 0.7, 1), { size: 42, align });
}

// ------------------------------------------------------------------ línea de tiempo
const SHOTS = [];
function shot(a, b, f) { SHOTS.push({ a, b, f }); }

function buildTimeline() {
  // ======================= INTRO: apertura en frío + logo + título
  shot(0, 4.0, lt => {
    bg('#000');
    const cuts = [['carga', 0, 1.15, 0.4], ['discos', 1.15, 2.1, 0.5], ['cara1', 2.1, 3.05, 5.0], ['press2', 3.05, 4.0, 3.2]];
    for (const [n, a, b, off] of cuts) if (lt >= a && lt < b) clip(n, lt - a, { off, d: b - a, z0: 1.14, z1: 1.04, bw: true, dark: 0.3 });
    black(1 - E.oc(P(lt, 0, 0.8)));
    black(E.ic(P(lt, 3.6, 4.0)));
  });
  shot(4.0, 9.5, lt => {
    bg('#07050b');
    const out = E.ic(P(lt, 4.9, 5.5));
    ctx.save();
    const sc = 1 + out * 0.05;
    ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
    vortex(lt + 4, 0.55 * E.oc(P(lt, 0, 1.6)), W / 2, 390, 1.15);
    const e = E.ox(P(lt, 0.05, 1.3));
    logo(W / 2, 390, 380 * (0.9 + 0.1 * e), e, P(lt, 1.1, 2.1));
    head('KEVIN LEVRONE', W / 2, 760, P(lt, 0.8, 1.7), { size: 128, align: 'center', ls: 4 });
    ctx.fillStyle = COL.p;
    const rw = 360 * E.oq(P(lt, 1.3, 2.1));
    ctx.fillRect(W / 2 - rw / 2, 798, rw, 3);
    serif('El hombre que pudo ser Míster Olympia', W / 2, 872, P(lt, 1.6, 2.4), { size: 50, align: 'center', color: COL.silver });
    ctx.restore();
    black(out);
  });

  // ======================= GANCHO
  shot(S(0), S(1), lt => {
    clip('press1', lt, { off: 2, d: 3, bw: true, dark: 0.55 });
    const e = P(lt, 0.0, 0.7);
    head('4', 860, 700, e, { size: 520, align: 'right', ease: E.ox });
    head('VECES SUBCAMPEÓN', 920, 470, P(lt, 0.2, 0.9), { size: 96 });
    head('DEL MÍSTER OLYMPIA', 920, 590, P(lt, 0.35, 1.05), { size: 96, color: COL.pl });
  });
  shot(S(1), S(2), lt => {
    clip('hombro', lt, { off: 1, d: 2.7, dark: 0.5, bw: true });
    const v = Math.round(20 * E.oq(P(lt, 0.05, 1.3)));
    const a = P(lt, 0, 0.25);
    ctx.save(); ctx.globalAlpha = a; counter(v, 860, 700, 520, { prefix: '+', align: 'right' }); ctx.restore();
    head('VICTORIAS', 920, 470, P(lt, 0.2, 0.9), { size: 96 });
    head('COMO PROFESIONAL', 920, 590, P(lt, 0.35, 1.05), { size: 96, color: COL.pl });
  });
  shot(S(2), S(3), (lt, d) => {
    photo('clasica', lt, d, { f0: [0.5, 0.35], f1: [0.5, 0.45], z0: 1.0, z1: 1.12 });
    scrim('bottom', 0.85, 0.55);
    kicker('SEGÚN MUCHOS', M, H - MB - 120, P(lt, 0.2, 0.8));
    serif('El mejor físico de su época', M, H - MB, P(lt, 0.4, 1.2), { size: 84 });
  });
  shot(S(3), S(4), (lt, d) => {
    bg('#000');
    serif('…cuando le daba la gana entrenar.', W / 2, H / 2 + 20, P(lt, 0.1, 0.7), { size: 64, align: 'center', color: COL.silver });
  });
  shot(S(4), S(5), (lt, d) => {
    bg(COL.pdd);
    vortex(lt, 0.25, 420, 540, 1.1);
    // panel de foto que se abre desde abajo
    const pw = E.ioq(P(lt, 0, 0.9));
    ctx.save();
    ctx.beginPath(); ctx.rect(1000, H * (1 - pw), W - 1000, H * pw); ctx.clip();
    photo('estudio', lt, d, { x: 1000, y: 0, w: W - 1000, h: H, f0: [0.5, 0.3], f1: [0.5, 0.36], z0: 1.15, z1: 1.05 });
    ctx.restore();
    head('KEVIN', M, 470, P(lt, 0.3, 1.0), { size: 220, ls: 4 });
    head('LEVRONE', M, 690, P(lt, 0.45, 1.15), { size: 220, ls: 4 });
    kicker('THE MARYLAND MUSCLE MACHINE', M, 780, P(lt, 1.0, 1.6), { size: 28 });
  });
  shot(S(5), S(6), (lt, d) => {
    photo('pecho_lateral', lt, d, { f0: [0.5, 0.3], f1: [0.5, 0.42], z0: 1.0, z1: 1.1 });
    scrim('bottom', 0.9, 0.6);
    serif('El hombre con más talento natural', M, H - MB - 92, P(lt, 0.2, 0.9), { size: 70 });
    serif('que ha pisado un escenario', M, H - MB, P(lt, 0.6, 1.3), { size: 70, color: COL.pl });
  });
  shot(S(6), S(8), (lt, d, t) => {
    bg('#07050b');
    vortex(t * 0.6, 0.32, W / 2, H / 2, 1.3);
    const q = E.ioc(P(t, S(7) - 0.6, S(7) - 0.05));
    ctx.save(); ctx.globalAlpha = 1 - q;
    head('LA GRAN PREGUNTA', W / 2, 560, P(lt, 0.1, 0.7), { size: 150, align: 'center' });
    serif('sin respuesta del culturismo', W / 2, 660, P(lt, 0.6, 1.3), { size: 56, align: 'center', color: COL.pl });
    ctx.restore();
    kicker('LA GRAN PREGUNTA', W / 2, 360, q, { align: 'center' });
    spoken(7, t, W / 2, 520, { size: 86, align: 'center', maxW: 1400, italic: true });
  });
  shot(S(8), S(9), (lt, d) => {
    clip('cara3', lt, { off: 2, speed: 0.5, d, bw: true, dark: 0.35 });
    scrim('bottom', 0.85, 0.5);
    serif('Quédate hasta el final.', M, H - MB, P(lt, 0.2, 0.9), { size: 76 });
  });

  // ======================= ORÍGENES
  shot(S(9), S(10), (lt, d, t) => {
    photo('baltimore', lt, d, { f0: [0.3, 0.5], f1: [0.6, 0.5], z0: 1.05, z1: 1.18 });
    scrim('bottom', 0.88, 0.65);
    kicker('ORÍGENES', M, M, P(lt, 0.3, 0.9));
    head('16 · 07 · 1965', M, H - MB - 120, P(t, wordT(9, '16') - 0.1, wordT(9, '16') + 0.6), { size: 190, ls: 2 });
    const pb = P(t, wordT(9, 'Baltimore') - 0.1, wordT(9, 'Baltimore') + 0.5);
    kicker('BALTIMORE, MARYLAND', M, H - MB - 30, pb, { size: 34, color: COL.ink, noLine: true, ls: 8 });
    label('39.29° N   76.61° W', W - M, H - MB - 30, E.oc(pb), { align: 'right', size: 24 });
    wipe(lt, 1);
  });
  shot(S(10), S(11), (lt, d, t) => {
    blurBg('baltimore', lt + 6, d + 6, 0.6);
    kicker('UNO DE LOS PEQUEÑOS', M, 300, P(lt, 0.1, 0.7));
    const items = [['FAMILIA NUMEROSA', 'numerosa'], ['AMBIENTE HUMILDE', 'humilde'], ['HERMANOS Y DEPORTE', 'deporte']];
    items.forEach(([s, w], k) => {
      const tw = wordT(10, w);
      const next = k < 2 ? wordT(10, items[k + 1][1]) : 1e9;
      const dimA = 1 - 0.6 * E.oc(P(t, next - 0.1, next + 0.4));
      const st = k === 0 ? Math.min(tw, S(10) + 0.3) : tw;
      head(s, M, 470 + k * 160, P(t, st - 0.15, st + 0.5), { size: 130, alpha: dimA });
    });
  });
  shot(S(11), S(13), (lt, d, t) => {
    blurBg('adolescente', lt, d, 0.62);
    photo('adolescente', lt, d, { x: 1060, y: 0, w: W - 1060, h: H, f0: [0.5, 0.3], f1: [0.5, 0.38], z0: 1.0, z1: 1.08 });
    head('PURA AFICIÓN', M, 500, P(lt, 0.15, 0.85), { size: 150 });
    serif('Le gusta levantar pesas,', M, 620, P(t, S(12), S(12) + 0.7), { size: 54 });
    serif('pero no piensa en competir.', M, 690, P(t, wordT(12, 'pero'), wordT(12, 'pero') + 0.7), { size: 54, color: COL.pl });
  });
  shot(S(13), S(14), (lt, d, t) => {
    blurBg('adolescente', lt + 7, d + 7, 0.55);
    const items = [['PASARLO BIEN', 'pasarlo'], ['LA MÚSICA', 'música'], ['LOS AMIGOS', 'amigos']];
    items.forEach(([s, w], k) => {
      const tw = wordT(13, w);
      const st = k === 0 ? S(13) + 0.1 : tw;
      head(s, W / 2, 380 + k * 170, P(t, st - 0.1, st + 0.45), { size: 128, align: 'center', color: k === 0 ? COL.ink : k === 1 ? COL.pl : COL.ink });
    });
  });
  shot(S(14), S(15), (lt, d) => {
    photo('powerhouse', lt, d, { f0: [0.5, 0.42], f1: [0.5, 0.5], z0: 1.0, z1: 1.1 });
    scrim('bottom', 0.9, 0.6);
    kicker('CON SU FAMILIA', M, H - MB - 130, P(lt, 0.2, 0.8));
    head('UN GIMNASIO EN MARYLAND', M, H - MB, P(lt, 0.35, 1.0), { size: 120 });
  });

  // ======================= EL GOLPE
  shot(S(15), S(16), lt => {
    bg('#000');
    serif('Un golpe durísimo.', W / 2, H / 2 + 24, P(lt, 0.3, 1.1), { size: 80, align: 'center' });
  });
  shot(S(16), S(17), lt => {
    bg('#000');
    serif('Su madre muere de cáncer.', W / 2, H / 2 + 20, P(lt, 0.1, 1.2), { size: 58, align: 'center', color: COL.silver });
  });
  shot(S(17), S(18), (lt, d) => {
    photo('gym_barra', lt, d, { f0: [0.4, 0.5], f1: [0.55, 0.5], z0: 1.05, z1: 1.15, dark: 0.15 });
    scrim('bottom', 0.85, 0.5);
    serif('Canaliza ese dolor en el gimnasio.', M, H - MB, P(lt, 0.3, 1.1), { size: 70 });
    black(1 - P(lt, 0, 0.6));
  });
  shot(S(18), S(19), (lt, d, t) => {
    clip('vendas', lt, { off: 0, speed: 0.55, d, bw: true, dark: 0.3 });
    scrim('bottom', 0.88, 0.55);
    const tc = wordT(18, 'convierten') - 0.3;
    const outA = 1 - E.oc(P(t, tc - 0.4, tc));
    ctx.save(); ctx.globalAlpha = outA;
    serif('Las pesas dejan de ser un pasatiempo', M, H - MB, P(lt, 0.2, 1.0), { size: 68 });
    ctx.restore();
    serif('y se convierten en su forma de seguir adelante.', M, H - MB, P(t, tc, tc + 0.8), { size: 68, color: COL.pl });
  });
  shot(S(19), S(21), (lt, d, t) => {
    clip('cara2', lt, { off: 0.5, speed: 0.7, d, z0: 1.05, z1: 1.25, fy: 0.35, dark: 0.15 });
    scrim('bottom', 0.88, 0.6);
    kicker('SU CUERPO RESPONDE', M, H - MB - 140, P(t, S(20), S(20) + 0.6));
    head('COMO MUY POCOS EN EL MUNDO', M, H - MB, P(t, S(20) + 0.3, S(20) + 1.0), { size: 120 });
  });

  // ======================= EL ASCENSO
  shot(S(21), S(22), (lt, d) => {
    bg(COL.bg);
    kicker('EL ASCENSO', M, M + 10, P(lt, 0.2, 0.7));
    // curva de progreso que se dispara
    const p = E.ioc(P(lt, 0.1, 1.6));
    ctx.save();
    ctx.strokeStyle = COL.p; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    const N = 80;
    for (let k = 0; k <= N * p; k++) {
      const u = k / N;
      const x = lerp(M, W - M, u), y = lerp(860, 220, Math.pow(u, 3.2));
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = COL.dim; ctx.fillRect(M, 862, W - 2 * M, 2);
    ctx.restore();
    head('UN PROGRESO CASI ABSURDO', M, 560, P(lt, 0.3, 1.0), { size: 120 });
    wipe(lt, 1);
  });
  shot(S(22), S(24), (lt, d, t) => {
    bg(COL.bg);
    const out = E.ioc(P(t, S(23) - 0.3, S(23) + 0.4));
    // --- comparación de trayectorias (sin fechas inventadas)
    ctx.save();
    ctx.globalAlpha = 1 - out;
    ctx.translate(0, -out * 80);
    const x0 = M, x1 = W - M;
    ctx.fillStyle = COL.dim; ctx.fillRect(x0, 760, x1 - x0, 2);
    label('TIEMPO', x1, 800, 1, { align: 'right' });
    const pa = E.oq(P(t, wordT(22, 'década') - 0.4, wordT(22, 'década') + 1.0));
    ctx.fillStyle = '#3a3542'; ctx.fillRect(x0, 470, (x1 - x0) * pa, 64);
    label('OTROS CULTURISTAS', x0, 450, P(t, S(22), S(22) + 0.5), { color: COL.mute, size: 24 });
    head('UNA DÉCADA', x0 + 24, 523, P(t, wordT(22, 'década') + 0.3, wordT(22, 'década') + 0.9), { size: 44, color: COL.ink });
    const pk = E.oq(P(t, wordT(22, 'Kevin') - 0.1, wordT(22, 'Kevin') + 0.8));
    const kw = (x1 - x0) * 0.3;
    ctx.fillStyle = COL.p; ctx.fillRect(x0, 620, kw * pk, 64);
    label('KEVIN LEVRONE', x0, 600, P(t, wordT(22, 'Kevin'), wordT(22, 'Kevin') + 0.5), { color: COL.pl, size: 24 });
    head('APENAS UNOS AÑOS', x0 + 24, 673, P(t, wordT(22, 'apenas') - 0.1, wordT(22, 'apenas') + 0.5), { size: 44 });
    const pn = E.oc(P(t, wordT(22, 'Nacionales') - 0.2, wordT(22, 'Nacionales') + 0.5));
    if (pn > 0) {
      const mx = x0 + kw;
      ctx.fillStyle = COL.ink;
      ctx.beginPath(); ctx.arc(mx, 652, 14 * pn, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(mx - 1, 652, 2, 108 * pn);
      head('1991', mx + 40, 360, pn, { size: 110 });
      kicker('NACIONALES NPC', mx + 44, 400, pn, { noLine: true, color: COL.ink, size: 26 });
      ctx.fillStyle = COL.ink; ctx.fillRect(mx - 1, 410, 2, 210 * pn);
    }
    ctx.restore();
    // --- tarjeta profesional (render 3D simulado)
    const pc = P(t, S(23) - 0.1, S(23) + 1.2);
    if (pc > 0) {
      const rot = (1 - E.oq(pc)) * 1.35 + Math.sin((t - S(23)) * 0.8) * 0.06;
      const cw = 760, ch = 460;
      const cx = W / 2, cy = 520;
      const sx = Math.cos(rot);
      ctx.save();
      ctx.translate(cx, cy + (1 - E.oq(pc)) * 120);
      ctx.transform(sx, Math.sin(rot) * 0.12, 0, 1, 0, 0);
      ctx.globalAlpha = E.oc(P(pc, 0, 0.3));
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
      const g = ctx.createLinearGradient(-cw / 2, -ch / 2, cw / 2, ch / 2);
      g.addColorStop(0, '#3a1f60'); g.addColorStop(1, '#170d26');
      ctx.fillStyle = g; rrect(-cw / 2, -ch / 2, cw, ch, 28); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.save(); rrect(-cw / 2, -ch / 2, cw, ch, 28); ctx.clip();
      vortex(t, 0.35, cw / 2 - 60, -ch / 2 + 40, 0.45);
      const sw = ((t - S(23)) * 0.55) % 1.6;
      const gx = -cw + sw * cw * 1.6;
      const sg = ctx.createLinearGradient(gx, -ch / 2, gx + 260, ch / 2);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.restore();
      label('TARJETA PROFESIONAL', -cw / 2 + 56, -ch / 2 + 80, 1, { color: COL.pl, size: 26, ls: 6 });
      setFont('Anton', 150, 400, false, 6); ctx.fillStyle = COL.ink; ctx.fillText('IFBB', -cw / 2 + 50, 40);
      label('KEVIN LEVRONE', -cw / 2 + 56, ch / 2 - 64, 1, { color: COL.ink, size: 34, ls: 5 });
      label('1991', cw / 2 - 56, ch / 2 - 64, 1, { color: COL.ink, size: 34, ls: 5, align: 'right' });
      ctx.restore();
    }
  });
  // 1992
  shot(S(24), S(25), (lt, d, t) => {
    photo('yates_levrone_bn', lt, d, { f0: [0.3, 0.35], f1: [0.5, 0.4], bw: true, cardX: 0.33, cardY: 0.5 });
    scrim('right', 0.9, 0.6);
    head('1992', W - M, 560, P(lt, 0.1, 0.8), { size: 300, align: 'right' });
    kicker('PRIMER AÑO COMO PROFESIONAL', W - M - 560, 650, P(lt, 0.5, 1.1), { size: 26 });
  });
  shot(S(25), S(26), (lt, d, t) => {
    bg('#060409');
    // foco de escenario
    const g = ctx.createRadialGradient(W / 2, -100, 50, W / 2, 500, 900);
    g.addColorStop(0, 'rgba(184,157,230,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    kicker('MÍSTER OLYMPIA 1992', W / 2, 150, P(lt, 0.1, 0.7), { align: 'center', size: 28 });
    const blocks = [
      { x: 640, h: 230, n: '2', name: 'KEVIN LEVRONE', c: COL.p, tw: wordT(25, 'segundo') },
      { x: 1280, h: 330, n: '1', name: 'DORIAN YATES', c: '#4a4452', tw: wordT(25, 'Dorian') },
    ];
    for (const b of blocks) {
      const e = E.oq(P(t, b.tw - 0.5, b.tw + 0.6));
      const bw = 420, depth = 70;
      const floor = 860;
      const hh = b.h * e;
      const x = b.x - bw / 2;
      // cara superior
      ctx.fillStyle = b.c === COL.p ? '#9a6fd6' : '#6a6373';
      ctx.beginPath();
      ctx.moveTo(x, floor - hh); ctx.lineTo(x + depth, floor - hh - depth * 0.5);
      ctx.lineTo(x + bw + depth, floor - hh - depth * 0.5); ctx.lineTo(x + bw, floor - hh); ctx.closePath(); ctx.fill();
      // lateral
      ctx.fillStyle = b.c === COL.p ? '#3d2263' : '#2b2730';
      ctx.beginPath();
      ctx.moveTo(x + bw, floor - hh); ctx.lineTo(x + bw + depth, floor - hh - depth * 0.5);
      ctx.lineTo(x + bw + depth, floor - depth * 0.5); ctx.lineTo(x + bw, floor); ctx.closePath(); ctx.fill();
      // frontal
      ctx.fillStyle = b.c; ctx.fillRect(x, floor - hh, bw, hh);
      if (e > 0.6) {
        ctx.save(); ctx.globalAlpha = P(e, 0.6, 1);
        setFont('Anton', 150, 400, false, 0); ctx.fillStyle = COL.ink; ctx.textAlign = 'center';
        ctx.fillText(b.n, b.x, floor - hh + 170);
        ctx.restore();
      }
      head(b.name, b.x, floor + 90, P(t, b.tw, b.tw + 0.6), { size: 64, align: 'center', color: b.c === COL.p ? COL.ink : COL.mute });
    }
    ctx.fillStyle = '#1c1722'; ctx.fillRect(0, 860, W, 4);
  });
  const punch = (i, draw, txt, size, color) => shot(S(i), S(i + 1), (lt, d, t) => {
    draw(lt, d);
    const s = 1 + 0.05 * (1 - E.ox(P(lt, 0, 0.6)));
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
    head(txt, W / 2, H / 2 + size * 0.36, P(lt, 0, 0.35), { size, align: 'center', color, ease: E.ox });
    ctx.restore();
  });
  punch(26, (lt, d) => clip('press3', lt, { off: 2, d, bw: true, dark: 0.55 }), 'UN NOVATO.', 240);
  punch(27, (lt, d) => clip('dobleb', lt, { off: 3, d, bw: true, dark: 0.55, fy: 0.4 }), 'EN SU PRIMER OLYMPIA.', 170);
  punch(28, (lt, d) => photo('clasica', lt, d, { f0: [0.5, 0.45], z0: 1.1, z1: 1.2, dark: 0.5 }), 'SEGUNDO DEL MUNDO.', 190, COL.ink);
  // revistas
  shot(S(29), S(32), (lt, d, t) => {
    bg('#0c0a10');
    const g = ctx.createRadialGradient(700, 540, 100, 700, 540, 900);
    g.addColorStop(0, 'rgba(126,79,192,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cam = 1 + 0.05 * E.ios(P(lt, 0, d));
    ctx.save(); ctx.translate(700, 540); ctx.scale(cam, cam); ctx.translate(-700, -540);
    const covers = [['revista', 380, 560, -0.12, 0.0], ['flex_portada', 700, 520, 0.08, 0.35]];
    for (const [n, x, y, r, delay] of covers) {
      const e = E.oq(P(lt, delay, delay + 0.9));
      const img = IMG[n];
      const ch = 640, cw = (img.width / img.height) * ch;
      ctx.save();
      ctx.translate(x, y - (1 - e) * 260);
      ctx.rotate(r + (1 - e) * 0.25);
      ctx.globalAlpha = E.oc(P(lt, delay, delay + 0.3));
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 25;
      ctx.fillStyle = '#000'; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.filter = GRADE;
      ctx.drawImage(img, -cw / 2, -ch / 2, cw, ch);
      ctx.filter = 'none';
      ctx.restore();
    }
    ctx.restore();
    kicker('LAS REVISTAS LO TENÍAN CLARO', 1100, 400, P(lt, 0.3, 0.9), { size: 24 });
    head('EL PRÓXIMO', 1100, 530, P(t, S(30), S(30) + 0.6), { size: 108 });
    head('MÍSTER OLYMPIA', 1100, 660, P(t, S(30) + 0.2, S(30) + 0.8), { size: 108, color: COL.pl });
    serif('Solo era cuestión de tiempo.', 1100, 760, P(t, S(31), S(31) + 0.7), { size: 50 });
  });
  shot(S(32), S(35), (lt, d, t) => {
    bg('#000');
    kicker('SPOILER', W / 2, 330, P(lt, 0.05, 0.4), { align: 'center', size: 30, color: COL.mute });
    head('NUNCA LLEGÓ.', W / 2, 640, P(t, S(33) + 0.15, S(33) + 0.6), { size: 260, align: 'center', ease: E.ox });
    serif('Y la razón es lo más interesante de su historia.', W / 2, 790, P(t, S(34), S(34) + 0.8), { size: 52, align: 'center', color: COL.silver });
  });

  // ======================= LA MÁQUINA
  shot(S(35), S(36), (lt, d) => {
    blurBg('clasica', lt, d, 0.45);
    kicker('LA MÁQUINA', W / 2, 420, P(lt, 0.1, 0.6), { align: 'center' });
    serif('¿Qué tenía de especial?', W / 2, 590, P(lt, 0.2, 0.9), { size: 110, align: 'center', italic: true });
    wipe(lt, -1);
  });
  shot(S(36), S(37), (lt, d) => {
    const m = photo('clasica', lt, d, { f0: [0.5, 0.42], f1: [0.5, 0.5], z0: 1.0, z1: 1.15, dark: 0.1 });
    scrim('bottom', 0.6, 0.4);
    const p = P(lt, 0.4, 2.0);
    const [ax, ay] = m.map(0.355, 0.47), [bx, by] = m.map(0.655, 0.47);
    const r = 92 * m.s * (1500 / IMG.clasica.width) * 0.65;
    ctx.save(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * E.oc(P(p, 0.1, 0.6))); ctx.stroke();
    ctx.restore();
    callout(ax, ay, r, M + 380, 300, p, 'HOMBROS', 'Enormes y redondos', 'right');
  });
  shot(S(37), S(38), (lt, d, t) => {
    bg(COL.bg);
    const med = [['estudio', 0.17, 0.4, 1.9], ['pecho_lateral', 0.78, 0.42, 1.8], ['espalda', 0.22, 0.33, 1.8]];
    med.forEach(([n, u, v, z], k) => {
      const e = E.oq(P(lt, 0.1 + k * 0.18, 0.8 + k * 0.18));
      const cx = W / 2 + (k - 1) * 470, cy = 470, r = 200;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(cx, cy + (1 - e) * 60);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
      const img = IMG[n];
      const m = coverMap(img, -r, -r, 2 * r, 2 * r, u, v, z + 0.03 * lt / d);
      ctx.filter = GRADE;
      ctx.drawImage(img, m.sx, m.sy, m.sw, m.sh, -r, -r, 2 * r, 2 * r);
      ctx.filter = 'none';
      tint(-r, -r, 2 * r, 2 * r, 0.3);
      ctx.restore();
      // anillo graduado que gira: "desde cualquier ángulo"
      ctx.save();
      ctx.translate(cx, cy + (1 - e) * 60);
      ctx.rotate(lt * 0.25 + k);
      ctx.globalAlpha = e * 0.8;
      ctx.strokeStyle = COL.pl; ctx.lineWidth = 2;
      for (let a = 0; a < 72; a++) {
        const ang = (a / 72) * Math.PI * 2;
        const l = a % 6 === 0 ? 18 : 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * (r + 14), Math.sin(ang) * (r + 14));
        ctx.lineTo(Math.cos(ang) * (r + 14 + l), Math.sin(ang) * (r + 14 + l));
        ctx.stroke();
      }
      ctx.restore();
    });
    kicker('DESDE CUALQUIER ÁNGULO', W / 2, 780, P(lt, 0.3, 0.9), { align: 'center' });
    head('BALAS DE CAÑÓN', W / 2, 920, P(t, wordT(37, 'balas') - 0.1, wordT(37, 'balas') + 0.5), { size: 120, align: 'center' });
  });
  shot(S(38), S(39), (lt, d) => {
    const m = photo('triceps', lt, d, { f0: [0.5, 0.5], z0: 1.0, z1: 1.03, x: 640, w: W - 640 });
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, 640, H);
    const [ax, ay] = m.map(0.2, 0.5);
    callout(ax, ay, 120, 600, 380, P(lt, 0.4, 1.8), 'BRAZOS', 'Llenos y densos', 'right');
    serif('Una estética difícil de igualar.', M, 860, P(lt, 2.4, 3.2), { size: 44, color: COL.silver });
  });
  shot(S(39), S(40), (lt, d, t) => {
    blurBg('estudio', lt, d, 0.65);
    const pw = 620, px = W / 2 - pw / 2;
    const m = photo('estudio', lt, d, { x: px, y: 0, w: pw, h: H, f0: [0.5, 0.45], z0: 1.0, z1: 1.06 });
    // eje de simetría
    const pa = E.ioc(P(lt, 0.3, 1.2));
    ctx.save();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(W / 2, 60); ctx.lineTo(W / 2, 60 + (H - 120) * pa); ctx.stroke();
    ctx.setLineDash([]);
    const levels = [[0.4, 300], [0.62, 220], [0.86, 250]];
    levels.forEach(([v, half], k) => {
      const e = E.oq(P(lt, 1.0 + k * 0.25, 1.7 + k * 0.25));
      const [, yy] = m.map(0.5, v);
      ctx.strokeStyle = COL.pl; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - half * e, yy); ctx.lineTo(W / 2 + half * e, yy); ctx.stroke();
      ctx.fillStyle = COL.pl;
      for (const sx of [-1, 1]) { ctx.fillRect(W / 2 + sx * half * e - 1, yy - 12, 2, 24); }
    });
    ctx.restore();
    head('TAMAÑO', px - 60, 560, P(t, wordT(39, 'tamaño') - 0.1, wordT(39, 'tamaño') + 0.5), { size: 120, align: 'right' });
    head('SIMETRÍA', px + pw + 60, 560, P(t, wordT(39, 'simetría') - 0.1, wordT(39, 'simetría') + 0.5), { size: 120, color: COL.pl });
    serif('Una combinación rarísima en la era de los gigantes.', W / 2, H - 80, P(t, wordT(39, 'combinación'), wordT(39, 'combinación') + 0.8), { size: 44, align: 'center' });
  });
  shot(S(40), S(41), (lt, d, t) => {
    bg(COL.bg);
    kicker('RECUPERACIÓN', M, M + 10, P(lt, 0.1, 0.6));
    const gx = M + 40, gy = 300, gw = 960, gh = 520;
    ctx.fillStyle = COL.dim;
    ctx.fillRect(gx, gy + gh, gw * E.oq(P(lt, 0.2, 0.9)), 2);
    ctx.fillRect(gx, gy + gh - gh * E.oq(P(lt, 0.2, 0.9)), 2, gh * E.oq(P(lt, 0.2, 0.9)));
    label('TIEMPO', gx + gw, gy + gh + 44, P(lt, 0.6, 1), { align: 'right' });
    label('FORMA', gx, gy - 24, P(lt, 0.6, 1));
    const curve = (k, u) => { // caída tras el esfuerzo y vuelta
      const dip = Math.exp(-Math.pow((u - 0.18) / 0.08, 2)) * 0.5;
      const rec = 1 / (1 + Math.exp(-(u - (k ? 0.42 : 0.78)) * (k ? 16 : 9)));
      return 0.35 - dip * (1 - rec) + rec * (k ? 0.55 : 0.4);
    };
    const draw = (k, p, col, wdt) => {
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let s = 0; s <= 200 * p; s++) {
        const u = s / 200;
        const x = gx + u * gw, y = gy + gh - curve(k, u) * gh;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    };
    const p0 = E.ioc(P(lt, 0.8, 3.6)), p1 = E.ioc(P(t, wordT(40, 'ponerse') - 0.8, wordT(40, 'ponerse') + 1.6));
    draw(0, p0, '#5a5463', 4);
    draw(1, p1, COL.p, 7);
    if (p0 > 0.98) label('MEDIA', gx + gw + 24, gy + gh - curve(0, 1) * gh + 8, P(lt, 3.5, 4.0));
    if (p1 > 0.98) label('LEVRONE', gx + gw + 24, gy + gh - curve(1, 1) * gh + 8, 1, { color: COL.pl });
    head('EN FORMA EN', 1400, 520, P(t, wordT(40, 'ponerse'), wordT(40, 'ponerse') + 0.6), { size: 72 });
    head('TIEMPO RÉCORD', 1400, 610, P(t, wordT(40, 'récord') - 0.2, wordT(40, 'récord') + 0.4), { size: 72, color: COL.pl });
  });
  shot(S(41), S(43), (lt, d, t) => {
    photo('pose_dos', lt, d, { f0: [0.5, 0.45], f1: [0.68, 0.45], z0: 1.0, z1: 1.2 });
    scrim('bottom', 0.9, 0.55);
    kicker('MUCHOS CULTURISTAS DE SU ÉPOCA', M, H - MB - 250, P(lt, 0.2, 0.8));
    head('EL RIVAL QUE NADIE', M, H - MB - 120, P(t, wordT(42, 'rival') - 0.2, wordT(42, 'rival') + 0.4), { size: 110 });
    head('QUERÍA TENER AL LADO', M, H - MB, P(t, wordT(42, 'quería') - 0.2, wordT(42, 'quería') + 0.4), { size: 110, color: COL.pl });
  });

  // ======================= EL MÉTODO
  shot(S(43), S(44), (lt, d) => {
    clip('discos', lt, { off: 0, speed: 0.6, d, dark: 0.35 });
    scrim('bottom', 0.85, 0.55);
    kicker('EL MÉTODO', M, H - MB - 120, P(lt, 0.4, 1.0));
    serif('Tan peculiar como su carrera.', M, H - MB, P(lt, 0.6, 1.3), { size: 76 });
    wipe(lt, 1);
  });
  shot(S(44), S(45), (lt, d) => {
    clip('press1', lt, { off: 3, d, dark: 0.45 });
    head('PESOS PESADOS', W / 2, H / 2 + 90, P(lt, 0.2, 0.7), { size: 250, align: 'center', ease: E.ox });
  });
  shot(S(45), S(46), (lt, d, t) => {
    bg(COL.bg);
    const pw = E.ioq(P(lt, 0, 0.8));
    clip('press2', lt, { off: 0, d, x: 0, y: 0, w: 900 * pw, h: H, dark: 0.1 });
    kicker('CARGAS BRUTALES EN BÁSICOS', 1020, 330, P(lt, 0.4, 1.0));
    [['PRESS DE BANCA', 'banca'], ['SENTADILLA', 'sentadilla'], ['PRESS MILITAR', 'militar']].forEach(([s, w], k) => {
      const tw = wordT(45, w);
      const p = P(t, tw - 0.3, tw + 0.3);
      ctx.fillStyle = COL.p; ctx.fillRect(1020, 410 + k * 150, 60 * E.oq(p), 4);
      head(s, 1110, 450 + k * 150, p, { size: 96 });
    });
  });
  shot(S(46), S(48), (lt, d, t) => {
    bg(COL.bg);
    kicker('NADA DE RUTINAS COMPLICADAS', M, M + 10, P(lt, 0.1, 0.6));
    const s = E.ioc(P(t, S(47) - 0.2, S(47) + 1.1));
    const names = [['CLÁSICOS', 'clásicos'], ['PESADOS', 'pesados'], ['INTENSOS', 'intensidad']];
    for (let k = 0; k < 3; k++) {
      const by = 420 + k * 190;
      ctx.save();
      ctx.strokeStyle = k === 1 ? COL.p : COL.ink; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      const draw = E.oc(P(lt, 0.1 + k * 0.15, 1.2 + k * 0.15));
      for (let q = 0; q <= 240 * draw; q++) {
        const u = q / 240;
        const tx = (Math.sin(u * Math.PI * (7 + k * 2) + k * 1.7 + lt * 0.8) * 260 + Math.cos(u * Math.PI * 13 + k) * 120) * (1 - s);
        const ty = (Math.sin(u * Math.PI * (4 + k) + k + lt * 0.6) * 190 + Math.cos(u * Math.PI * (9 + k) + k) * 90) * (1 - s);
        const x = lerp(M + 400, W - M, u) + tx, y = by + ty;
        q ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
      const tw = wordT(47, names[k][1]);
      head(names[k][0], M, by + 30, P(t, tw - 0.2, tw + 0.4), { size: 80 });
    }
  });
  shot(S(48), S(50), (lt, d, t) => {
    bg(COL.bg);
    kicker('SESIONES', M, M + 10, P(lt, 0.1, 0.6));
    head('INTENSAS, PERO NO ETERNAS', M, M + 140, P(lt, 0.2, 0.8), { size: 100 });
    const floor = 880;
    const tA = S(48) + 1.0, tB = wordT(49, 'horas') - 0.6;
    for (let k = 0; k < 3; k++) {
      const e = E.oq(P(t, tA + k * 0.15, tA + 0.8 + k * 0.15));
      ctx.fillStyle = COL.p; ctx.fillRect(M + k * 110, floor - 420 * e, 80, 420 * e);
    }
    label('POCAS SERIES, MUY DURAS', M, floor + 50, P(t, wordT(49, 'pocas') - 0.2, wordT(49, 'pocas') + 0.4), { color: COL.ink, size: 26 });
    for (let k = 0; k < 16; k++) {
      const e = E.oq(P(t, tB + k * 0.06, tB + 0.6 + k * 0.06));
      ctx.fillStyle = '#4a4452'; ctx.fillRect(820 + k * 62, floor - 150 * e, 44, 150 * e);
    }
    label('HORAS EN EL GIMNASIO', 820, floor + 50, P(t, tB, tB + 0.5), { size: 26 });
    ctx.fillStyle = COL.dim; ctx.fillRect(M, floor, W - 2 * M, 2);
  });
  shot(S(50), S(52), (lt, d, t) => {
    clip('cara1', lt, { off: 4.5, speed: 0.6, d, dark: 0.35, fy: 0.35 });
    scrim('bottom', 0.88, 0.55);
    kicker('UNA LECCIÓN PARA TODOS', M, H - MB - 140, P(lt, 0.2, 0.8));
    head('SIN SECRETOS MÁGICOS', M, H - MB, P(t, S(51), S(51) + 0.6), { size: 140 });
  });
  shot(S(52), S(53), (lt, d, t) => {
    bg(COL.bg);
    const cy = 560;
    // barra
    const be = E.oq(P(lt, 0, 0.6));
    ctx.fillStyle = '#8d8896';
    ctx.fillRect(W / 2 - 760 * be, cy - 9, 1520 * be, 18);
    ctx.fillStyle = '#b8b3c1';
    ctx.fillRect(W / 2 - 520 * be, cy - 12, 24, 24); ctx.fillRect(W / 2 + 496 * be, cy - 12, 24, 24);
    const terms = [['BÁSICOS', 'básicos'], ['PROGRESIÓN DE CARGAS', 'progresión'], ['INTENSIDAD', 'intensidad']];
    // fila de la ecuación centrada con medidas reales
    setFont('Anton', 76, 400, false, 1);
    const plusW = 90;
    const widths = terms.map(([s]) => measure(s));
    const total = widths.reduce((a, b) => a + b, 0) + plusW * 2;
    let ex = W / 2 - total / 2;
    terms.forEach(([s, w], k) => {
      const tw = wordT(52, w);
      const e = E.oq(P(t, tw - 0.25, tw + 0.35));
      const ph = 300 - k * 40, pwid = 46;
      for (const sd of [-1, 1]) {
        const target = W / 2 + sd * (560 + k * 58);
        const x = lerp(W / 2 + sd * 1100, target, e);
        ctx.fillStyle = k === 2 ? COL.p : '#26222b';
        rrect(x - pwid / 2, cy - ph / 2, pwid, ph, 8); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x - pwid / 2 + 6, cy - ph / 2 + 10, 6, ph - 20);
      }
      head(s, ex, 300, P(t, tw - 0.1, tw + 0.4), { size: 76, color: k === 2 ? COL.pl : COL.ink });
      ex += widths[k];
      if (k < 2) head('+', ex + plusW / 2, 300, P(t, tw + 0.2, tw + 0.5), { size: 76, align: 'center', color: COL.mute });
      ex += plusW;
    });
  });
  shot(S(53), S(54), (lt, d) => {
    photo('pecho_lateral', lt, d, { f0: [0.5, 0.4], cardX: 0.72, cardY: 0.5 });
    scrim('left', 0.85, 0.7);
    kicker('LO QUE MARCABA LA DIFERENCIA', M, 420, P(lt, 0.1, 0.6));
    head('SU GENÉTICA', M, 600, P(lt, 0.3, 0.9), { size: 200 });
  });
  shot(S(54), S(55), (lt, d, t) => {
    bg(COL.bg);
    serif('Y lo que hacía, o no hacía,', M, 360, P(lt, 0.1, 0.8), { size: 60 });
    head('EL RESTO DEL AÑO', M, 520, P(t, wordT(54, 'resto') - 0.1, wordT(54, 'resto') + 0.5), { size: 130 });
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const bw = (W - 2 * M - 11 * 16) / 12;
    months.forEach((m, k) => {
      const e = E.oq(P(lt, 0.6 + k * 0.06, 1.2 + k * 0.06));
      ctx.save(); ctx.globalAlpha = e;
      ctx.strokeStyle = COL.dim; ctx.lineWidth = 2;
      ctx.strokeRect(M + k * (bw + 16), 640, bw, 220);
      label(m, M + k * (bw + 16) + 16, 840, 1, { size: 22 });
      ctx.restore();
    });
  });
  shot(S(55), S(57), (lt, d, t) => {
    bg('#07050b');
    vortex(t, 0.5 * E.oc(P(lt, 0, 1)), W / 2, H / 2, 1.2);
    serif('Lo que lo convirtió en leyenda…', W / 2, 360, P(lt, 0.2, 0.9), { size: 56, align: 'center', color: COL.silver });
    head('¿Y SI…?', W / 2, 720, P(t, S(56) - 0.05, S(56) + 0.4), { size: 330, align: 'center', ease: E.ox });
  });

  // ======================= TALENTO VS. DISCIPLINA
  shot(S(57), S(58), (lt, d) => {
    clip('banca_top', lt, { off: 0, speed: 0.6, d, dark: 0.4 });
    scrim('bottom', 0.9, 0.6);
    kicker('TALENTO VS. DISCIPLINA', M, H - MB - 250, P(lt, 0.3, 0.9));
    head('BUENA PARTE DEL AÑO,', M, H - MB - 120, P(lt, 0.5, 1.1), { size: 110 });
    head('SIN ENTRENAR DURO', M, H - MB, P(lt, 0.7, 1.3), { size: 110, color: COL.pl });
    wipe(lt, -1);
  });
  shot(S(58), S(60), (lt, d, t) => {
    bg(COL.bg);
    kicker('OTRAS PASIONES', M, M + 10, P(lt, 0.1, 0.6));
    const cards = [['MÚSICA', 'música', 'bateria', 'Su propia banda'], ['ACTUACIÓN', 'actuación', 'estudio', ''], ['NEGOCIOS', 'negocios', 'creatina', '']];
    const cw = (W - 2 * M - 2 * 40) / 3, ch = 640, cy = 260;
    cards.forEach(([s, w, img, sub], k) => {
      const tw = wordT(59, w);
      const e = E.oq(P(t, tw - 0.35, tw + 0.5));
      if (e <= 0) return;
      const x = M + k * (cw + 40);
      ctx.save();
      ctx.globalAlpha = E.oc(P(e, 0, 0.4));
      ctx.translate(0, (1 - e) * 80);
      rrect(x, cy, cw, ch, 18); ctx.clip();
      if (k === 0) photo('bateria', t - tw, 6, { x, y: cy, w: cw, h: ch, bw: true, f0: [0.5, 0.4], z0: 1.05, z1: 1.15 });
      else {
        const im = IMGB[img];
        const m = coverMap(im, x, cy, cw, ch, 0.5, 0.5, 1.2);
        ctx.filter = 'grayscale(0.6)';
        ctx.drawImage(im, m.sx, m.sy, m.sw, m.sh, x, cy, cw, ch);
        ctx.filter = 'none';
        tint(x, cy, cw, ch, 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, cy, cw, ch);
      }
      const g = ctx.createLinearGradient(0, cy + ch, 0, cy + ch * 0.4);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, cy, cw, ch);
      ctx.restore();
      head(s, x + 36, cy + ch - 60 + (1 - e) * 80, P(e, 0.3, 1), { size: 80 });
      if (sub) serif(sub, x + 36, cy + ch - 150 + (1 - e) * 80, P(e, 0.5, 1), { size: 36, color: COL.pl });
    });
  });
  shot(S(60), S(61), (lt, d, t) => {
    const tm = wordT(60, 'monstruo') - 0.35;
    const cuts = [['vendas', 0, 1.6, 3], ['press3', 1.6, 3.2, 4], ['cara3', 3.2, 4.8, 4.5], ['hombro', 4.8, 99, 4]];
    if (t < tm) {
      for (const [n, a, b, off] of cuts) if (lt >= a && lt < b) clip(n, lt - a, { off, d: 1.6, z0: 1.12, z1: 1.02, bw: true, dark: 0.35 });
      kicker('POCAS SEMANAS ANTES', W / 2, H / 2 - 120, P(lt, 0.1, 0.6), { align: 'center', color: COL.ink, size: 30 });
      head('SE ENCERRABA EN EL GIMNASIO', W / 2, H / 2 + 60, P(t, wordT(60, 'encerraba') - 0.1, wordT(60, 'encerraba') + 0.5), { size: 120, align: 'center' });
    } else {
      photo('clasica', t - tm, 2.5, { f0: [0.5, 0.45], z0: 1.15, z1: 1.05, dark: 0.25 });
      head('COMO UN MONSTRUO', W / 2, H - MB, P(t, tm, tm + 0.4), { size: 170, align: 'center', ease: E.ox });
    }
  });
  shot(S(61), S(64), (lt, d, t) => {
    bg(COL.bg);
    kicker('PENSADLO UN MOMENTO', M, M + 10, P(lt, 0.1, 0.6));
    const cell = 20, gap = 4, cols = 53, rows = 7;
    const gx = W - M - cols * (cell + gap) + gap;
    const rowsY = [330, 610];
    const tf = wordT(62, 'trescientos');
    const pr = P(t, tf - 0.3, tf + 2.6);
    const pk = P(t, wordT(62, 'semanas') - 0.2, wordT(62, 'semanas') + 0.8);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const idx = c * 7 + r;
      if (idx >= 365) continue;
      for (let g = 0; g < 2; g++) {
        const x = gx + c * (cell + gap), y = rowsY[g] + r * (cell + gap);
        let fill = '#1c1921';
        if (g === 0 && idx / 365 < pr) fill = '#8d8896';
        if (g === 1 && c >= cols - 6 && (c - (cols - 6)) / 6 < pk) fill = COL.p;
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, cell, cell);
      }
    }
    head('SUS RIVALES', M, rowsY[0] + 80, P(lt, 0.4, 1.0), { size: 64 });
    label('365 DÍAS AL AÑO', M, rowsY[0] + 130, P(t, tf, tf + 0.6), { size: 24 });
    head('KEVIN', M, rowsY[1] + 80, P(t, wordT(62, 'Kevin') - 0.2, wordT(62, 'Kevin') + 0.4), { size: 64, color: COL.pl });
    label('UNAS SEMANAS', M, rowsY[1] + 130, P(t, wordT(62, 'semanas') - 0.2, wordT(62, 'semanas') + 0.4), { size: 24, color: COL.pl });
    serif('…y aun así les plantaba cara.', M, 960, P(t, S(63), S(63) + 0.7), { size: 54 });
  });
  shot(S(64), S(66), (lt, d, t) => {
    const sp = E.ioc(P(lt, 0, 0.7));
    ctx.fillStyle = '#141217'; ctx.fillRect(0, 0, W / 2, H);
    ctx.fillStyle = COL.pd; ctx.fillRect(W / 2, 0, W / 2, H);
    vortex(t, 0.4 * E.oc(P(t, S(65), S(65) + 1)), W * 0.75, H / 2, 0.8);
    ctx.fillStyle = COL.p; ctx.fillRect(W / 2 - 2, H / 2 - (H / 2) * sp, 4, H * sp);
    kicker('PARA UNOS', W / 4, 420, P(lt, 0.2, 0.7), { align: 'center', color: COL.mute });
    head('FALTA DE', W / 4, 560, P(lt, 0.3, 0.9), { size: 120, align: 'center', color: COL.mute });
    head('COMPROMISO', W / 4, 690, P(lt, 0.4, 1.0), { size: 120, align: 'center', color: COL.mute });
    kicker('PARA OTROS', W * 0.75, 420, P(t, S(65), S(65) + 0.5), { align: 'center' });
    head('UN', W * 0.75, 560, P(t, wordT(65, 'fenómeno') - 0.4, wordT(65, 'fenómeno') + 0.2), { size: 120, align: 'center' });
    head('FENÓMENO', W * 0.75, 690, P(t, wordT(65, 'fenómeno') - 0.2, wordT(65, 'fenómeno') + 0.4), { size: 120, align: 'center' });
  });

  // ======================= LOS RIVALES
  shot(S(66), S(67), (lt, d) => {
    photo('escenario', lt, d, { f0: [0.3, 0.5], f1: [0.6, 0.5], z0: 1.15, z1: 1.3 });
    scrim('bottom', 0.9, 0.6);
    kicker('LOS RIVALES', M, H - MB - 120, P(lt, 0.4, 1.0));
    head('LA ERA MÁS DURA', M, H - MB, P(lt, 0.5, 1.1), { size: 140 });
    wipe(lt, 1);
  });
  const rival = (i, img, f0, f1, z0, z1, name, sub, era) => shot(S(i), S(i + 1), (lt, d) => {
    bg(COL.bg);
    photo(img, lt, d, { x: 760, w: W - 760, f0, f1, z0, z1 });
    const g = ctx.createLinearGradient(760, 0, 1100, 0);
    g.addColorStop(0, COL.bg); g.addColorStop(1, 'rgba(9,8,12,0)');
    ctx.fillStyle = g; ctx.fillRect(760, 0, 340, H);
    kicker(era, M, 360, P(lt, 0.3, 0.9));
    const parts = name.split(' ');
    head(parts[0], M, 520, P(lt, 0.2, 0.8), { size: 150 });
    head(parts.slice(1).join(' '), M, 680, P(lt, 0.3, 0.9), { size: 150 });
    serif(sub, M, 780, P(lt, 0.9, 1.6), { size: 48, color: COL.pl });
  });
  rival(67, 'yates', [0.5, 0.35], [0.5, 0.42], 1.05, 1.15, 'DORIAN YATES', 'El rey de la densidad', 'MÍSTER OLYMPIA 1992–1997');
  rival(68, 'coleman', [0.57, 0.3], [0.57, 0.34], 1.45, 1.55, 'RONNIE COLEMAN', 'El más dominante de todos los tiempos', 'MÍSTER OLYMPIA 1998–2005');
  shot(S(69), S(70), (lt, d, t) => {
    photo('arnold', lt, d, { x: 0, w: 1000, f0: [0.45, 0.35], f1: [0.45, 0.42], z0: 1.0, z1: 1.1 });
    ctx.fillStyle = COL.bg; ctx.fillRect(1000, 0, W - 1000, H);
    kicker('ARNOLD CLASSIC', 1110, 380, P(lt, 0.3, 0.9));
    const tw = wordT(69, 'dos');
    head('DOS', 1110, 610, P(t, tw - 0.2, tw + 0.4), { size: 240, ease: E.ox });
    head('VECES', 1110, 770, P(t, tw, tw + 0.5), { size: 160, color: COL.pl });
    serif('Victorias por todo el mundo.', 1110, 870, P(t, wordT(69, 'victorias'), wordT(69, 'victorias') + 0.7), { size: 44 });
  });
  shot(S(70), S(71), (lt, d, t) => {
    bg(COL.bg);
    kicker('SUBCAMPEÓN DEL OLYMPIA', M, M + 10, P(lt, 0.0, 0.5));
    const hits = [1992, 1995, 2000, 2002];
    const ht = hits.map((y, k) => wordT(70, String(y)));
    const n = hits.filter((y, k) => t >= ht[k]).length;
    counter(n, W - M, 330, 260, { align: 'right', color: COL.pl });
    const x0 = M, x1 = W - M, y = 700;
    const le = E.oq(P(lt, 0, 0.7));
    ctx.fillStyle = COL.dim; ctx.fillRect(x0, y - 1, (x1 - x0) * le, 2);
    for (let yr = 1992; yr <= 2003; yr++) {
      const u = (yr - 1992) / 11;
      const x = lerp(x0 + 30, x1 - 30, u);
      const k = hits.indexOf(yr);
      const on = k >= 0 ? E.oq(P(t, ht[k] - 0.1, ht[k] + 0.4)) : 0;
      ctx.fillStyle = on > 0 ? COL.p : '#3a3542';
      ctx.beginPath(); ctx.arc(x, y, 9 + 17 * on, 0, Math.PI * 2); ctx.fill();
      label(String(yr), x, y + 70, P(lt, 0.2, 0.8), { align: 'center', color: on > 0 ? COL.ink : COL.dim, size: 26 });
      if (on > 0) head('2º', x, y - 50, on, { size: 76, align: 'center' });
    }
  });
  shot(S(71), S(73), (lt, d, t) => {
    bg('#060409');
    const floor = 900;
    const s1 = 360, s2 = 300;
    const e = E.oq(P(lt, 0, 0.8));
    ctx.fillStyle = '#3a3542'; ctx.fillRect(1060, floor - s1 * e, 420, s1 * e);
    ctx.fillStyle = COL.p; ctx.fillRect(620, floor - s2 * e, 420, s2 * e);
    setFont('Anton', 130, 400, false, 0); ctx.fillStyle = COL.ink; ctx.textAlign = 'center';
    ctx.globalAlpha = P(lt, 0.6, 1);
    ctx.fillText('1', 1270, floor - s1 * e + 160); ctx.fillText('2', 830, floor - s2 * e + 160);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
    const pg = E.oq(P(t, S(72), S(72) + 0.6));
    if (pg > 0) {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 3;
      const x = 1000, ya = floor - s1, yb = floor - s2;
      ctx.beginPath(); ctx.moveTo(x - 20, ya); ctx.lineTo(x + 20, ya); ctx.moveTo(x - 20, yb); ctx.lineTo(x + 20, yb);
      ctx.moveTo(x, ya); ctx.lineTo(x, lerp(ya, yb, pg)); ctx.stroke();
    }
    head('SIEMPRE CERCA.', W / 2, 260, P(lt, 0.1, 0.6), { size: 120, align: 'center', alpha: 1 - 0.6 * P(t, S(72), S(72) + 0.3) });
    head('SIEMPRE A UN PASO.', W / 2, 400, P(t, S(72), S(72) + 0.5), { size: 120, align: 'center', color: COL.pl });
    ctx.fillStyle = '#1c1722'; ctx.fillRect(0, floor, W, 4);
  });

  // ======================= 2002
  shot(S(73), S(74), (lt, d, t) => {
    photo('escenario', lt, d, { f0: [0.5, 0.5], f1: [0.75, 0.48], z0: 1.05, z1: 1.35, dark: 0.45 });
    head('2002', W / 2, H / 2 + 160, P(lt, 0.1, 0.8), { size: 420, align: 'center', ease: E.ox });
    kicker('SU GRAN OPORTUNIDAD PERDIDA', W / 2, H - MB, P(t, wordT(73, 'oportunidad') - 0.2, wordT(73, 'oportunidad') + 0.4), { align: 'center', color: COL.ink });
    wipe(lt, -1);
  });
  shot(S(74), S(75), (lt, d) => {
    clip('torso', lt, { off: 0.5, speed: 0.7, d, dark: 0.35 });
    scrim('bottom', 0.9, 0.55);
    kicker('KEVIN LLEGA', M, H - MB - 130, P(lt, 0.2, 0.7));
    head('EN LA MEJOR CONDICIÓN DE SU VIDA', M, H - MB, P(lt, 0.4, 1.0), { size: 104 });
  });
  shot(S(75), S(76), (lt, d, t) => {
    clip('dobleb', lt, { off: 5, d, dark: 0.45, fy: 0.4 });
    [['GRANDE.', 'grande'], ['LLENO.', 'lleno'], ['BRUTAL.', 'brutal']].forEach(([s, w], k) => {
      const tw = wordT(75, w);
      head(s, W / 2 + (k - 1) * 560, H / 2 + 60, P(t, tw - 0.15, tw + 0.25), { size: 170, align: 'center', color: k === 2 ? COL.pl : COL.ink, ease: E.ox });
    });
  });
  shot(S(76), S(77), (lt, d) => {
    blurBg('coleman', lt, d, 0.55);
    const ph = 760, pw = 600, px = W - M - pw;
    ctx.save(); rrect(px, (H - ph) / 2, pw, ph, 16); ctx.clip();
    photo('coleman', lt, d, { x: px, y: (H - ph) / 2, w: pw, h: ph, f0: [0.57, 0.32], z0: 1.3, z1: 1.4 });
    ctx.restore();
    head('RONNIE COLEMAN', M, 500, P(lt, 0.1, 0.7), { size: 120 });
    head('SE LLEVA EL TÍTULO', M, 640, P(lt, 0.3, 0.9), { size: 120, color: COL.pl });
  });
  shot(S(77), S(78), (lt, d, t) => {
    bg('#0d0b11');
    kicker('LA DISCUSIÓN SIGUE', M, M + 10, P(lt, 0.1, 0.6));
    // interfaz genérica de hilos de discusión, con colores de la marca
    const chips = [['FOROS', 'foros'], ['VÍDEOS', 'vídeos'], ['GIMNASIOS', 'gimnasios']];
    chips.forEach(([s, w], k) => {
      const tw = wordT(77, w);
      const e = E.oq(P(t, tw - 0.2, tw + 0.3));
      if (e <= 0) return;
      ctx.save(); ctx.globalAlpha = e;
      setFont('Oswald', 26, 500, false, 4);
      const ww = measure(s) + 56;
      const x = M + k * 260;
      ctx.fillStyle = k === 0 ? COL.p : COL.pd;
      rrect(x, 200, ww, 54, 27); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.fillText(s, x + 28, 237);
      ctx.restore();
    });
    const scroll = E.ios(P(lt, 0, d)) * 140;
    for (let k = 0; k < 5; k++) {
      const e = E.oq(P(lt, 0.2 + k * 0.25, 0.9 + k * 0.25));
      const y = 320 + k * 170 - scroll + (1 - e) * 60;
      ctx.save(); ctx.globalAlpha = e * (k === 0 ? 1 : 0.85);
      ctx.fillStyle = k === 0 ? '#1f1530' : '#16131b';
      rrect(M, y, W - 2 * M, 140, 14); ctx.fill();
      ctx.fillStyle = k === 0 ? COL.p : '#2c2733';
      ctx.beginPath(); ctx.arc(M + 70, y + 70, 34, 0, Math.PI * 2); ctx.fill();
      if (k === 0) {
        setFont('Inter', 40, 600, false, 0); ctx.fillStyle = COL.ink;
        ctx.fillText('¿Le robaron el Olympia a Kevin Levrone?', M + 136, y + 62);
        ctx.fillStyle = '#3a3245'; ctx.fillRect(M + 136, y + 88, 520, 14);
      } else {
        ctx.fillStyle = '#2a2530';
        ctx.fillRect(M + 136, y + 44, 700 - k * 60, 18);
        ctx.fillRect(M + 136, y + 80, 460 + k * 40, 14);
      }
      ctx.restore();
    }
  });
  shot(S(78), S(79), (lt, d, t) => {
    blurBg('escenario', lt, d, 0.55);
    vortex(t, 0.25, W / 2, H / 2, 1.1);
    head('¿LE ROBARON', W / 2, 500, P(lt, 0.0, 0.4), { size: 180, align: 'center', ease: E.ox });
    head('EL OLYMPIA?', W / 2, 700, P(lt, 0.15, 0.55), { size: 180, align: 'center', color: COL.pl, ease: E.ox });
  });
  shot(S(79), S(81), (lt, d, t) => {
    bg('#0d0b11');
    kicker('DÉJALO EN LOS COMENTARIOS', W / 2, 250, P(lt, 0.1, 0.6), { align: 'center' });
    const cw = 1300, cx = (W - cw) / 2, cy = 360;
    const e = E.oq(P(lt, 0.2, 0.9));
    ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 40);
    ctx.fillStyle = '#18141e'; rrect(cx, cy, cw, 300, 20); ctx.fill();
    ctx.fillStyle = COL.p; ctx.beginPath(); ctx.arc(cx + 80, cy + 80, 38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2530'; ctx.fillRect(cx + 140, cy + 128, cw - 200, 2);
    // texto tecleado, sincronizado con la voz
    const full = '¿Merecía ganar Kevin en 2002 o fue justa la victoria de Ronnie?';
    const n = Math.floor(full.length * P(t, S(80), SE(80) - 0.2));
    setFont('Inter', 38, 500, false, 0); ctx.fillStyle = COL.ink;
    const br = full.indexOf('fue');
    const txt0 = full.slice(0, Math.min(n, br)).trimEnd();
    const txt1 = n > br ? full.slice(br, n) : '';
    ctx.fillText(txt0, cx + 140, cy + 100);
    if (txt1) ctx.fillText(txt1, cx + 140, cy + 160);
    const caretOn = Math.floor(t * 2) % 2 === 0 || (n > 0 && n < full.length);
    if (caretOn && n < full.length) {
      const cxp = cx + 140 + measure(txt1 || txt0) + 4;
      ctx.fillStyle = COL.pl; ctx.fillRect(cxp, txt1 ? cy + 128 : cy + 68, 3, 40);
    }
    // botones genéricos
    [['KEVIN', COL.p], ['RONNIE', '#3a3542']].forEach(([s, c], k) => {
      const be = E.oq(P(t, SE(80) - 0.4 + k * 0.15, SE(80) + 0.3 + k * 0.15));
      ctx.save(); ctx.globalAlpha = be;
      ctx.fillStyle = c; rrect(cx + cw - 520 + k * 260, cy + 200, 220, 64, 32); ctx.fill();
      setFont('Oswald', 28, 500, false, 5); ctx.fillStyle = COL.ink; ctx.textAlign = 'center';
      ctx.fillText(s, cx + cw - 410 + k * 260, cy + 243);
      ctx.restore();
    });
    ctx.restore();
  });

  // ======================= LESIONES Y RETIRADA
  shot(S(81), S(82), (lt, d, t) => {
    bg('#08060b');
    kicker('LESIONES', M, M + 10, P(lt, 0.1, 0.6));
    // haz de fibras del pectoral: del esternón a la inserción en el brazo
    const tear = E.ioc(P(t, wordT(81, 'desgarro') - 0.3, wordT(81, 'desgarro') + 0.9));
    const ox = 1020, oy = 520;
    for (let k = 0; k < 28; k++) {
      const u = k / 27;
      const sx = ox + 40 * Math.sin(u * 2), sy = oy - 300 + u * 600;
      const ex = 1640, ey = 330 + u * 60;
      const cx1 = lerp(sx, ex, 0.5) + 40, cy1 = lerp(sy, ey, 0.5) + (u - 0.5) * 120;
      const torn = k >= 11 && k <= 16;
      const draw = E.oc(P(lt, 0.2 + u * 0.4, 1.4 + u * 0.4));
      ctx.save();
      ctx.strokeStyle = torn ? (tear > 0 ? COL.p : '#9a8f9f') : '#7a7180';
      ctx.globalAlpha = torn ? 1 : 0.75;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const N = 60;
      const gapC = 0.55, gapW = 0.16 * tear;
      ctx.beginPath();
      let pen = false;
      for (let q = 0; q <= N * draw; q++) {
        const s = q / N;
        if (torn && Math.abs(s - gapC) < gapW) { pen = false; continue; }
        const shift = torn ? (s < gapC ? -1 : 1) * tear * 18 : 0;
        const x = (1 - s) ** 2 * sx + 2 * (1 - s) * s * cx1 + s * s * ex + shift;
        const y = (1 - s) ** 2 * sy + 2 * (1 - s) * s * cy1 + s * s * ey + (torn ? shift * 0.4 : 0);
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    head('DESGARRO', M, 520, P(t, wordT(81, 'desgarro') - 0.2, wordT(81, 'desgarro') + 0.4), { size: 140 });
    head('DE PECTORAL', M, 660, P(t, wordT(81, 'pectoral') - 0.2, wordT(81, 'pectoral') + 0.4), { size: 140, color: COL.pl });
    serif('Le obligó a reinventar su forma de entrenar.', M, 780, P(t, wordT(81, 'reinventar') - 0.3, wordT(81, 'reinventar') + 0.5), { size: 46 });
  });
  shot(S(82), S(85), (lt, d, t) => {
    photo('bateria', lt, d, { f0: [0.5, 0.4], bw: true, dark: 0.2, cardX: 0.7, cardY: 0.5 });
    scrim('left', 0.9, 0.7);
    const fadeOut = E.ioc(P(t, S(84) - 0.1, S(84) + 0.6));
    ctx.save(); ctx.globalAlpha = 1 - fadeOut;
    head('2003', M, 460, P(lt, 0.1, 0.7), { size: 240 });
    kicker('SE ALEJA DE LA COMPETICIÓN', M, 540, P(lt, 0.5, 1.1));
    [['MÚSICA', 'música'], ['CINE', 'cine'], ['NEGOCIOS', 'negocios']].forEach(([s, w], k) => {
      const tw = wordT(83, w);
      head(s, M, 680 + k * 100, P(t, tw - 0.15, tw + 0.35), { size: 80, color: k === 0 ? COL.pl : COL.ink });
    });
    ctx.restore();
    black(fadeOut);
    serif('Parece el final de la historia…', W / 2, H / 2 + 20, P(t, SE(84) - 0.9, SE(84) - 0.3) * (1 - P(t, SE(84) + 0.1, SE(84) + 0.5)), { size: 60, align: 'center', color: COL.silver });
  });

  // ======================= EL REGRESO
  shot(S(85), S(86), (lt, d, t) => {
    const t51 = wordT(85, 'cincuenta') - 0.15;
    if (t < t51) {
      bg('#07050b');
      vortex(t, 0.4, W / 2, H / 2, 1.2);
      const ty = wordT(85, '2016');
      const pr = E.oq(P(t, S(85), ty + 0.3));
      const yr = Math.round(lerp(2003, 2016, pr));
      ctx.save();
      const s = 1 + 0.04 * (1 - E.ox(P(t, ty, ty + 0.6)));
      ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
      counter(yr, W / 2, H / 2 + 180, 480, { align: 'center', color: yr === 2016 ? COL.ink : COL.dim });
      ctx.restore();
      kicker('EL REGRESO', W / 2, 220, P(lt, 0.1, 0.5), { align: 'center' });
    } else {
      const lt2 = t - t51;
      photo('sudadera', lt2, d - (t51 - S(85)), { f0: [0.35, 0.4], dark: 0.1, cardX: 0.36, cardY: 0.5 });
      scrim('right', 0.9, 0.6);
      head('51', W - M, 560, P(lt2, 0, 0.4), { size: 380, align: 'right', ease: E.ox });
      head('AÑOS', W - M, 700, P(lt2, 0.15, 0.6), { size: 130, align: 'right', color: COL.pl });
      kicker('MÁS DE UNA DÉCADA FUERA', W - M - 470, 790, P(t, wordT(85, 'década') - 0.2, wordT(85, 'década') + 0.4));
      const tv = wordT(85, 'vuelve');
      serif('Vuelve al Míster Olympia.', W - M, 880, P(t, tv - 0.1, tv + 0.6), { size: 52, align: 'right' });
    }
  });
  shot(S(86), S(88), (lt, d, t) => {
    bg('#0d0b11');
    kicker('EL MUNDO DEL FITNESS SE VUELVE LOCO', M, M + 10, P(lt, 0.1, 0.6));
    head('COMO SI FUERA UNA SERIE', M, 290, P(t, S(87) + 0.3, S(87) + 1.0), { size: 110 });
    const thumbs = [['press1', 3], ['cara1', 5], ['hombro', 5], ['sentado', 3], ['press3', 4], ['cara2', 4]];
    const tw = (W - 2 * M - 2 * 32) / 3, th = tw * 9 / 16;
    thumbs.forEach(([n, off], k) => {
      const c = k % 3, r = Math.floor(k / 3);
      const x = M + c * (tw + 32), y = 360 + r * (th + 32);
      const e = E.oq(P(lt, 0.3 + k * 0.12, 1.0 + k * 0.12));
      if (e <= 0) return;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(0, (1 - e) * 50);
      rrect(x, y, tw, th, 14); ctx.clip();
      clip(n, lt, { off, speed: 0.6, d, x, y, w: tw, h: th, dark: 0.2 });
      ctx.restore();
      ctx.save(); ctx.globalAlpha = e;
      ctx.fillStyle = 'rgba(9,8,12,0.55)';
      ctx.beginPath(); ctx.arc(x + tw / 2, y + th / 2 + (1 - e) * 50, 44, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COL.ink;
      const px = x + tw / 2 + 6, py = y + th / 2 + (1 - e) * 50;
      ctx.beginPath(); ctx.moveTo(px - 14, py - 20); ctx.lineTo(px + 20, py); ctx.lineTo(px - 14, py + 20); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  });
  shot(S(88), S(91), (lt, d, t) => {
    photo('espalda', lt, d, { f0: [0.5, 0.35], f1: [0.5, 0.45], z0: 1.0, z1: 1.12 });
    scrim('bottom', 0.9, 0.6);
    kicker('EL RESULTADO', M, H - MB - 250, P(lt, 0.2, 0.8));
    head('LEJOS DE LOS', M, H - MB - 120, P(t, S(89), S(89) + 0.5), { size: 110 });
    head('PRIMEROS PUESTOS', M, H - MB, P(t, S(89) + 0.2, S(89) + 0.7), { size: 110 });
    serif('Pero eso casi daba igual.', W - M, H - MB, P(t, S(90), S(90) + 0.7), { size: 56, align: 'right', color: COL.pl });
  });
  shot(S(91), S(92), (lt, d, t) => {
    clip('espalda', lt, { off: 0, speed: 0.55, d, dark: 0.3 });
    scrim('bottom', 0.9, 0.6);
    kicker('UNA LEYENDA DE 51 AÑOS', M, H - MB - 130, P(lt, 0.3, 0.9));
    const ti = wordT(91, 'inspiró');
    head('INSPIRÓ A MILES DE PERSONAS', M, H - MB, P(t, ti - 0.2, ti + 0.5), { size: 110 });
  });
  shot(S(92), S(94), (lt, d, t) => {
    bg('#07050b');
    vortex(t, 0.3, W / 2, H / 2, 1.2);
    serif('Se puede criticar el resultado.', W / 2, 440, P(lt, 0.1, 0.8), { size: 64, align: 'center', color: COL.mute });
    serif('Lo que no se puede criticar', W / 2, 600, P(t, S(93), S(93) + 0.7), { size: 76, align: 'center' });
    serif('es el valor de volver a intentarlo.', W / 2, 700, P(t, wordT(93, 'valor') - 0.2, wordT(93, 'valor') + 0.6), { size: 76, align: 'center', color: COL.pl });
  });

  // ======================= LA PREGUNTA
  shot(S(94), S(96), (lt, d, t) => {
    bg('#07050b');
    vortex(t * 0.6, 0.32, W / 2, H / 2, 1.3);
    const q = E.ioc(P(t, S(95) - 0.6, S(95) - 0.05));
    ctx.save(); ctx.globalAlpha = 1 - q;
    head('LA PREGUNTA DEL PRINCIPIO', W / 2, 590, P(lt, 0.1, 0.7), { size: 130, align: 'center' });
    ctx.restore();
    kicker('LA PREGUNTA DEL PRINCIPIO', W / 2, 360, q, { align: 'center' });
    spoken(95, t, W / 2, 520, { size: 86, align: 'center', maxW: 1400, italic: true });
    wipe(lt, 1);
  });
  shot(S(96), S(98), (lt, d, t) => {
    bg(COL.bg);
    kicker('MI OPINIÓN', W / 2, 400, P(lt, 0.05, 0.4), { align: 'center', color: COL.ink, size: 30 });
    head('ES POSIBLE.', W / 2, 640, P(t, S(97), S(97) + 0.35), { size: 260, align: 'center', ease: E.ox });
  });
  shot(S(98), S(99), (lt, d, t) => {
    bg('#08070b');
    const g = ctx.createRadialGradient(1350, 500, 50, 1350, 500, 700);
    g.addColorStop(0, 'rgba(184,157,230,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = IMG.sandow_cut;
    const sh = 860, sw = sh * s.width / s.height;
    ctx.save();
    const e = E.oq(P(lt, 0, 1.2));
    ctx.globalAlpha = e;
    const z = 1 + 0.05 * lt / d;
    ctx.translate(1440, 560 + (1 - e) * 40); ctx.scale(z, z);
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
    ctx.filter = 'contrast(1.1) saturate(0.9)';
    ctx.drawImage(s, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    label('TROFEO SANDOW', 1440, 1030, P(lt, 0.8, 1.4), { align: 'center' });
    kicker('¿QUÉ HABRÍA HECHO FALTA?', M, 330, P(lt, 0.2, 0.8));
    [['SU GENÉTICA', 'genética'], ['MÁS MÚSCULO DE CALIDAD', 'músculo'], ['UNA PREPARACIÓN MÁS LARGA', 'preparación']].forEach(([txt, w], k) => {
      const tw = wordT(98, w);
      const p = P(t, tw - 0.3, tw + 0.3);
      ctx.fillStyle = COL.p; ctx.fillRect(M, 432 + k * 130, 50 * E.oq(p), 4);
      head(txt, M + 80, 460 + k * 130, p, { size: 68 });
    });
  });
  shot(S(99), S(102), (lt, d, t) => {
    bg(COL.bg);
    kicker('PERO TAMBIÉN HAY QUE SER JUSTOS', M, M + 10, P(lt, 0.1, 0.6));
    // balanza
    const tilt = -0.16 * E.ioc(P(t, wordT(100, 'libertad') - 0.2, wordT(100, 'libertad') + 1.4));
    const cx = W / 2, cy = 400;
    ctx.save();
    ctx.fillStyle = '#4a4452';
    ctx.fillRect(cx - 4, cy, 8, 420);
    ctx.fillRect(cx - 160, cy + 420, 320, 10);
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.fillStyle = COL.silver;
    ctx.fillRect(-560, -5, 1120, 10);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const pan = (sx, txt, col, a) => {
      const px = cx + Math.cos(tilt) * sx, py = cy + Math.sin(tilt) * sx;
      ctx.save();
      ctx.strokeStyle = '#6a6373'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 150, py + 200); ctx.moveTo(px, py); ctx.lineTo(px + 150, py + 200); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(px, py + 205, 170, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      head(txt, px, py + 300, a, { size: 64, align: 'center', color: col === COL.p ? COL.ink : COL.mute });
    };
    pan(-560, 'ENTRENAR TODO EL AÑO', '#3a3542', P(lt, 0.3, 0.9));
    pan(560, 'LIBERTAD', COL.p, P(t, wordT(100, 'libertad') - 0.2, wordT(100, 'libertad') + 0.4));
    const lx = cx + Math.cos(tilt) * 560, ly = cy + Math.sin(tilt) * 560;
    label('MOTIVADO', lx, ly + 380, P(t, wordT(100, 'motivado') - 0.2, wordT(100, 'motivado') + 0.4), { align: 'center', color: COL.pl, size: 32 });
    label('SIN QUEMARSE', lx, ly + 428, P(t, wordT(100, 'quemarse') - 0.2, wordT(100, 'quemarse') + 0.4), { align: 'center', color: COL.pl, size: 32 });
    serif('Si hubiera vivido solo para el culturismo, no habría durado tanto.', W / 2, 1000, P(t, S(101), S(101) + 0.8), { size: 44, align: 'center' });
  });
  shot(S(102), S(103), (lt, d) => {
    bg('#000');
    head('NUNCA LO SABREMOS.', W / 2, H / 2 + 60, P(lt, 0.05, 0.6), { size: 170, align: 'center' });
    black(E.ic(P(lt, d - 0.5, d)));
  });

  // ======================= LEGADO
  shot(S(103), S(105), (lt, d, t) => {
    photo('clasica', lt, d, { f0: [0.5, 0.4], f1: [0.5, 0.48], z0: 1.12, z1: 1.0, dark: 0.15 });
    scrim('bottom', 0.92, 0.6);
    kicker('LEGADO', M, H - MB - 240, P(lt, 0.3, 0.9));
    head('NUNCA GANÓ EL MÍSTER OLYMPIA', M, H - MB - 110, P(lt, 0.4, 1.0), { size: 104 });
    serif('Pero dejó algo que pocos campeones han dejado.', M, H - MB, P(t, S(104), S(104) + 0.8), { size: 52, color: COL.pl });
    black(1 - E.oc(P(lt, 0, 0.8)));
  });
  shot(S(105), S(106), (lt, d, t) => {
    photo('estudio', lt, d, { x: 960, w: 960, f0: [0.5, 0.3], f1: [0.5, 0.4], z0: 1.0, z1: 1.1 });
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, 960, H);
    kicker('UNO DE LOS FÍSICOS', M, 380, P(lt, 0.2, 0.7));
    head('MÁS ESTÉTICOS', M, 540, P(t, wordT(105, 'estéticos') - 0.2, wordT(105, 'estéticos') + 0.4), { size: 120 });
    head('Y COMPLETOS', M, 680, P(t, wordT(105, 'completos') - 0.2, wordT(105, 'completos') + 0.4), { size: 120, color: COL.pl });
    serif('de los años noventa', M, 780, P(t, wordT(105, 'noventa') - 0.2, wordT(105, 'noventa') + 0.5), { size: 52 });
  });
  shot(S(106), S(107), (lt, d) => {
    clip('dobleb', lt, { off: 7, d, dark: 0.5, fy: 0.4 });
    const v = Math.round(20 * E.oq(P(lt, 0.1, 1.6)));
    counter(v, 900, 700, 460, { prefix: '+', align: 'right' });
    head('VICTORIAS', 960, 480, P(lt, 0.2, 0.8), { size: 110 });
    head('PROFESIONALES', 960, 610, P(lt, 0.35, 0.95), { size: 110, color: COL.pl });
  });
  shot(S(107), S(108), (lt, d, t) => {
    bg('#0b090e');
    const g = ctx.createRadialGradient(1400, 520, 50, 1400, 520, 620);
    g.addColorStop(0, 'rgba(184,157,230,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // producto recortado por código, con sombra de estudio
    const im = IMG.creatina_cut;
    const ph = 640, pw = ph * im.width / im.height;
    ctx.save();
    const e = E.oq(P(lt, 0, 1.0));
    ctx.globalAlpha = e;
    const z = 1 + 0.05 * lt / d;
    ctx.translate(1400, 540 + (1 - e) * 60); ctx.scale(z, z);
    ctx.save();
    ctx.globalAlpha = 0.5 * e; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, ph / 2 + 10, pw * 0.48, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.filter = 'contrast(1.06) brightness(0.92)';
    ctx.drawImage(im, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
    kicker('SU PROPIA MARCA', M, 400, P(lt, 0.2, 0.7));
    head('DE SUPLEMENTOS', M, 540, P(lt, 0.3, 0.9), { size: 110 });
    const tc = wordT(107, 'comunidad');
    head('Y UNA COMUNIDAD', M, 690, P(t, tc - 0.3, tc + 0.3), { size: 110, color: COL.pl });
    head('ENORME', M, 830, P(t, tc - 0.1, tc + 0.5), { size: 110, color: COL.pl });
  });
  shot(S(108), S(110), (lt, d, t) => {
    clip('espalda', lt, { off: 3, speed: 0.45, d, dark: 0.6 });
    vortex(t, 0.25, W / 2, H / 2, 1.2);
    kicker('UNA LECCIÓN QUE SIGUE VIGENTE', W / 2, 330, P(lt, 0.1, 0.7), { align: 'center' });
    spoken(109, t, W / 2, 500, { size: 84, align: 'center', maxW: 1500, italic: true });
  });
  shot(S(110), S(112), (lt, d, t) => {
    bg('#07050b');
    vortex(t, 0.35, W / 2, H / 2, 1.1);
    kicker('Y TÚ, ¿QUÉ ERES MÁS?', W / 2, 380, P(lt, 0.1, 0.6), { align: 'center', color: COL.ink, size: 30 });
    head('TALENTO', W / 2 - 90, 620, P(t, wordT(111, 'talento') - 0.15, wordT(111, 'talento') + 0.35), { size: 140, align: 'right' });
    serif('o', W / 2, 600, P(t, wordT(111, 'o') - 0.1, wordT(111, 'o') + 0.3), { size: 90, align: 'center', color: COL.mute });
    head('CONSTANCIA', W / 2 + 90, 620, P(t, wordT(111, 'constancia') - 0.15, wordT(111, 'constancia') + 0.35), { size: 140, color: COL.pl });
  });

  // ======================= CIERRE: logo + suscripción
  shot(S(112), TOTAL, (lt, d, t) => {
    bg('#07050b');
    vortex(t, 0.45 * E.oc(P(lt, 0, 1.2)), W / 2, 360, 1.0);
    const end = P(t, S(113) - 0.2, S(113) + 0.8);
    const ee = E.ioc(end);
    const ly = lerp(360, 500, ee), ls = lerp(400, 520, ee);
    logo(W / 2, ly, ls * (0.9 + 0.1 * E.ox(P(lt, 0, 1))), E.oc(P(lt, 0, 0.8)), P(lt, 0.8, 1.8));
    const ua = 1 - E.oc(end);
    ctx.save(); ctx.globalAlpha = ua;
    const tLike = wordT(112, 'like'), tSub = wordT(112, 'suscríbete'), tCom = wordT(112, 'comentarios');
    // botones genéricos (colores de la marca, sin imitar ninguna plataforma)
    const row = 680, bh = 112;
    const likeOn = t > tLike + 0.12, subOn = t > tSub + 0.12;
    const lw = 340, sw = 640, gap = 32;
    const x0 = W / 2 - (lw + gap + sw) / 2;
    const le = E.oq(P(lt, 0.4, 1.0));
    ctx.save(); ctx.globalAlpha *= le; ctx.translate(0, (1 - le) * 30);
    ctx.fillStyle = likeOn ? COL.p : '#1f1b25'; rrect(x0, row, lw, bh, bh / 2); ctx.fill();
    drawThumb(x0 + 88, row + bh / 2, likeOn ? COL.ink : COL.silver);
    setFont('Oswald', 36, 500, false, 5); ctx.fillStyle = COL.ink; ctx.fillText('ME GUSTA', x0 + 140, row + bh / 2 + 13);
    ctx.restore();
    const se = E.oq(P(lt, 0.55, 1.15));
    const sx0 = x0 + lw + gap;
    ctx.save(); ctx.globalAlpha *= se; ctx.translate(0, (1 - se) * 30);
    ctx.fillStyle = subOn ? '#2a2530' : COL.p; rrect(sx0, row, sw, bh, bh / 2); ctx.fill();
    setFont('Oswald', 38, 500, false, 7); ctx.fillStyle = COL.ink; ctx.textAlign = 'center';
    ctx.fillText(subOn ? 'SUSCRITO' : 'SUSCRÍBETE AL CANAL', sx0 + sw / 2, row + bh / 2 + 14);
    ctx.restore();
    // cursor genérico que pulsa
    const c1 = E.ioc(P(t, tLike - 0.9, tLike - 0.05)), c2 = E.ioc(P(t, tSub - 0.9, tSub - 0.05));
    let cx = lerp(W / 2 + 300, x0 + lw / 2, c1), cy = lerp(980, row + 70, c1);
    cx = lerp(cx, sx0 + sw / 2, c2); cy = lerp(cy, row + 70, c2);
    const press = Math.max(1 - Math.abs(t - tLike) / 0.12, 1 - Math.abs(t - tSub) / 0.12, 0);
    if (lt > 0.8) drawCursor(cx, cy, 1 - 0.15 * press);
    const ce = E.oq(P(t, tCom - 0.2, tCom + 0.5));
    serif('Dinos qué leyenda del culturismo quieres en el próximo vídeo.', W / 2, 920, ce, { size: 50, align: 'center', color: COL.silver });
    ctx.restore();
    black(E.ic(P(t, TOTAL - 1.4, TOTAL - 0.2)));
  });
}
function drawThumb(x, y, col) {
  ctx.save(); ctx.fillStyle = col; ctx.translate(x, y);
  rrect(-22, -4, 12, 28, 3); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-6, -4); ctx.lineTo(4, -26); ctx.quadraticCurveTo(14, -28, 12, -14); ctx.lineTo(10, -6);
  ctx.lineTo(24, -6); ctx.quadraticCurveTo(30, -4, 28, 4); ctx.lineTo(22, 22); ctx.quadraticCurveTo(20, 26, 14, 26); ctx.lineTo(-6, 26);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawCursor(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * 1.4, s * 1.4);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.lineTo(8, 23); ctx.lineTo(14, 36); ctx.lineTo(19, 34); ctx.lineTo(13, 21); ctx.lineTo(23, 21); ctx.closePath();
  ctx.fillStyle = COL.ink; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ fotograma
function drawFrame(t) {
  reset();
  bg('#000');
  for (const s of SHOTS) {
    if (t >= s.a && t < s.b) {
      ctx.save();
      s.f(t - s.a, s.b - s.a, t);
      ctx.restore();
      reset();
    }
  }
  // post: viñeta + grano fílmico determinista
  ctx.drawImage(VIGN, 0, 0);
  const fr = Math.floor(t * FPS);
  const r = mulberry32(fr * 7919 + 13);
  const tile = GRAIN[fr % GRAIN.length];
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.09;
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.translate(-Math.floor(r() * 256), -Math.floor(r() * 256));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}
window.ready = init();
window.seek = async function (t) {
  await window.ready;
  drawFrame(t);
  if (NEED.size) { await fetchNeeded(); drawFrame(t); }
  return true;
};
window.TOTAL = TOTAL;
window.FPS = FPS;
