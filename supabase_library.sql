-- HERE — Biblioteca multimedia propia (Supabase = catálogo y datos; Cloudflare R2 = archivos)
--
-- Cómo usarlo: Supabase → SQL Editor → pegar TODO este archivo → Run. Es incremental y se puede
-- ejecutar más de una vez (usa "if not exists"). NO borra ni cambia ninguna tabla existente.
-- Para deshacerlo: ver el bloque "ROLLBACK" al final (comentado).
--
-- Quién escribe qué:
--   * El catálogo (library_*) lo escribe SOLO el servidor (api/library-admin.js) con la clave
--     service_role, después de comprobar que quien llama está en library_admins.
--     Por eso estas tablas NO tienen políticas de escritura para clientes (acceso denegado por defecto).
--   * Los favoritos y el progreso de escucha los escribe cada persona (RLS: solo lo suyo).
--   * El público (con o sin cuenta) solo puede LEER lo publicado con derechos verificados.

create extension if not exists pgcrypto;

-- 1) Administradores de la biblioteca ------------------------------------------------------------
create table if not exists public.library_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.library_admins enable row level security;
-- sin políticas: solo el servidor (service_role) la consulta.

-- 2) Series (p. ej. un podcast con episodios) ----------------------------------------------------
create table if not exists public.library_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  creator text,
  cover_key text,                       -- objeto en R2 (opcional)
  cover_url text,                       -- o una URL externa
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.library_series enable row level security;
drop policy if exists "library_series_read" on public.library_series;
create policy "library_series_read" on public.library_series for select using (true);

-- 3) Elementos de la biblioteca -------------------------------------------------------------------
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in
    ('bible','verse','podcast','episode','sermon','music','reflection','devotional','prayer','original')),
  title text not null,
  description text,
  creator text,                         -- autor, artista, pastor o creador
  cover_key text,                       -- portada guardada en R2
  cover_url text,                       -- o URL externa
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  language text not null default 'es',
  duration_sec integer,
  series_id uuid references public.library_series(id) on delete set null,
  episode_number integer,
  published_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  visibility text not null default 'public' check (visibility in ('public','members')),
  -- derechos: el sistema técnico gestiona el permiso, pero NO certifica que sea legal.
  rights_status text not null default 'pending' check (rights_status in ('own','licensed','public_domain','pending','denied')),
  rights_holder text,
  rights_terms text,                    -- alcance y condiciones de distribución
  rights_expires date,
  rights_notes text,
  -- referencia de la versión de audio vigente (la fila de library_media)
  media_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists library_items_type_idx on public.library_items(type);
create index if not exists library_items_status_idx on public.library_items(status, published_at desc);
create index if not exists library_items_series_idx on public.library_items(series_id, episode_number);
create index if not exists library_items_cats_idx on public.library_items using gin(categories);

alter table public.library_items enable row level security;

-- Lectura pública SOLO de lo publicado, con derechos verificados y sin vencer, y de visibilidad pública.
drop policy if exists "library_items_public_read" on public.library_items;
create policy "library_items_public_read" on public.library_items
  for select using (
    status = 'published'
    and visibility = 'public'
    and rights_status in ('own','licensed','public_domain')
    and (rights_expires is null or rights_expires >= current_date)
  );

-- Regla dura en la base de datos: no se puede publicar contenido sin derechos verificados ni sin audio listo.
create or replace function public.library_guard_publish() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'published' then
    if new.rights_status not in ('own','licensed','public_domain') then
      raise exception 'No se puede publicar: los derechos están "%" (deben estar verificados).', new.rights_status;
    end if;
    if new.rights_expires is not null and new.rights_expires < current_date then
      raise exception 'No se puede publicar: la licencia venció el %.', new.rights_expires;
    end if;
    if new.published_at is null then new.published_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists library_items_guard on public.library_items;
create trigger library_items_guard before insert or update on public.library_items
  for each row execute function public.library_guard_publish();

-- 4) Archivos multimedia (metadatos; el binario vive en R2) --------------------------------------
create table if not exists public.library_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.library_items(id) on delete cascade,
  r2_key text not null unique,          -- p. ej. audio/predicaciones/<item>/<id>-v1.mp3 (clave inmutable)
  content_type text not null,
  size_bytes bigint,
  duration_sec integer,
  checksum text,                        -- etag/sha256 informado por R2
  version integer not null default 1,
  status text not null default 'uploading' check (status in ('uploading','ready','missing','archived')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists library_media_item_idx on public.library_media(item_id, version desc);
alter table public.library_media enable row level security;
-- Nadie lee esta tabla directamente desde el navegador: la URL de reproducción la entrega /api/library-media.

alter table public.library_items
  drop constraint if exists library_items_media_fk;
alter table public.library_items
  add constraint library_items_media_fk foreign key (media_id) references public.library_media(id) on delete set null;

-- 5) Listas de reproducción ----------------------------------------------------------------------
create table if not exists public.library_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,   -- null = lista editorial de HERE
  title text not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.library_playlist_items (
  playlist_id uuid not null references public.library_playlists(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  position integer not null default 0,
  primary key (playlist_id, item_id)
);
alter table public.library_playlists enable row level security;
alter table public.library_playlist_items enable row level security;
drop policy if exists "library_playlists_read" on public.library_playlists;
create policy "library_playlists_read" on public.library_playlists
  for select using (is_public = true or owner_id = auth.uid());
drop policy if exists "library_playlists_write" on public.library_playlists;
create policy "library_playlists_write" on public.library_playlists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "library_playlist_items_read" on public.library_playlist_items;
create policy "library_playlist_items_read" on public.library_playlist_items
  for select using (exists (select 1 from public.library_playlists p
    where p.id = playlist_id and (p.is_public or p.owner_id = auth.uid())));
drop policy if exists "library_playlist_items_write" on public.library_playlist_items;
create policy "library_playlist_items_write" on public.library_playlist_items
  for all using (exists (select 1 from public.library_playlists p where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.library_playlists p where p.id = playlist_id and p.owner_id = auth.uid()));

-- 6) Favoritos y progreso de escucha (privados de cada persona) ----------------------------------
create table if not exists public.library_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.library_favorites enable row level security;
drop policy if exists "library_favorites_own" on public.library_favorites;
create policy "library_favorites_own" on public.library_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Una fila por persona y elemento: sirve a la vez de historial ("last_played_at") y de "continuar escuchando".
create table if not exists public.library_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  position_sec integer not null default 0,
  duration_sec integer,
  completed boolean not null default false,
  last_played_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists library_progress_recent_idx on public.library_progress(user_id, last_played_at desc);
alter table public.library_progress enable row level security;
drop policy if exists "library_progress_own" on public.library_progress;
create policy "library_progress_own" on public.library_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 7) Alta del primer administrador (CAMBIA el correo y ejecuta esta línea aparte) ------------------
-- insert into public.library_admins (user_id)
--   select id from auth.users where email = 'TU_CORREO@ejemplo.com'
--   on conflict do nothing;

-- ROLLBACK (solo si necesitas deshacer; BORRA el catálogo y los favoritos/progreso de la biblioteca):
-- drop table if exists public.library_playlist_items, public.library_playlists, public.library_progress,
--   public.library_favorites, public.library_media, public.library_items, public.library_series,
--   public.library_admins cascade;
-- drop function if exists public.library_guard_publish();
