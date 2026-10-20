/*
 * HERE — publicaciones de la comunidad (canciones enviadas por personas con sesión).
 *
 *   POST /api/library-submit   Authorization: Bearer <sesión>   cuerpo { action, ... }
 *
 * Acciones: terms · accept-terms · my · create · sign-upload · complete · submit · withdraw · report
 * Nada se publica solo: "submit" deja el envío en "pending" y un administrador lo revisa (library-admin).
 * Cada persona solo ve y modifica lo suyo; el servidor comprueba el dueño en cada acción.
 */
const crypto = require('crypto');
const L = require('./_lib');
const r2 = require('./_r2');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMS_VERSION = 'v1-2026-10';
const MAX_SONG = 60 * 1024 * 1024;         // 60 MB por canción
const MAX_PENDING = 3;                      // envíos en revisión a la vez por persona
const MAX_DRAFTS = 10;
const REPORT_REASONS = ['copyright', 'inappropriate', 'wrong_info', 'other'];

// BORRADOR para revisión legal: no sustituye el consejo de un abogado.
const TERMS_TEXT = [
  'Al publicar una canción en HERE MUSIC confirmas que eres su titular o que tienes permiso escrito de quienes tienen los derechos (autoría, interpretación y grabación).',
  'Nos autorizas, sin exclusividad y mientras la canción esté publicada, a alojarla y reproducirla dentro de HERE. Tú sigues siendo titular de tu obra.',
  'No publiques contenido de terceros sin permiso, ni contenido ofensivo o contrario al propósito de HERE.',
  'Toda canción pasa por una revisión antes de publicarse. HERE puede rechazarla o retirarla, y no certifica que tengas los derechos: esa responsabilidad es tuya.',
  'Puedes retirar tu canción cuando quieras desde "Mis publicaciones". Si alguien reclama derechos, podremos retirarla mientras se revisa.',
  'HERE MUSIC no ofrece pagos, regalías ni comisiones por ahora.',
];

const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);
function readBody(req) { if (req.body && typeof req.body === 'object') return req.body; try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; } }
const pub = (r) => ({ id: r.id, title: r.title, artistName: r.artist_name, description: r.description, genre: r.genre, status: r.status,
  audioReady: r.audio_ready, hasCover: !!r.cover_key, reviewerNote: r.reviewer_note, createdAt: r.created_at, reviewedAt: r.reviewed_at });

