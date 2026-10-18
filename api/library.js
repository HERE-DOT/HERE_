/*
 * HERE — catálogo público de la biblioteca (solo lectura).
 *
 *   GET /api/library                    → lista de lo publicado
 *   GET /api/library?type=sermon&q=paz  → filtros (type, q, category, series, limit, offset)
 *   GET /api/library?id=<uuid>          → un elemento
 *
 * Solo devuelve contenido: publicado, de visibilidad pública, con derechos verificados (propio / licenciado /
 * dominio público), sin licencia vencida y con audio listo. Son metadatos públicos, así que se cachean en el
 * borde de Vercel (s-maxage). Nunca devuelve claves de R2 ni URLs firmadas: la URL de audio sale de /api/library-media.
 */
const { configured, rest, send, RIGHTS_OK } = require('./_lib');
const r2 = require('./_r2');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ['bible', 'verse', 'podcast', 'episode', 'sermon', 'music', 'reflection', 'devotional', 'prayer', 'original'];
const safeText = (s) => String(s || '').replace(/[,()*%\\"']/g, ' ').trim().slice(0, 60);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  if (!configured()) return send(res, 501, { error: 'not-configured' });
  const q = req.query || {};
  try {
    const today = new Date().toISOString().slice(0, 10);
    const f = [
      'status=eq.published', 'visibility=eq.public', `rights_status=in.(${RIGHTS_OK.join(',')})`,
      `or=(rights_expires.is.null,rights_expires.gte.${today})`, 'media_id=not.is.null',
    ];
    if (q.id) { if (!UUID.test(q.id)) return send(res, 400, { error: 'bad-id' }); f.push(`id=eq.${q.id}`); }
    if (q.type) { if (!TYPES.includes(q.type)) return send(res, 400, { error: 'bad-type' }); f.push(`type=eq.${q.type}`); }
    if (q.series) { if (!UUID.test(q.series)) return send(res, 400, { error: 'bad-series' }); f.push(`series_id=eq.${q.series}`); }
    if (q.category) { const c = safeText(q.category); if (c) f.push(`categories=cs.{${c}}`); }
    if (q.q) { const t = safeText(q.q); if (t) f.push(`or=(title.ilike.*${t}*,creator.ilike.*${t}*,description.ilike.*${t}*)`); }
    const limit = Math.max(1, Math.min(60, parseInt(q.limit, 10) || 40));
    const offset = Math.max(0, parseInt(q.offset, 10) || 0);
    const cols = 'id,type,title,description,creator,cover_key,cover_url,categories,tags,language,duration_sec,series_id,episode_number,published_at,media_id';
    // dos "or" en la misma consulta: PostgREST los combina con "and=(…)"
    const orParts = f.filter((x) => x.startsWith('or='));
    const plain = f.filter((x) => !x.startsWith('or='));
    let url = `library_items?select=${cols}&${plain.join('&')}`;
    if (orParts.length === 1) url += `&${orParts[0]}`;
    else if (orParts.length > 1) url += `&and=(${orParts.map((o) => o.slice(3).replace(/^\(/, 'or(')).join(',')})`;
    url += `&order=published_at.desc.nullslast&limit=${limit}&offset=${offset}`;
    const items = await rest(url);
    if (!items.length) return send(res, 200, { items: [] }, 'public, s-maxage=60, stale-while-revalidate=600');
    const ids = items.map((i) => i.media_id).filter(Boolean);
    const media = await rest(`library_media?id=in.(${ids.join(',')})&status=eq.ready&select=id,size_bytes,content_type`);
    const ready = new Map(media.map((m) => [m.id, m]));
    const c = r2.config();
    const out = items.filter((i) => ready.has(i.media_id)).map((i) => {
      const cover = i.cover_key && c && c.publicBase ? r2.publicUrl(c, i.cover_key) : (i.cover_url || null);
      return {
        id: i.id, type: i.type, title: i.title, description: i.description, creator: i.creator, cover,
        categories: i.categories, tags: i.tags, language: i.language, durationSec: i.duration_sec,
        seriesId: i.series_id, episode: i.episode_number, publishedAt: i.published_at,
        sizeBytes: ready.get(i.media_id).size_bytes,
      };
    });
    send(res, 200, { items: out }, 'public, s-maxage=60, stale-while-revalidate=600');
  } catch (e) {
    send(res, 502, { error: 'library-failed' });
  }
};
