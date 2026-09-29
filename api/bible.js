/*
 * HERE — puente hacia otras versiones de la Biblia (API.Bible).
 *
 * Igual que api/ai.js y api/youtube.js: esta función corre en el servidor de
 * Vercel, nunca en el navegador de la persona, así que es el único lugar
 * seguro para usar la clave (BIBLE_API_KEY). El navegador solo le pide
 * "dame las versiones en español disponibles" o "dame Juan 3 en esta
 * versión", y esta función habla con API.Bible (rest.api.bible) y le
 * responde ya masticado.
 *
 * Para que funcione hace falta, en el proyecto de Vercel:
 *   Settings → Environment Variables → agregar BIBLE_API_KEY con tu clave
 *   de https://scripture.api.bible (gratis, con cuenta), y luego volver a
 *   desplegar.
 *
 * Este archivo debe quedar en la carpeta "api" en la RAÍZ del repositorio
 * (al lado de "app", no dentro de ella) — así Vercel lo detecta solo, como
 * /api/bible, igual que /api/ai y /api/youtube.
 */

const BIBLE_API_BASE = 'https://rest.api.bible/v1';

// Recorre el árbol de contenido que devuelve API.Bible con content-type=json
// (nodos "tag" — párrafos, versículos — que contienen nodos "text") y arma un
// mapa { "1": "texto del versículo 1", "2": "...", ... }. Caminar el árbol en
// vez de usar el texto plano evita perder los límites de cada versículo.
function walkContentTree(nodes, verseMap, state) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'tag') {
      if (node.name === 'verse' && node.attrs && node.attrs.number) {
        state.currentVerse = String(node.attrs.number);
        if (!(state.currentVerse in verseMap)) verseMap[state.currentVerse] = '';
      }
      if (Array.isArray(node.items)) walkContentTree(node.items, verseMap, state);
    } else if (node.type === 'text' && node.text) {
      let verseNum = state.currentVerse;
      const verseId = node.attrs && node.attrs.verseId;
      if (verseId) {
        const parts = String(verseId).split('.');
        verseNum = parts[parts.length - 1] || verseNum;
      }
      if (verseNum) verseMap[verseNum] = (verseMap[verseNum] || '') + node.text;
    }
  }
}

function contentTreeToVerses(content) {
  const nodes = Array.isArray(content) ? content : (content && content.items) || [];
  const verseMap = {};
  walkContentTree(nodes, verseMap, { currentVerse: null });
  const nums = Object.keys(verseMap)
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  return nums.map((n) => (verseMap[String(n)] || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.BIBLE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'BIBLE_API_KEY no está configurada en Vercel todavía.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const action = (body && body.action) || req.query.action;

  try {
    if (action === 'list') {
      // Todas las Biblias en español a las que esta clave tiene acceso —
      // el navegador decide entre ellas cuáles ofrecer (por nombre/abreviatura),
      // sin que nosotros tengamos que adivinar IDs de antemano.
      const url = `${BIBLE_API_BASE}/bibles?language=spa`;
      const r = await fetch(url, { headers: { 'api-key': apiKey } });
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        res.status(502).json({ error: 'API.Bible respondió con un error al listar versiones', detail: errText.slice(0, 300) });
        return;
      }
      const data = await r.json();
      const items = (data.data || []).map((b) => ({
        id: b.id,
        name: b.name || '',
        nameLocal: b.nameLocal || '',
        abbreviation: b.abbreviation || '',
        abbreviationLocal: b.abbreviationLocal || '',
        description: b.description || b.descriptionLocal || '',
      }));
      res.status(200).json({ items });
      return;
    }

    if (action === 'chapter') {
      const bibleId = (body && body.bibleId) || req.query.bibleId;
      const bookId = (body && body.bookId) || req.query.bookId;
      const chapterNum = (body && body.chapterNum) || req.query.chapterNum;
      if (!bibleId || !bookId || !chapterNum) {
        res.status(400).json({ error: 'faltan bibleId, bookId o chapterNum' });
        return;
      }
      const chapterId = `${bookId}.${chapterNum}`;
      const params = new URLSearchParams({
        'content-type': 'json',
        'include-notes': 'false',
        'include-titles': 'false',
        'include-chapter-numbers': 'false',
        'include-verse-numbers': 'true',
        'include-verse-spans': 'false',
      });
      const url = `${BIBLE_API_BASE}/bibles/${encodeURIComponent(bibleId)}/chapters/${encodeURIComponent(chapterId)}?${params.toString()}`;
      const r = await fetch(url, { headers: { 'api-key': apiKey } });
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        res.status(502).json({ error: 'API.Bible respondió con un error al pedir el capítulo', detail: errText.slice(0, 300) });
        return;
      }
      const data = await r.json();
      const chapter = data && data.data;
      const verses = chapter ? contentTreeToVerses(chapter.content) : [];
      const copyright = (chapter && chapter.copyright) ? String(chapter.copyright).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      res.status(200).json({ verses, copyright, reference: (chapter && chapter.reference) || '' });
      return;
    }

    res.status(400).json({ error: 'acción no reconocida (usa action=list o action=chapter)' });
  } catch (e) {
    res.status(500).json({ error: 'no se pudo contactar API.Bible', detail: String((e && e.message) || e) });
  }
};
