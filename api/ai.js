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
  const maxOutputTokens = modelTier === 'quick' ? 400 : 700;

  const payload = {
    contents: [{ parts: [{ text: safePrompt }] }],
    generationConfig: {
      maxOutputTokens,
      temperature: 0.7,
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
    const text = (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) || '';

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
