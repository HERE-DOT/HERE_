/*
 * HERE — acceso a Cloudflare R2 (compatible con S3) sin dependencias.
 * Firma de peticiones AWS Signature V4 con "crypto" de Node. Las credenciales SOLO viven aquí (servidor).
 *
 * Variables de entorno (Vercel):
 *   R2_ACCOUNT_ID         id de tu cuenta de Cloudflare (32 caracteres hex)
 *   R2_ACCESS_KEY_ID      clave de acceso del token de R2
 *   R2_SECRET_ACCESS_KEY  secreto del token de R2
 *   R2_BUCKET             nombre del bucket, p. ej. here-media
 *   R2_PUBLIC_BASE        URL pública del bucket (dominio propio o r2.dev), p. ej. https://media.tudominio.com
 */
const crypto = require('crypto');

const sha256hex = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (key, d) => crypto.createHmac('sha256', key).update(d).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p) => p.split('/').map(enc).join('/');

function config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const accessKey = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secret = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_BUCKET || '').trim();
  const publicBase = String(process.env.R2_PUBLIC_BASE || '').trim().replace(/\/$/, '');
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !accessKey || !secret || !bucket) return null;
  return { accountId, accessKey, secret, bucket, publicBase, host: `${accountId}.r2.cloudflarestorage.com` };
}

/**
 * URL prefirmada (SigV4 en la cadena de consulta). `headers` extra (p. ej. content-type) quedan firmados:
 * quien use la URL debe enviarlos idénticos.
 */
function presign({ method = 'GET', host, path, accessKey, secret, region = 'auto', service = 's3',
                   expires = 900, now = new Date(), headers = {}, query = {} }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const h = Object.assign({ host }, headers);
  const names = Object.keys(h).map((k) => k.toLowerCase()).sort();
  const lower = {}; Object.keys(h).forEach((k) => { lower[k.toLowerCase()] = String(h[k]).trim(); });
  const signedHeaders = names.join(';');
  const q = Object.assign({}, query, {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalQuery = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const canonicalRequest = [method, encPath(path), canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac('AWS4' + secret, date), kRegion = hmac(kDate, region), kService = hmac(kRegion, service);
  const signature = crypto.createHmac('sha256', hmac(kService, 'aws4_request')).update(toSign).digest('hex');
  return `https://${host}${encPath(path)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function objectUrl(c, key, opts) {
  return presign(Object.assign({ host: c.host, path: `/${c.bucket}/${key}`, accessKey: c.accessKey, secret: c.secret }, opts));
}

/** URL de lectura pública (bucket público / dominio propio). Las claves son inmutables, así que se pueden cachear 1 año. */
function publicUrl(c, key) {
  return c.publicBase ? `${c.publicBase}/${encPath(key)}` : null;
}

async function head(c, key) {
  const r = await fetch(objectUrl(c, key, { method: 'HEAD', expires: 60 }), { method: 'HEAD' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('r2-head-' + r.status);
  return { size: Number(r.headers.get('content-length') || 0), type: r.headers.get('content-type') || '', etag: (r.headers.get('etag') || '').replace(/"/g, '') };
}

async function del(c, key) {
  const r = await fetch(objectUrl(c, key, { method: 'DELETE', expires: 60 }), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error('r2-delete-' + r.status);
}

module.exports = { config, presign, objectUrl, publicUrl, head, del };
