/*
 * HERE — audio de un capítulo completo (Azure Neural TTS + Supabase Storage).
 *
 * Genera el capítulo UNA vez, lo guarda en Supabase y desde entonces todos lo
 * escuchan de ahí, sin volver a pagar. Es un solo archivo de audio, así que el
 * teléfono puede reproducirlo en segundo plano y con la pantalla bloqueada sin
 * cortes. Junto al audio se guarda la hora de inicio de cada versículo, para
 * poder resaltar el versículo que se está leyendo.
 *
 *   POST /api/tts-chapter
 *   { v:"salome", book:"Juan", chapter:3, verses:["…","…"], check:true }
 *     check:true  → solo responde si ya existe: { ready:true, url, marks } | { ready:false }
 *     sin check   → si no existe, lo genera (puede tardar 10–40 s la primera vez)
 *
 * Variables de entorno en Vercel:
 *   AZURE_SPEECH_KEY, AZURE_SPEECH_REGION      (las mismas de api/tts.js)
 *   SUPABASE_URL           p. ej. https://abcd1234.supabase.co
 *   SUPABASE_SERVICE_KEY   clave "service_role" (SOLO aquí, nunca en la app)
 * y en Supabase un bucket PÚBLICO llamado  audio .
 *
 * Va en la carpeta "api" de la RAÍZ del repositorio. Además hace falta el
 * archivo vercel.json de la raíz, que le da hasta 60 s de ejecución.
 */
const crypto = require('crypto');

const VOICES = {
  salome: 'es-CO-SalomeNeural',
  gonzalo: 'es-CO-GonzaloNeural',
  dalia: 'es-MX-DaliaNeural',
  jorge: 'es-MX-JorgeNeural',
};
const BUCKET = 'audio';
const BYTES_PER_SEC = 6000;       // mp3 de 48 kbps constante (48000 / 8)
const MAX_VERSES = 180;
const MAX_VERSE_CHARS = 700;
const MAX_TOTAL_CHARS = 16000;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function synth(key, region, voice, text) {
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX">` +
    `<voice name="${voice}"><prosody rate="-6%">${esc(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'HERE-app',
    },
    body: ssml,
  });
  if (!r.ok) throw new Error('azure-' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function upload(base, serviceKey, path, body, type) {
  const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': type, 'x-upsert': 'true', 'cache-control': '31536000' },
    body,
  });
  if (!r.ok) throw new Error('supabase-' + r.status);
}

module.exports = async function handler(req, res) {
  const azKey = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const sKey = process.env.SUPABASE_SERVICE_KEY;
  if (req.method !== 'POST') return res.status(405).end();
  if (!azKey || !region || !base || !sKey) return res.status(501).json({ error: 'not-configured' });

  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return res.status(403).end();
  const host = req.headers.host || '';
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes(host)) return res.status(403).end();

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b) return res.status(400).json({ error: 'bad-request' });
  const voice = VOICES[String(b.v || '')];
  const verses = Array.isArray(b.verses) ? b.verses.map((t) => String(t || '').replace(/\s+/g, ' ').trim()) : [];
  const chapter = parseInt(b.chapter, 10);
  if (!voice || !b.book || !chapter || !verses.length || verses.length > MAX_VERSES || verses.some((t) => !t || t.length > MAX_VERSE_CHARS)) {
    return res.status(400).json({ error: 'bad-request' });
  }
  if (verses.reduce((n, t) => n + t.length, 0) > MAX_TOTAL_CHARS) return res.status(400).json({ error: 'too-long' });

  const hash = crypto.createHash('sha1').update(verses.join('\n')).digest('hex').slice(0, 12);
  const path = `${b.v}/${slug(b.book)}-${chapter}-${hash}`;
  const pub = `${base}/storage/v1/object/public/${BUCKET}/${path}`;

  try {
    // ¿ya existe?
    const m = await fetch(pub + '.json');
    if (m.ok) {
      const marks = await m.json();
      return res.status(200).json({ ready: true, url: pub + '.mp3', marks });
    }
    if (b.check) return res.status(200).json({ ready: false });

    // generar versículo a versículo (5 a la vez) y unir los mp3
    const bufs = new Array(verses.length);
    let next = 0;
    async function worker() {
      while (next < verses.length) {
        const i = next++;
        bufs[i] = await synth(azKey, region, voice, verses[i]);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);
    const marks = [];
    let t = 0;
    for (const buf of bufs) { marks.push(Math.round(t * 100) / 100); t += buf.length / BYTES_PER_SEC; }
    await upload(base, sKey, path + '.mp3', Buffer.concat(bufs), 'audio/mpeg');
    await upload(base, sKey, path + '.json', JSON.stringify(marks), 'application/json');
    return res.status(200).json({ ready: true, url: pub + '.mp3', marks });
  } catch (e) {
    return res.status(502).json({ error: String(e && e.message || 'failed') });
  }
};
