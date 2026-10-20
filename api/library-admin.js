/*
 * HERE — administración de la biblioteca (SOLO personas listadas en library_admins).
 *
 *   POST /api/library-admin   Authorization: Bearer <sesión de Supabase>   cuerpo JSON { action, ... }
 *
 * Acciones: whoami · list · save · sign-upload · complete · publish · unpublish · archive · delete · check
 * Las claves de R2 y la service_role viven solo aquí (variables de entorno de Vercel); el navegador sube el
 * archivo directo a R2 con una URL firmada de 15 minutos, así Vercel no recibe el binario.
 */
const crypto = require('crypto');
const L = require('./_lib');
const r2 = require('./_r2');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ['bible', 'verse', 'podcast', 'episode', 'sermon', 'music', 'reflection', 'devotional', 'prayer', 'original'];
const RIGHTS = ['own', 'licensed', 'public_domain', 'pending', 'denied'];
const VIS = ['public', 'members'];
const ORIGINS = ['here', 'community', 'external'];
const STATUSES = ['draft', 'published', 'archived'];
const ENTITIES = { artist: { table: 'library_artists', imgCol: 'photo_key' }, series: { table: 'library_series', imgCol: 'cover_key' } };

const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((x) => String(x).trim().toLowerCase().replace(/[{}",\\]/g, '')).filter(Boolean).slice(0, 12);
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

async function getItem(id) {
  if (!UUID.test(id || '')) return null;
  return (await L.rest(`library_items?id=eq.${id}&select=*`))[0] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  if (!L.configured()) return L.send(res, 501, { error: 'not-configured' });
  const user = await L.userFromRequest(req);
  if (!user) return L.send(res, 401, { error: 'login-required' });
  let admin = false;
  try { admin = await L.isAdmin(user.id); } catch (e) { return L.send(res, 502, { error: 'admin-check-failed' }); }
  const b = readBody(req);
  if (b.action === 'whoami') return L.send(res, 200, { admin, r2: !!r2.config(), publicBase: !!(r2.config() || {}).publicBase });
  if (!admin) return L.send(res, 403, { error: 'forbidden' });
  const c = r2.config();

  try {
    switch (b.action) {
      case 'list': {
        const items = await L.rest('library_items?select=*&order=updated_at.desc&limit=200');
        const ids = items.map((i) => i.media_id).filter(Boolean);
        const media = ids.length ? await L.rest(`library_media?id=in.(${ids.join(',')})&select=id,status,size_bytes,content_type,r2_key,version,last_error`) : [];
        const m = new Map(media.map((x) => [x.id, x]));
        return L.send(res, 200, { items: items.map((i) => Object.assign({}, i, { media: m.get(i.media_id) || null })) });
      }

      case 'save': {
        const row = {
          type: TYPES.includes(b.type) ? b.type : null,
          title: str(b.title, 160), description: str(b.description, 2000), creator: str(b.creator, 120),
          cover_url: str(b.cover_url, 500), categories: list(b.categories), tags: list(b.tags),
          language: str(b.language, 8) || 'es',
          visibility: VIS.includes(b.visibility) ? b.visibility : 'public',
          rights_status: RIGHTS.includes(b.rights_status) ? b.rights_status : 'pending',
          rights_holder: str(b.rights_holder, 200), rights_terms: str(b.rights_terms, 1000),
          rights_expires: date(b.rights_expires), rights_notes: str(b.rights_notes, 1000),
          episode_number: Number.isInteger(b.episode_number) ? b.episode_number : null,
        };
        if (!row.title || !row.type) return L.send(res, 400, { error: 'title-and-type-required' });
        // v2 (solo si se envían; así nada se rompe antes de aplicar supabase_library_v2.sql)
        if (b.artist_id !== undefined) row.artist_id = UUID.test(b.artist_id || '') ? b.artist_id : null;
        if (b.series_id !== undefined) row.series_id = UUID.test(b.series_id || '') ? b.series_id : null;
        if (b.origin !== undefined) row.origin = ORIGINS.includes(b.origin) ? b.origin : 'external';
        if (b.featured !== undefined) row.featured = b.featured === true;
        if (b.id) {
          const cur = await getItem(b.id); if (!cur) return L.send(res, 404, { error: 'not-found' });
          // si el contenido ya está publicado y los derechos dejan de ser válidos, el trigger lo impide: se despublica antes.
          if (cur.status === 'published' && !L.RIGHTS_OK.includes(row.rights_status)) row.status = 'draft';
          const out = await L.rest(`library_items?id=eq.${b.id}`, { method: 'PATCH', body: row, prefer: 'return=representation' });
          return L.send(res, 200, { item: out[0] });
        }
        row.created_by = user.id; row.status = 'draft';
        const out = await L.rest('library_items', { method: 'POST', body: row, prefer: 'return=representation' });
        return L.send(res, 200, { item: out[0] });
      }

      case 'list-meta': {
        const artists = await L.rest('library_artists?select=*&order=name.asc&limit=200');
        const series = await L.rest('library_series?select=*&order=title.asc&limit=200');
        return L.send(res, 200, { artists, series });
      }

      case 'save-artist':
      case 'save-series': {
        const isA = b.action === 'save-artist';
        const name = str(isA ? b.name : b.title, 160);
        if (!name) return L.send(res, 400, { error: 'name-required' });
        const row = isA
          ? { name, bio: str(b.bio, 1500), story: str(b.story, 4000), photo_url: str(b.photo_url, 500), featured: b.featured === true }
          : { title: name, description: str(b.description, 2000), creator: str(b.creator, 120), cover_url: str(b.cover_url, 500), featured: b.featured === true, origin: ORIGINS.includes(b.origin) ? b.origin : 'external' };
        const t = isA ? 'library_artists' : 'library_series';
        if (b.id) {
          if (!UUID.test(b.id)) return L.send(res, 400, { error: 'bad-id' });
          row.updated_at = new Date().toISOString();
          const out = await L.rest(`${t}?id=eq.${b.id}`, { method: 'PATCH', body: row, prefer: 'return=representation' });
          return L.send(res, 200, { row: out[0] });
        }
        if (isA) row.created_by = user.id;
        const out = await L.rest(t, { method: 'POST', body: row, prefer: 'return=representation' });
        return L.send(res, 200, { row: out[0] });
      }

      case 'set-meta-status': {
        const e = ENTITIES[b.entity];
        if (!e || !UUID.test(b.id || '') || !STATUSES.includes(b.status)) return L.send(res, 400, { error: 'bad-request' });
        const out = await L.rest(`${e.table}?id=eq.${b.id}`, { method: 'PATCH', body: { status: b.status }, prefer: 'return=representation' });
        return L.send(res, 200, { row: out[0] });
      }

      case 'sign-image': {
        // foto de artista o portada de programa: misma firma de 15 min que el audio, con tipo y tamaño validados
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const e = ENTITIES[b.entity];
        if (!e || !UUID.test(b.id || '')) return L.send(res, 400, { error: 'bad-request' });
        const ct = String(b.contentType || '').toLowerCase(), size = Number(b.size);
        if (!L.IMAGE_TYPES[ct]) return L.send(res, 400, { error: 'bad-content-type' });
        if (!(size > 0) || size > L.MAX_COVER) return L.send(res, 400, { error: 'bad-size' });
        const key = `portadas/${b.entity}/${b.id}/${crypto.randomUUID()}.${L.IMAGE_TYPES[ct]}`;
        return L.send(res, 200, { key, putUrl: r2.objectUrl(c, key, { method: 'PUT', expires: 900, headers: { 'content-type': ct } }), headers: { 'Content-Type': ct } });
      }

      case 'complete-image': {
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const e = ENTITIES[b.entity];
        if (!e || !UUID.test(b.id || '') || !String(b.key || '').startsWith(`portadas/${b.entity}/${b.id}/`)) return L.send(res, 400, { error: 'bad-key' });
        const h = await r2.head(c, b.key);
        if (!h || h.size > L.MAX_COVER) return L.send(res, 422, { error: 'cover-missing-or-big' });
        const out = await L.rest(`${e.table}?id=eq.${b.id}`, { method: 'PATCH', body: { [e.imgCol]: b.key }, prefer: 'return=representation' });
        return L.send(res, 200, { row: out[0] });
      }

      case 'subs-list': {
        const st = ['pending', 'approved', 'rejected', 'withdrawn'].includes(b.status) ? b.status : 'pending';
        const rows = await L.rest(`library_submissions?status=eq.${st}&select=id,user_id,title,artist_name,description,genre,status,rights_confirmed,terms_version,terms_accepted_at,audio_ready,duration_sec,cover_key,reviewer_note,created_at,published_item_id&order=created_at.asc&limit=100`);
        return L.send(res, 200, { items: rows });
      }

      case 'sub-preview': {
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        if (!UUID.test(b.id || '')) return L.send(res, 400, { error: 'bad-id' });
        const s = (await L.rest(`library_submissions?id=eq.${b.id}&select=audio_key,audio_ready`))[0];
        if (!s || !s.audio_ready) return L.send(res, 404, { error: 'no-audio' });
        return L.send(res, 200, { url: r2.objectUrl(c, s.audio_key, { method: 'GET', expires: 3600 }) });
      }

      case 'sub-approve': {
        if (!UUID.test(b.id || '')) return L.send(res, 400, { error: 'bad-id' });
        const s = (await L.rest(`library_submissions?id=eq.${b.id}&select=*`))[0];
        if (!s) return L.send(res, 404, { error: 'not-found' });
        if (s.status !== 'pending') return L.send(res, 409, { error: 'not-pending' });
        if (!s.audio_ready || !s.rights_confirmed || !s.terms_version) return L.send(res, 422, { error: 'incomplete-submission' });
        if (c) { const h = await r2.head(c, s.audio_key).catch(() => null); if (!h) return L.send(res, 422, { error: 'audio-missing' }); }
        // 1) elemento del catálogo (origen "comunidad": nunca se presenta como producción de HERE)
        const item = (await L.rest('library_items', { method: 'POST', prefer: 'return=representation', body: {
          type: 'music', title: s.title, creator: s.artist_name, description: s.description, categories: s.genre ? [String(s.genre).toLowerCase()] : [],
          cover_key: s.cover_key, status: 'draft', visibility: 'public', origin: 'community', rights_status: 'licensed',
          rights_holder: s.artist_name, rights_terms: `Declaración de la persona y términos ${s.terms_version} aceptados el ${String(s.terms_accepted_at).slice(0, 10)}`,
          artist_id: UUID.test(b.artistId || '') ? b.artistId : null, created_by: s.user_id } }))[0];
        // 2) archivo ya verificado → fila de media lista
        const media = (await L.rest('library_media', { method: 'POST', prefer: 'return=representation', body: {
          item_id: item.id, r2_key: s.audio_key, content_type: s.audio_content_type, size_bytes: s.audio_size, duration_sec: s.duration_sec, version: 1, status: 'ready' } }))[0];
        await L.rest(`library_items?id=eq.${item.id}`, { method: 'PATCH', body: { media_id: media.id, duration_sec: s.duration_sec, status: 'published' } });
        await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', body: { status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), reviewer_note: str(b.note, 500), published_item_id: item.id } });
        return L.send(res, 200, { ok: true, itemId: item.id });
      }

      case 'sub-reject': {
        if (!UUID.test(b.id || '')) return L.send(res, 400, { error: 'bad-id' });
        const note = str(b.note, 500);
        if (!note) return L.send(res, 400, { error: 'note-required' });
        const out = await L.rest(`library_submissions?id=eq.${b.id}&status=eq.pending`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'rejected', reviewer_note: note, reviewed_by: user.id, reviewed_at: new Date().toISOString() } });
        if (!out.length) return L.send(res, 409, { error: 'not-pending' });
        return L.send(res, 200, { ok: true });
      }

      case 'reports-list': {
        const st = ['open', 'reviewing', 'actioned', 'dismissed'].includes(b.status) ? b.status : 'open';
        const rows = await L.rest(`library_reports?status=eq.${st}&select=id,item_id,reason,details,status,created_at&order=created_at.asc&limit=100`);
        const ids = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
        const items = ids.length ? await L.rest(`library_items?id=in.(${ids.join(',')})&select=id,title,creator,status`) : [];
        const m = new Map(items.map((i) => [i.id, i]));
        return L.send(res, 200, { items: rows.map((r) => Object.assign({}, r, { item: m.get(r.item_id) || null })) });
      }

      case 'report-resolve': {
        if (!UUID.test(b.id || '')) return L.send(res, 400, { error: 'bad-id' });
        const status = b.outcome === 'remove' ? 'actioned' : b.outcome === 'reviewing' ? 'reviewing' : 'dismissed';
        const rep = (await L.rest(`library_reports?id=eq.${b.id}&select=item_id`))[0];
        if (!rep) return L.send(res, 404, { error: 'not-found' });
        if (b.outcome === 'remove' && rep.item_id) await L.rest(`library_items?id=eq.${rep.item_id}`, { method: 'PATCH', body: { status: 'archived' } });   // retirada inmediata
        await L.rest(`library_reports?id=eq.${b.id}`, { method: 'PATCH', body: { status, resolution_note: str(b.note, 500), resolved_by: user.id, resolved_at: new Date().toISOString() } });
        return L.send(res, 200, { ok: true, removed: b.outcome === 'remove' });
      }

      case 'sign-upload': {
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const it = await getItem(b.itemId); if (!it) return L.send(res, 404, { error: 'not-found' });
        const kind = b.kind === 'cover' ? 'cover' : 'audio';
        const ct = String(b.contentType || '').toLowerCase();
        const size = Number(b.size);
        const allowed = kind === 'cover' ? L.IMAGE_TYPES : L.AUDIO_TYPES;
        if (!allowed[ct]) return L.send(res, 400, { error: 'bad-content-type', allowed: Object.keys(allowed) });
        if (!(size > 0) || size > (kind === 'cover' ? L.MAX_COVER : L.MAX_AUDIO)) return L.send(res, 400, { error: 'bad-size' });
        const folder = L.TYPE_FOLDER[it.type] || 'otros';
        const id = crypto.randomUUID();
        if (kind === 'cover') {
          const key = `portadas/${it.id}/${id}.${allowed[ct]}`;
          return L.send(res, 200, { key, putUrl: r2.objectUrl(c, key, { method: 'PUT', expires: 900, headers: { 'content-type': ct } }), headers: { 'Content-Type': ct } });
        }
        const prev = (await L.rest(`library_media?item_id=eq.${it.id}&select=version&order=version.desc&limit=1`))[0];
        const version = (prev ? prev.version : 0) + 1;
        const key = `audio/${folder}/${it.id}/${id}-v${version}.${allowed[ct]}`;   // clave nueva e inmutable en cada versión
        const media = (await L.rest('library_media', { method: 'POST', prefer: 'return=representation',
          body: { item_id: it.id, r2_key: key, content_type: ct, size_bytes: size, version, status: 'uploading' } }))[0];
        return L.send(res, 200, { mediaId: media.id, key, putUrl: r2.objectUrl(c, key, { method: 'PUT', expires: 900, headers: { 'content-type': ct } }), headers: { 'Content-Type': ct } });
      }

      case 'complete': {
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        // portada: solo se asocia si el objeto existe
        if (b.coverKey) {
          const it = await getItem(b.itemId); if (!it) return L.send(res, 404, { error: 'not-found' });
          if (!String(b.coverKey).startsWith(`portadas/${it.id}/`)) return L.send(res, 400, { error: 'bad-key' });
          const h = await r2.head(c, b.coverKey);
          if (!h || h.size > L.MAX_COVER) return L.send(res, 422, { error: 'cover-missing-or-big' });
          const out = await L.rest(`library_items?id=eq.${it.id}`, { method: 'PATCH', body: { cover_key: b.coverKey }, prefer: 'return=representation' });
          return L.send(res, 200, { item: out[0] });
        }
        if (!UUID.test(b.mediaId || '')) return L.send(res, 400, { error: 'bad-id' });
        const m = (await L.rest(`library_media?id=eq.${b.mediaId}&select=*`))[0];
        if (!m) return L.send(res, 404, { error: 'not-found' });
        const h = await r2.head(c, m.r2_key);
        if (!h) { await L.rest(`library_media?id=eq.${m.id}`, { method: 'PATCH', body: { status: 'missing', last_error: 'No llegó a R2' } }); return L.send(res, 422, { error: 'not-uploaded' }); }
        if (h.size > L.MAX_AUDIO || h.size !== Number(m.size_bytes)) {
          await r2.del(c, m.r2_key).catch(() => {});
          await L.rest(`library_media?id=eq.${m.id}`, { method: 'PATCH', body: { status: 'missing', last_error: 'Tamaño distinto al declarado' } });
          return L.send(res, 422, { error: 'size-mismatch' });
        }
        const dur = Number.isInteger(b.durationSec) && b.durationSec > 0 && b.durationSec < 60 * 60 * 24 ? b.durationSec : null;
        await L.rest(`library_media?id=eq.${m.id}`, { method: 'PATCH', body: { status: 'ready', size_bytes: h.size, checksum: h.etag || null, duration_sec: dur, last_error: null } });
        // la versión anterior queda archivada (sigue en R2 hasta que se decida borrarla); el elemento conserva su identidad.
        await L.rest(`library_media?item_id=eq.${m.item_id}&id=neq.${m.id}&status=eq.ready`, { method: 'PATCH', body: { status: 'archived' } });
        const out = await L.rest(`library_items?id=eq.${m.item_id}`, { method: 'PATCH', body: { media_id: m.id, duration_sec: dur }, prefer: 'return=representation' });
        return L.send(res, 200, { item: out[0] });
      }

      case 'preview': {
        // escucha previa de un borrador: URL firmada de 1 hora, solo para administradores
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const it = await getItem(b.id); if (!it || !it.media_id) return L.send(res, 404, { error: 'no-audio' });
        const m = (await L.rest(`library_media?id=eq.${it.media_id}&select=r2_key,content_type`))[0];
        if (!m) return L.send(res, 404, { error: 'no-audio' });
        return L.send(res, 200, { url: r2.objectUrl(c, m.r2_key, { method: 'GET', expires: 3600 }), type: m.content_type });
      }

      case 'publish': {
        const it = await getItem(b.id); if (!it) return L.send(res, 404, { error: 'not-found' });
        if (!L.RIGHTS_OK.includes(it.rights_status)) return L.send(res, 422, { error: 'rights-not-verified' });
        if (it.rights_expires && it.rights_expires < new Date().toISOString().slice(0, 10)) return L.send(res, 422, { error: 'license-expired' });
        if (!it.media_id) return L.send(res, 422, { error: 'no-audio' });
        const m = (await L.rest(`library_media?id=eq.${it.media_id}&select=status`))[0];
        if (!m || m.status !== 'ready') return L.send(res, 422, { error: 'audio-not-ready' });
        const out = await L.rest(`library_items?id=eq.${it.id}`, { method: 'PATCH', body: { status: 'published' }, prefer: 'return=representation' });
        return L.send(res, 200, { item: out[0] });
      }

      case 'unpublish':
      case 'archive': {
        if (!UUID.test(b.id || '')) return L.send(res, 400, { error: 'bad-id' });
        const out = await L.rest(`library_items?id=eq.${b.id}`, { method: 'PATCH', body: { status: b.action === 'archive' ? 'archived' : 'draft' }, prefer: 'return=representation' });
        return L.send(res, 200, { item: out[0] });
      }

      case 'delete': {
        // borrado definitivo: exige confirmación explícita y solo de contenido que NO está publicado.
        const it = await getItem(b.id); if (!it) return L.send(res, 404, { error: 'not-found' });
        if (b.confirm !== it.title) return L.send(res, 400, { error: 'confirm-title' });
        if (it.status === 'published') return L.send(res, 409, { error: 'unpublish-first' });
        const media = await L.rest(`library_media?item_id=eq.${it.id}&select=r2_key`);
        if (c) for (const x of media) await r2.del(c, x.r2_key);
        if (c && it.cover_key) await r2.del(c, it.cover_key);
        await L.rest(`library_items?id=eq.${it.id}`, { method: 'DELETE' });
        return L.send(res, 200, { ok: true, removedFiles: media.length });
      }

      case 'check': {
        if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const media = await L.rest('library_media?status=eq.ready&select=id,item_id,r2_key&limit=100');
        const missing = [];
        for (const x of media) {
          const h = await r2.head(c, x.r2_key).catch(() => 'error');
          if (h === null) { missing.push(x); await L.rest(`library_media?id=eq.${x.id}`, { method: 'PATCH', body: { status: 'missing', last_error: 'No existe en R2' } }); }
        }
        return L.send(res, 200, { checked: media.length, missing });
      }

      default:
        return L.send(res, 400, { error: 'unknown-action' });
    }
  } catch (e) {
    return L.send(res, e.status && e.status < 500 ? 422 : 502, { error: 'admin-failed', message: String(e.message || '').slice(0, 200) });
  }
};
