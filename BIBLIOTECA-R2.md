# Biblioteca HERE — Supabase (catálogo) + Cloudflare R2 (archivos)

## Cómo funciona
- **Supabase** guarda qué existe: títulos, tipo, derechos, estado, favoritos, progreso.
- **Cloudflare R2** guarda los audios y portadas (archivos pesados). Sin costo de salida de datos.
- **Vercel (`/api/library*`)** es el único que tiene las claves. El navegador nunca ve la clave de R2 ni la `service_role`.
- Subida: el panel pide una URL firmada (15 min) y sube **directo a R2**; luego el servidor verifica que el archivo exista y mida lo declarado.
- Reproducción: `/api/library-media` entrega la URL pública (o firmada de 1 h si el contenido es "solo miembros").
- Lo existente (TTS de la Biblia en Supabase Storage, YouTube) **no se tocó**.

## Pasos (una sola vez)
1. **Supabase → SQL Editor:** pega `supabase_library.sql` y ejecuta. Luego, aparte, para ser administrador (cambia el correo):
   `insert into public.library_admins (user_id) select id from auth.users where email = 'TU_CORREO' on conflict do nothing;`
2. **Cloudflare → R2:** crea un bucket (p. ej. `here-media`). Crea un *API token* de R2 con permiso "Object Read & Write" solo para ese bucket.
3. **Acceso público:** en el bucket, conecta un dominio propio (p. ej. `media.tudominio.com`) — recomendado — o activa el `r2.dev` solo para pruebas. Si no lo haces, igual funciona con enlaces firmados (sin caché de largo plazo; las portadas no se mostrarán).
4. **CORS del bucket** (para que el navegador pueda subir):
   ```json
   [{"AllowedOrigins":["https://hereapp-drab.vercel.app"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]
   ```
5. **Vercel → Settings → Environment Variables** (Production), luego *Redeploy*:

| Variable | Ejemplo ficticio |
|---|---|
| `R2_ACCOUNT_ID` | `0123456789abcdef0123456789abcdef` |
| `R2_ACCESS_KEY_ID` | `a1b2c3…` |
| `R2_SECRET_ACCESS_KEY` | `x9y8z7…` |
| `R2_BUCKET` | `here-media` |
| `R2_PUBLIC_BASE` | `https://media.tudominio.com` |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | clave `service_role` (nunca en el navegador) |
| `SUPABASE_ANON_KEY` | opcional (ya hay una por defecto en `_lib.js`) |

## Subir el primer audio
Inicia sesión con la cuenta admin → **Tu camino** (abajo) → *Administrar biblioteca* → *Nuevo contenido* → llena datos, elige **derechos**, selecciona el MP3/M4A (máx. 300 MB) → Guardar → *Escuchar* para revisar → *Publicar*.
No se puede publicar sin derechos verificados (propio, con licencia o dominio público), con licencia vencida ni sin audio listo (lo exigen el servidor **y** la base de datos).

## Reemplazar un audio
*Editar / subir* → elegir otro archivo. Se crea una versión nueva con clave nueva (no hay caché vieja) y la anterior queda archivada en R2.

## Costos (precios de R2 al consultarlos hoy: $0.015/GB-mes, 10 GB gratis, lecturas 10 M gratis, salida $0)
| Almacenado | Costo R2/mes aprox. |
|---|---|
| 10 GB | $0 (dentro del gratis) |
| 50 GB | ~$0.60 |
| 100 GB | ~$1.35 |
Las operaciones (subidas/lecturas) quedan casi siempre dentro del nivel gratis a esta escala. Supabase y Vercel: el catálogo es muy pequeño; revisa tu plan actual.

## Crecer sin romper nada
- Hoy el catálogo se pide de una vez (hasta 60 por consulta, con `offset`). Si pasa de unos cientos, añadir paginación en la app.
- `Revisar archivos` detecta audios perdidos (hasta 100 por revisión). Para huérfanos en R2 se necesitaría listar el bucket (no implementado).
- Streaming: el navegador usa solicitudes Range sobre R2 (probado con servidor local).
- Audios largos: para rendimiento óptimo en móviles, prefiere MP3/M4A a 64–128 kbps.
- **TTS de la Biblia:** sigue en Supabase Storage (bucket `audio`). Camino de migración futuro: que `api/tts-chapter.js` guarde en R2 con la misma clave `sha1` (ya es idempotente por clave) y registre cada capítulo en `library_media`. No se migró para no arriesgar lo que ya funciona.

## Pendiente / límites honestos
- No probado contra un R2 real (no tengo tus credenciales): firma validada con el vector oficial de AWS y endpoints probados con simulaciones.
- Reproducción en segundo plano con pantalla bloqueada: depende del teléfono; falta probar en iPhone/Android reales.
- Derechos: el sistema controla el permiso, no certifica legalidad. RVR1960 tiene derechos reservados; verifica antes de subir audio bíblico.

## v2 — Artistas, programas y origen (Fase 3b)
1. **Supabase → SQL Editor:** ejecuta `supabase_library_v2.sql` (después de `supabase_library.sql`). Es repetible y no borra nada.
2. Sube los archivos nuevos (`api/library.js`, `api/library-admin.js`, `app/index.html`, `app/service-worker.js`) y espera el deploy.
3. En el panel: pestañas **Contenido / Artistas / Programas** (aparecen cuando la migración está aplicada). Un artista o programa no es público hasta que lo **publiques**.
4. **Origen editorial:** por defecto todo es "De un tercero, con permiso". Solo se muestra "Producción HERE" si un administrador lo marca. Un pastor que publica no convierte su contenido en producción de HERE.

## v3 — Publicación de canciones por la comunidad (Fase 5)
1. **Supabase → SQL Editor:** ejecuta `supabase_library_v3.sql` (después de v1 y v2). Es repetible y no borra nada.
2. Sube `api/library-submit.js`, `api/library-admin.js`, `app/index.html` y `app/service-worker.js`.
3. **Flujo de la persona:** HERE MUSIC → *Publicar mi canción* → términos (se guarda versión y fecha) → datos y audio (MP3/M4A, máx. 60 MB) → vista previa → *Enviar a revisión*. Nada se publica solo.
4. **Revisión (administración):** pestaña **Revisión** → escuchar → *Aprobar y publicar* (sale como "Comunidad", nunca como producción de HERE) o *Rechazar* con motivo (lo ve la persona).
5. **Retiro:** la persona puede retirar su canción desde *Mis publicaciones*; el administrador puede retirar cualquier contenido desde **Reportes**.
6. **Reportes:** en el reproductor, *Reportar* (derechos de autor, inapropiado, información incorrecta, otro). Máx. 10 por persona al día.
7. **Límites:** 3 envíos en revisión a la vez y 10 borradores por persona.
8. **Importante:** el texto de los términos es un BORRADOR. Debe revisarlo un abogado (propiedad intelectual, Ley 1581 de 2012 y procedimiento de reclamaciones) antes de abrir la publicación al público.
