/*
 * HERE — voz natural para el lector de la Biblia (Azure Neural TTS).
 *
 * Corre en el servidor de Vercel; la clave de Azure NUNCA llega al navegador.
 * El navegador pide el audio de UN versículo (o frase corta) con una voz:
 *
 *   GET /api/tts?v=salome&t=Porque de tal manera amó Dios al mundo…
 *   GET /api/tts?ping=1        → { ok:true, voices:[…] }  (para saber si está activo)
 *
 * Como es un GET con respuesta fija, Vercel guarda el audio en su red
 * (Cache-Control largo) y el navegador también: el mismo versículo con la
 * misma voz se paga una sola vez mientras siga en caché.
 *
 * Variables de entorno en Vercel (Settings → Environment Variables):
 *   AZURE_SPEECH_KEY      clave del recurso "Speech" de Azure
 *   AZURE_SPEECH_REGION   p. ej. eastus, brazilsouth, westus
 * Después de agregarlas hay que volver a desplegar.
 *
 * Este archivo va en la carpeta "api" de la RAÍZ del repositorio
 * (junto a ai.js, bible.js, share.js, youtube.js).
 */

// Voces disponibles en la app (clave corta → voz de Azure).
const VOICES = {
  salome:  { azure: 'es-CO-SalomeNeural',  label: 'Salomé',  desc: 'Mujer · Colombia' },
  gonzalo: { azure: 'es-CO-GonzaloNeural', label: 'Gonzalo', desc: 'Hombre · Colombia' },
  dalia:   { azure: 'es-MX-DaliaNeural',   label: 'Dalia',   desc: 'Mujer · México' },
  jorge:   { azure: 'es-MX-JorgeNeural',   label: 'Jorge',   desc: 'Hombre · México' },
};
const MAX_CHARS = 700; // un versículo largo cabe; evita usos abusivos

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const q = req.query || {};

  if (q.ping) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (!key || !region) return res.status(200).json({ ok: false });
    return res.status(200).json({
      ok: true,
      chapters: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      voices: Object.keys(VOICES).map((k) => ({ id: k, label: VOICES[k].label, desc: VOICES[k].desc })),
    });
  }

  if (req.method !== 'GET') return res.status(405).end();
  if (!key || !region) return res.status(501).json({ error: 'tts-not-configured' });

  // Solo desde la propia app (frena que otros sitios gasten tu cuota).
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).end();  // 'none' = abrir la dirección a mano (para diagnosticar)
  const host = req.headers.host || '';
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes(host)) return res.status(403).end();

  const voice = VOICES[String(q.v || '')];
  let text = String(q.t || '').replace(/\s+/g, ' ').trim();
  if (!voice || !text) return res.status(400).json({ error: 'bad-request' });
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

  // Voz serena: un poco más pausada que lo normal.
  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-MX">` +
    `<voice name="${voice.azure}"><prosody rate="-6%">${esc(text)}</prosody></voice></speak>`;

  try {
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
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 160); } catch (e) {}
      return res.status(502).json({ error: 'azure-' + r.status, region, detail });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'tts-failed' });
  }
};
