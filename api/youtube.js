/*
 * HERE — puente hacia la búsqueda de YouTube (YouTube Data API v3).
 *
 * Igual que api/ai.js: esta función corre en el servidor de Vercel, nunca
 * en el navegador de la persona, así que es el único lugar seguro para usar
 * la clave (YOUTUBE_API_KEY). El navegador solo le manda el texto que quiere
 * buscar ("adoración", "andrés corson prédica", etc.) y esta función le
 * responde con una lista de videos reales (id, título, canal, miniatura)
 * para reproducir dentro de la app.
 *
 * Para que funcione hace falta, en el proyecto de Vercel:
 *   Settings → Environment Variables → agregar YOUTUBE_API_KEY con tu clave
 *   de https://console.cloud.google.com/apis/credentials (proyecto con la
 *   "YouTube Data API v3" habilitada), y luego volver a desplegar.
 *
 * Este archivo debe quedar en la carpeta "api" en la RAÍZ del repositorio
 * (al lado de "app", no dentro de ella) — así Vercel lo detecta solo, como
 * /api/youtube, igual que /api/ai.
 */
module.exports = async function handler(req, res) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'YOUTUBE_API_KEY no está configurada en Vercel todavía.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  // Acepta la búsqueda tanto por POST (body.q) como por GET (?q=...), para
  // que sea fácil de probar directo desde el navegador.
  const q = (body && body.q) || req.query.q;
  const maxResults = Math.min(parseInt((body && body.maxResults) || req.query.maxResults || 10, 10) || 10, 20);

  if (!q || typeof q !== 'string' || !q.trim()) {
    res.status(400).json({ error: 'falta "q" (qué buscar)' });
    return;
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(maxResults),
      q: q.slice(0, 200),
      // videoEmbeddable: solo resultados que sí se pueden reproducir embebidos
      // en una página (algunos videos lo tienen desactivado).
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      relevanceLanguage: 'es',
      key: apiKey,
    });
    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const ytRes = await fetch(url);

    if (!ytRes.ok) {
      const errText = await ytRes.text().catch(() => '');
      res.status(502).json({ error: 'YouTube respondió con un error', detail: errText.slice(0, 500) });
      return;
    }

    const data = await ytRes.json();
    const items = (data.items || [])
      .filter((it) => it.id && it.id.videoId)
      .map((it) => ({
        id: it.id.videoId,
        title: (it.snippet && it.snippet.title) || '',
        channel: (it.snippet && it.snippet.channelTitle) || '',
        thumb: (it.snippet && it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url || '',
      }));

    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: 'no se pudo contactar YouTube', detail: String((e && e.message) || e) });
  }
};
