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
// Nota: v2 añade artistas, programas y origen (supabase_library_v2.sql). Si esa migración aún no se aplicó,
// el catálogo sigue funcionando con las columnas anteriores.
const r2 = require('./_r2');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ['bible', 'verse', 'podcast', 'episode', 'sermon', 'music', 'reflection', 'devotional', 'prayer', 'original'];
const safeText = (s) => String(s || '').replace(/[,()*%\\"']/g, ' ').trim().slice(0, 60);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  if (!configured()) return send(res, 501, { error: 'not-configured' });
  const q = req.query || {};
  try {
    const pubUrl = (key, url) => { const c0 = r2.config(); return key && c0 && c0.publicBase ? r2.publicUrl(c0, key) : (url || null); };
    if (q.kind === 'artists') {
      let rows = []; try { rows = await rest('library_artists?status=eq.published&select=id,name,photo_key,photo_url,bio,story,featured&order=featured.desc,name.asc&limit=60'); } catch (e) { rows = []; }
      return send(res, 200, { artists: rows.map((a) => ({ id: a.id, name: a.name, photo: pubUrl(a.photo_key, a.photo_url), bio: a.bio, story: a.story, featured: !!a.featured })) }, 'public, s-maxage=60, stale-while-revalidate=600');
    }
    if (q.kind === 'series') {
      let rows = []; try { rows = await rest('library_series?status=eq.published&select=id,title,description,creator,cover_key,cover_url,featured,origin&order=featured.desc,title.asc&limit=60'); } catch (e) { rows = []; }
      return send(res, 200, { series: rows.map((x) => ({ id: x.id, title: x.title, description: x.description, creator: x.creator, cover: pubUrl(x.cover_key, x.cover_url), featured: !!x.featured, origin: x.origin })) }, 'public, s-maxage=60, stale-while-revalidate=600');
    }
    const today = new Date().toISOString().slice(0, 10);
    const f = [
      'status=eq.published', 'visibility=eq.public', `rights_status=in.(${RIGHTS_OK.join(',')})`,
      `or=(rights_expires.is.null,rights_expires.gte.${today})`, 'media_id=not.is.null',
    ];
    if (q.id) { if (!UUID.test(q.id)) return send(res, 400, { error: 'bad-id' }); f.push(`id=eq.${q.id}`); }
    if (q.type) { if (!TYPES.includes(q.type)) return send(res, 400, { error: 'bad-type' }); f.push(`type=eq.${q.type}`); }
    if (q.artist) { if (!UUID.test(q.artist)) return send(res, 400, { error: 'bad-artist' }); f.push(`artist_id=eq.${q.artist}`); }
    if (q.series) { if (!UUID.test(q.series)) return send(res, 400, { error: 'bad-series' }); f.push(`series_id=eq.${q.series}`); }
    if (q.category) { const c = safeText(q.category); if (c) f.push(`categories=cs.{${c}}`); }
    if (q.q) { const t = safeText(q.q); if (t) f.push(`or=(title.ilike.*${t}*,creator.ilike.*${t}*,description.ilike.*${t}*)`); }
    const limit = Math.max(1, Math.min(60, parseInt(q.limit, 10) || 40));
    const offset = Math.max(0, parseInt(q.offset, 10) || 0);
    const baseCols = 'id,type,title,description,creator,cover_key,cover_url,categories,tags,language,duration_sec,series_id,episode_number,published_at,media_id';
    const v2Cols = baseCols + ',artist_id,featured,origin';
    // dos "or" en la misma consulta: PostgREST los combina con "and=(…)"
    const orParts = f.filter((x) => x.startsWith('or='));
    const plain = f.filter((x) => !x.startsWith('or='));
    let url = `library_items?select=COLS&${plain.join('&')}`;
    if (orParts.length === 1) url += `&${orParts[0]}`;
    else if (orParts.length > 1) url += `&and=(${orParts.map((o) => o.slice(3).replace(/^\(/, 'or(')).join(',')})`;
    const tail = q.series ? '&order=episode_number.asc.nullslast,published_at.asc' : '';
    const lim = `&limit=${limit}&offset=${offset}`;
    let items;
    try { items = await rest(url.replace('COLS', v2Cols) + (tail || '&order=featured.desc,published_at.desc.nullslast') + lim); }
    catch (e) { items = await rest(url.replace('COLS', baseCols) + (tail || '&order=published_at.desc.nullslast') + lim); }
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
        artistId: i.artist_id || null, origin: i.origin || 'external', featured: !!i.featured,
        sizeBytes: ready.get(i.media_id).size_bytes,
      };
    });
    send(res, 200, { items: out }, 'public, s-maxage=60, stale-while-revalidate=600');
  } catch (e) {
    send(res, 502, { error: 'library-failed' });
  }
};
