/*
 * HERE — puente hacia la IA (Google Gemini, capa gratuita).
 *
 * Este archivo vive en Vercel como una "función serverless": corre en el
 * servidor, no en el navegador de la persona, así que es el único lugar
 * donde es seguro usar la clave de la IA (GEMINI_API_KEY). El navegador
 * nunca ve esa clave — solo le manda a esta función el texto que necesita,
 * y esta función le responde con el texto que generó la IA.
 *
 * Para que funcione hace falta, en el proyecto de Vercel:
 *   Settings → Environment Variables → agregar GEMINI_API_KEY con tu clave
 *   gratis de https://aistudio.google.com/apikey (solo pide iniciar sesión
 *   con una cuenta de Google, sin tarjeta), y luego volver a desplegar.
 *
 * Este archivo debe quedar en la carpeta "api" en la RAÍZ del repositorio
 * (al lado de "app", no dentro de ella) — así Vercel lo detecta solo, sin
 * configuración adicional, como /api/ai.
 */
const GEMINI_MODEL = 'gemini-3.8-flash';

// Para clasificar predicaciones por miniatura (ver "images" más abajo): se
// descargan las imágenes aquí, en el servidor, y se le mandan a Gemini como
// datos junto con el texto — así el navegador nunca tiene que exponer una
// clave ni Gemini tiene que poder alcanzar la URL directamente. Límites
// chicos a propósito para que la función responda rápido en Vercel.
const MAX_IMAGES = 14;
const IMAGE_FETCH_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function fetchImageAsInlineData(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    const mime = r.headers.get('content-type') || 'image/jpeg';
    return { mimeType: mime, data: buf.toString('base64') };
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'GEMINI_API_KEY no está configurada en Vercel todavía.',
    });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const prompt = body && body.prompt;
  const modelTier = (body && body.modelTier) || 'default';
  const wantJson = !!(body && body.json);

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ error: 'falta "prompt"' });
    return;
  }
  // límite simple para evitar prompts descontrolados
  const safePrompt = prompt.slice(0, 6000);
  const maxOutputTokens = modelTier === 'quick' ? 700 : 1200;

  // images (opcional): [{id, url}] — miniaturas u otras imágenes a analizar
  // junto con el texto (por ejemplo, para que HERE decida en qué "momento"
  // va cada predicación mirando su miniatura, no solo el título). Cada una
  // se descarga aquí mismo y se manda como inlineData antes del prompt,
  // etiquetada con su id para que la respuesta pueda referirse a ella.
  const rawImages = Array.isArray(body && body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  const parts = [];
  if (rawImages.length) {
    const fetched = await Promise.all(rawImages.map(async (img) => {
      if (!img || typeof img.url !== 'string' || !img.url) return null;
      const inline = await fetchImageAsInlineData(img.url);
      if (!inline) return null;
      return { id: String(img.id || ''), inline };
    }));
    fetched.forEach((f) => {
      if (!f) return;
      parts.push({ text: `[miniatura del video id="${f.id}"]` });
      parts.push({ inlineData: f.inline });
    });
  }
  parts.push({ text: safePrompt });

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens,
      temperature: 0.7,
      // este modelo "piensa" antes de responder por defecto; para respuestas
      // cortas como estas no lo necesitamos, y si no lo apagamos se puede
      // gastar todo el espacio de la respuesta pensando y cortar el texto
      // final a la mitad.
      thinkingConfig: { thinkingBudget: 0 },
      ...(wantJson ? { responseMimeType: 'application/json' } : {}),
    },
  };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      res.status(502).json({ error: 'la IA respondió con un error', detail: errText.slice(0, 500) });
      return;
    }

    const data = await geminiRes.json();
    const candidate = data.candidates && data.candidates[0];
    const resParts = (candidate && candidate.content && candidate.content.parts) || [];
    // por si acaso el modelo manda alguna parte de "pensamiento" (thought:true)
    // aunque la hayamos apagado arriba, la ignoramos y solo usamos la respuesta real.
    const text = resParts.filter((p) => p && p.text && !p.thought).map((p) => p.text).join('') || '';

    if (!text) {
      // la IA pudo haber bloqueado la respuesta (filtros de seguridad, etc.)
      res.status(502).json({ error: 'la IA no devolvió texto', detail: (candidate && candidate.finishReason) || '' });
      return;
    }

    if (wantJson) {
      const cleaned = text.trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/```\s*$/, '');
      try {
        const parsed = JSON.parse(cleaned);
        res.status(200).json(parsed);
      } catch (e) {
        res.status(502).json({ error: 'la IA no devolvió JSON válido' });
      }
      return;
    }

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: 'no se pudo contactar la IA', detail: String((e && e.message) || e) });
  }
};
