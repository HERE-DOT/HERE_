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

// Convierte una duración ISO 8601 de YouTube ("PT3M45S", "PT1H2M") a segundos.
function iso8601DurationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

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
  // videoDuration (opcional): "short" (<4 min), "medium" (4–20 min) o "long"
  // (>20 min). La usa el frontend para pedir canciones sueltas en vez de
  // mixes largos, sin tener que adivinar por palabras en la búsqueda.
  const rawDuration = (body && body.videoDuration) || req.query.videoDuration;
  const videoDuration = ['short', 'medium', 'long'].includes(rawDuration) ? rawDuration : null;
  // pageToken (opcional): para pedir la siguiente página de la misma
  // búsqueda — lo que usa el botón "Ver más".
  const pageToken = (body && body.pageToken) || req.query.pageToken || undefined;
  // maxDurationSeconds (opcional): filtro exacto en segundos (por ejemplo,
  // 420 = 7 minutos) para las "canciones sueltas". videoDuration por sí solo
  // solo tiene baldes gruesos (short/medium/long), así que cuando se pide
  // este filtro, además se consulta la duración real de cada video
  // (videos.list) y se descartan los que se pasen.
  const rawMaxDuration = (body && body.maxDurationSeconds) || req.query.maxDurationSeconds;
  const maxDurationSeconds = rawMaxDuration ? Math.min(parseInt(rawMaxDuration, 10) || 0, 3600) : null;

  if (!q || typeof q !== 'string' || !q.trim()) {
    res.status(400).json({ error: 'falta "q" (qué buscar)' });
    return;
  }

  try {
    // Cuando hay que filtrar por duración exacta, algunos resultados se van
    // a descartar — así que se piden más de los que finalmente se muestran
    // (hasta el máximo que permite la API de YouTube por página, 50).
    const fetchCount = maxDurationSeconds ? Math.min(maxResults * 3, 50) : maxResults;
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(fetchCount),
      q: q.slice(0, 200),
      // videoEmbeddable: solo resultados que sí se pueden reproducir embebidos
      // en una página (algunos videos lo tienen desactivado).
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      relevanceLanguage: 'es',
      key: apiKey,
    });
    if (videoDuration) params.set('videoDuration', videoDuration);
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const ytRes = await fetch(url);

    if (!ytRes.ok) {
      const errText = await ytRes.text().catch(() => '');
      res.status(502).json({ error: 'YouTube respondió con un error', detail: errText.slice(0, 500) });
      return;
    }

    const data = await ytRes.json();
    let items = (data.items || [])
      .filter((it) => it.id && it.id.videoId)
      .map((it) => ({
        id: it.id.videoId,
        title: (it.snippet && it.snippet.title) || '',
        channel: (it.snippet && it.snippet.channelTitle) || '',
        thumb: (it.snippet && it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url || '',
      }));

    if (maxDurationSeconds && items.length) {
      try {
        const vParams = new URLSearchParams({
          part: 'contentDetails',
          id: items.map((it) => it.id).join(','),
          key: apiKey,
        });
        const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vParams.toString()}`);
        if (vRes.ok) {
          const vData = await vRes.json();
          const durationById = {};
          (vData.items || []).forEach((v) => {
            durationById[v.id] = iso8601DurationToSeconds(v.contentDetails && v.contentDetails.duration);
          });
          items = items.filter((it) => {
            const secs = durationById[it.id];
            return secs != null && secs > 0 && secs <= maxDurationSeconds;
          });
        }
        // si la consulta de duración falla, seguimos sin filtrar por duración
        // exacta en vez de devolver un error — es mejor mostrar algo curado
        // por "videoDuration" que nada.
      } catch (e) { /* idem: se sigue sin el filtro exacto */ }
      items = items.slice(0, maxResults);
    }

    res.status(200).json({ items, nextPageToken: data.nextPageToken || null });
  } catch (e) {
    res.status(500).json({ error: 'no se pudo contactar YouTube', detail: String((e && e.message) || e) });
  }
};
