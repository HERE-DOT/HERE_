/*
 * HERE — dirección de reproducción de un audio de la biblioteca.
 *
 *   GET /api/library-media?id=<id del elemento>
 *   → { url, type, size, public }
 *
 * - Contenido público: devuelve la URL pública de R2 (clave inmutable → se puede cachear un año). Si todavía no hay
 *   dominio público configurado (R2_PUBLIC_BASE), devuelve una URL firmada de 6 horas.
 * - Contenido "members": exige sesión y devuelve una URL firmada de 1 hora, sin caché compartida.
 * No se comprueba el archivo en R2 en cada reproducción (costaría una operación por cada play): si falta, el
 * reproductor lo detecta al cargar y el administrador lo ve en "Revisar archivos".
 */
const { configured, rest, userFromRequest, send, RIGHTS_OK } = require('./_lib');
const r2 = require('./_r2');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  const c = r2.config();
  if (!configured() || !c) return send(res, 501, { error: 'not-configured' });
  const id = (req.query || {}).id;
  if (!id || !UUID.test(id)) return send(res, 400, { error: 'bad-id' });
  try {
    const rows = await rest(`library_items?id=eq.${id}&select=id,status,visibility,rights_status,rights_expires,media_id`);
    const it = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    if (!it || it.status !== 'published' || !RIGHTS_OK.includes(it.rights_status) || (it.rights_expires && it.rights_expires < today) || !it.media_id)
      return send(res, 404, { error: 'not-available' });
    const m = (await rest(`library_media?id=eq.${it.media_id}&status=eq.ready&select=r2_key,content_type,size_bytes`))[0];
    if (!m) return send(res, 404, { error: 'no-file' });
    if (it.visibility === 'members') {
      const u = await userFromRequest(req);
      if (!u) return send(res, 401, { error: 'login-required' });
      const url = r2.objectUrl(c, m.r2_key, { method: 'GET', expires: 3600 });
      return send(res, 200, { url, type: m.content_type, size: m.size_bytes, public: false }, 'private, no-store');
    }
    const pub = r2.publicUrl(c, m.r2_key);
    if (pub) return send(res, 200, { url: pub, type: m.content_type, size: m.size_bytes, public: true }, 'public, s-maxage=300, stale-while-revalidate=3600');
    const url = r2.objectUrl(c, m.r2_key, { method: 'GET', expires: 6 * 3600 });
    return send(res, 200, { url, type: m.content_type, size: m.size_bytes, public: false }, 'private, max-age=1800');
  } catch (e) {
    send(res, 502, { error: 'media-failed' });
  }
};
