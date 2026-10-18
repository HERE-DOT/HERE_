/* HERE — utilidades compartidas de la biblioteca (Supabase REST con clave de servidor + comprobación de sesión). */
const SUPABASE_URL = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_KEY;
// La clave "anon/publishable" es pública (ya va dentro de la app); sirve para validar el token de sesión de una persona.
const ANON_KEY = () => process.env.SUPABASE_ANON_KEY || 'sb_publishable_fwA5wuaJh0ksqfaVCxGjSg_CyYnokIo';

const configured = () => !!(SUPABASE_URL() && SERVICE_KEY());

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const h = { apikey: SERVICE_KEY(), Authorization: `Bearer ${SERVICE_KEY()}`, 'Content-Type': 'application/json' };
  if (prefer) h.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) { const err = new Error((data && data.message) || ('supabase-' + r.status)); err.status = r.status; err.detail = data; throw err; }
  return data;
}

/** Devuelve {id,email} de la persona dueña del token "Bearer", o null. */
async function userFromRequest(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  try {
    const r = await fetch(`${SUPABASE_URL()}/auth/v1/user`, { headers: { apikey: ANON_KEY(), Authorization: `Bearer ${m[1]}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) { return null; }
}

async function isAdmin(userId) {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const rows = await rest(`library_admins?user_id=eq.${userId}&select=user_id`);
  return Array.isArray(rows) && rows.length > 0;
}

function send(res, status, obj, cache) {
  res.setHeader('Cache-Control', cache || 'no-store');
  res.status(status).json(obj);
}

const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_AUDIO = 300 * 1024 * 1024;   // 300 MB por archivo
const MAX_COVER = 5 * 1024 * 1024;     // 5 MB
const TYPE_FOLDER = { bible: 'biblia', verse: 'biblia', podcast: 'podcasts', episode: 'podcasts', sermon: 'predicaciones',
                      music: 'musica', reflection: 'reflexiones', devotional: 'devocionales', prayer: 'oraciones', original: 'originales' };
const RIGHTS_OK = ['own', 'licensed', 'public_domain'];

module.exports = { configured, rest, userFromRequest, isAdmin, send, AUDIO_TYPES, IMAGE_TYPES, MAX_AUDIO, MAX_COVER, TYPE_FOLDER, RIGHTS_OK };
