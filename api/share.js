/*
 * HERE — enlaces para compartir (versículos, devocionales, planes, canciones/predicaciones, capítulos).
 *
 * Cuando alguien comparte algo desde HERE, el enlace apunta aquí (/api/share?t=...). Esta función
 * responde con una página mínima que tiene la "vista previa" (título, texto e imagen) que
 * muestran WhatsApp, Instagram, iMessage, Telegram, etc., y que redirige enseguida a la app
 * (/app/?open=...), donde HERE muestra lo compartido. No guarda nada ni necesita claves.
 *
 * Debe quedar en la carpeta "api" en la RAÍZ del repositorio (al lado de ai.js, bible.js y
 * youtube.js) — Vercel la detecta sola como /api/share.
 */
const KEYS = ['ref', 'txt', 'img', 'id', 'n', 'd', 'yt', 'l', 'r', 'b', 'c'];
const TYPES = ['verse', 'devo', 'plan', 'track', 'chapter'];

function clean(v, max) {
  const s = Array.isArray(v) ? v[0] : v;
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 300);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = function handler(req, res) {
  const q = req.query || {};
  const t = TYPES.includes(clean(q.t, 12)) ? clean(q.t, 12) : 'verse';
  const proto = clean(req.headers['x-forwarded-proto'], 8) || 'https';
  const host = clean(req.headers['x-forwarded-host'] || req.headers.host, 120);
  const origin = `${proto}://${host}`;

  const p = {};
  KEYS.forEach((k) => { p[k] = clean(q[k], k === 'txt' ? 300 : 160); });

  let title = 'HERE';
  let desc = 'Un espacio para estar presente, leer la Palabra y orar.';
  let image = `${origin}/icons/icon-512.png`;

  if (t === 'verse') {
    title = `${p.ref || 'Una palabra'} · HERE`;
    if (p.txt) desc = `“${p.txt}”`;
    if (/^photo-[\w-]{6,60}$/.test(p.img)) image = `https://images.unsplash.com/${p.img}?auto=format&fit=crop&w=1200&h=630&q=70`;
  } else if (t === 'devo') {
    title = `${p.n || 'Devocional'} · HERE`;
    desc = `${p.ref ? p.ref + ' — ' : ''}Un momento con Dios, en HERE.`;
  } else if (t === 'plan') {
    title = `${p.n || 'Plan de lectura'} · HERE`;
    desc = p.d || 'Un plan de lectura para acercarte a la Palabra.';
  } else if (t === 'track') {
    title = p.n || 'Para escuchar en HERE';
    desc = `Escúchalo en HERE${p.r ? ' · ' + p.r : ''}`;
    if (/^[\w-]{11}$/.test(p.yt)) image = `https://i.ytimg.com/vi/${p.yt}/hqdefault.jpg`;
  } else if (t === 'chapter') {
    title = `${p.b || 'La Palabra'} ${p.c || ''} · HERE`.replace(/\s+·/, ' ·');
    desc = 'Lee este capítulo en HERE.';
  }

  const params = new URLSearchParams();
  params.set('open', t);
  KEYS.forEach((k) => { if (p[k]) params.set(k, p[k]); });
  const appUrl = `${origin}/app/?${params.toString()}`;
  const canonical = `${origin}${req.url || ''}`;

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="HERE">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(appUrl)}">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FAF7F0;color:#211F1A;font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#2C4F3B;font-weight:600}</style>
</head><body>
<p>Abriendo HERE…<br><a href="${esc(appUrl)}">Abrir en HERE</a></p>
<script>location.replace(${JSON.stringify(appUrl).replace(/</g, '\\u003c')});</script>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
};