async function mine(id, uid) {
  if (!UUID.test(id || '')) return null;
  const r = (await L.rest(`library_submissions?id=eq.${id}&user_id=eq.${uid}&select=*`))[0];
  return r || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return L.send(res, 405, { error: 'method' });
  if (!L.configured()) return L.send(res, 501, { error: 'not-configured' });
  const user = await L.userFromRequest(req);
  if (!user) return L.send(res, 401, { error: 'login-required' });
  const b = readBody(req);
  try {
    switch (b.action) {
      case 'terms': {
        const acc = await L.rest(`library_terms_acceptances?user_id=eq.${user.id}&terms_version=eq.${TERMS_VERSION}&select=accepted_at`);
        return L.send(res, 200, { version: TERMS_VERSION, text: TERMS_TEXT, accepted: acc.length > 0 });
      }
      case 'accept-terms': {
        if (b.version !== TERMS_VERSION) return L.send(res, 400, { error: 'terms-outdated' });
        await L.rest('library_terms_acceptances?on_conflict=user_id,terms_version', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { user_id: user.id, terms_version: TERMS_VERSION } });
        return L.send(res, 200, { ok: true, version: TERMS_VERSION });
      }
      case 'my': {
        const rows = await L.rest(`library_submissions?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=50`);
        return L.send(res, 200, { items: rows.map(pub) });
      }
      case 'create': {
        const acc = await L.rest(`library_terms_acceptances?user_id=eq.${user.id}&terms_version=eq.${TERMS_VERSION}&select=accepted_at`);
        if (!acc.length) return L.send(res, 403, { error: 'accept-terms-first' });
        if (b.rightsConfirmed !== true) return L.send(res, 400, { error: 'confirm-rights' });
        const title = str(b.title, 120), artist = str(b.artistName, 80);
        if (!title || !artist) return L.send(res, 400, { error: 'title-and-artist-required' });
        const drafts = await L.rest(`library_submissions?user_id=eq.${user.id}&status=in.(draft,pending)&select=id,status`);
        if (drafts.filter((x) => x.status === 'pending').length >= MAX_PENDING) return L.send(res, 429, { error: 'too-many-pending' });
        if (drafts.length >= MAX_DRAFTS) return L.send(res, 429, { error: 'too-many-drafts' });
        const row = (await L.rest('library_submissions', { method: 'POST', prefer: 'return=representation', body: {
          user_id: user.id, title, artist_name: artist, description: str(b.description, 1000), genre: str(b.genre, 40),
          rights_confirmed: true, terms_version: TERMS_VERSION, terms_accepted_at: acc[0].accepted_at, status: 'draft' } }))[0];
        return L.send(res, 200, { item: pub(row) });
      }
      case 'sign-upload': {
        const c = r2.config(); if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const s = await mine(b.id, user.id); if (!s) return L.send(res, 404, { error: 'not-found' });
        if (s.status !== 'draft') return L.send(res, 409, { error: 'not-editable' });
        const kind = b.kind === 'cover' ? 'cover' : 'audio';
        const ct = String(b.contentType || '').toLowerCase(), size = Number(b.size);
        const allowed = kind === 'cover' ? L.IMAGE_TYPES : L.AUDIO_TYPES;
        if (!allowed[ct]) return L.send(res, 400, { error: 'bad-content-type' });
        if (!(size > 0) || size > (kind === 'cover' ? L.MAX_COVER : MAX_SONG)) return L.send(res, 400, { error: 'bad-size' });
        const key = `comunidad/${user.id}/${s.id}/${kind}-${crypto.randomUUID()}.${allowed[ct]}`;
        if (kind === 'audio') await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', body: { audio_key: key, audio_content_type: ct, audio_size: size, audio_ready: false } });
        return L.send(res, 200, { key, putUrl: r2.objectUrl(c, key, { method: 'PUT', expires: 900, headers: { 'content-type': ct } }), headers: { 'Content-Type': ct } });
      }
      case 'complete': {
        const c = r2.config(); if (!c) return L.send(res, 501, { error: 'r2-not-configured' });
        const s = await mine(b.id, user.id); if (!s) return L.send(res, 404, { error: 'not-found' });
        if (s.status !== 'draft') return L.send(res, 409, { error: 'not-editable' });
        if (b.coverKey) {
          if (!String(b.coverKey).startsWith(`comunidad/${user.id}/${s.id}/cover-`)) return L.send(res, 400, { error: 'bad-key' });
          const h = await r2.head(c, b.coverKey); if (!h || h.size > L.MAX_COVER) return L.send(res, 422, { error: 'cover-missing-or-big' });
          await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', body: { cover_key: b.coverKey } });
          return L.send(res, 200, { ok: true });
        }
        if (!s.audio_key) return L.send(res, 400, { error: 'no-audio' });
        const h = await r2.head(c, s.audio_key);
        if (!h) return L.send(res, 422, { error: 'not-uploaded' });
        if (h.size > MAX_SONG || h.size !== Number(s.audio_size)) { await r2.del(c, s.audio_key).catch(() => {}); await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', body: { audio_ready: false, audio_key: null } }); return L.send(res, 422, { error: 'size-mismatch' }); }
        const dur = Number.isInteger(b.durationSec) && b.durationSec > 0 && b.durationSec < 7200 ? b.durationSec : null;
        await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', body: { audio_ready: true, audio_size: h.size, duration_sec: dur } });
        return L.send(res, 200, { ok: true });
      }
      case 'submit': {
        const s = await mine(b.id, user.id); if (!s) return L.send(res, 404, { error: 'not-found' });
        if (s.status !== 'draft') return L.send(res, 409, { error: 'not-editable' });
        if (!s.audio_ready) return L.send(res, 422, { error: 'audio-not-ready' });
        const pend = await L.rest(`library_submissions?user_id=eq.${user.id}&status=eq.pending&select=id`);
        if (pend.length >= MAX_PENDING) return L.send(res, 429, { error: 'too-many-pending' });
        const out = await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'pending' } });
        return L.send(res, 200, { item: pub(out[0]) });
      }
      case 'withdraw': {
        const s = await mine(b.id, user.id); if (!s) return L.send(res, 404, { error: 'not-found' });
        if (!['draft', 'pending', 'approved'].includes(s.status)) return L.send(res, 409, { error: 'not-withdrawable' });
        if (s.status === 'approved' && s.published_item_id) await L.rest(`library_items?id=eq.${s.published_item_id}`, { method: 'PATCH', body: { status: 'archived' } });
        const out = await L.rest(`library_submissions?id=eq.${s.id}`, { method: 'PATCH', prefer: 'return=representation', body: { status: 'withdrawn' } });
        return L.send(res, 200, { item: pub(out[0]) });
      }
      case 'report': {
        if (!UUID.test(b.itemId || '') || !REPORT_REASONS.includes(b.reason)) return L.send(res, 400, { error: 'bad-request' });
        const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const recent = await L.rest(`library_reports?reporter_id=eq.${user.id}&created_at=gte.${day}&select=id`);
        if (recent.length >= 10) return L.send(res, 429, { error: 'too-many-reports' });
        const it = await L.rest(`library_items?id=eq.${b.itemId}&select=id`); if (!it.length) return L.send(res, 404, { error: 'not-found' });
        await L.rest('library_reports', { method: 'POST', body: { item_id: b.itemId, reporter_id: user.id, reason: b.reason, details: str(b.details, 1000) } });
        return L.send(res, 200, { ok: true });
      }
      default: return L.send(res, 400, { error: 'unknown-action' });
    }
  } catch (e) {
    return L.send(res, e.status && e.status < 500 ? 422 : 502, { error: 'submit-failed', message: String(e.message || '').slice(0, 160) });
  }
};
