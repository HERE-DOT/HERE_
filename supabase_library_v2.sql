-- HERE — Biblioteca v2: artistas, programas (series) y origen editorial.
-- Ejecutar DESPUÉS de supabase_library.sql. Es incremental, repetible y NO borra datos existentes.
-- Supabase → SQL Editor → pegar todo → Run.

-- 1) Artistas ---------------------------------------------------------------------------------
create table if not exists public.library_artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_key text,                -- foto en R2 (opcional)
  photo_url text,                -- o URL externa
  bio text,
  story text,                    -- presentación o historia (opcional)
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.library_artists enable row level security;
drop policy if exists "library_artists_public_read" on public.library_artists;
create policy "library_artists_public_read" on public.library_artists for select using (status = 'published');
-- sin políticas de escritura: solo el servidor (service_role), igual que el resto del catálogo.

-- 2) Elementos: artista, origen editorial y destacado ---------------------------------------------
alter table public.library_items add column if not exists artist_id uuid references public.library_artists(id) on delete set null;
alter table public.library_items add column if not exists featured boolean not null default false;
-- origen: 'here' = producido/encargado por HERE · 'community' = enviado por la comunidad y aprobado · 'external' = de terceros con permiso.
-- Por defecto 'external': NADA se etiqueta como producción de HERE a menos que un administrador lo marque.
alter table public.library_items add column if not exists origin text not null default 'external';
alter table public.library_items drop constraint if exists library_items_origin_check;
alter table public.library_items add constraint library_items_origin_check check (origin in ('here','community','external'));
create index if not exists library_items_artist_idx on public.library_items(artist_id);

-- 3) Series / programas: estado, destacado y origen ---------------------------------------------
alter table public.library_series add column if not exists status text not null default 'draft';
alter table public.library_series drop constraint if exists library_series_status_check;
alter table public.library_series add constraint library_series_status_check check (status in ('draft','published','archived'));
alter table public.library_series add column if not exists featured boolean not null default false;
alter table public.library_series add column if not exists origin text not null default 'external';
alter table public.library_series drop constraint if exists library_series_origin_check;
alter table public.library_series add constraint library_series_origin_check check (origin in ('here','community','external'));
drop policy if exists "library_series_read" on public.library_series;
create policy "library_series_read" on public.library_series for select using (status = 'published');

-- ROLLBACK (solo si lo necesitas; no toca el catálogo anterior):
-- drop table if exists public.library_artists cascade;
-- alter table public.library_items drop column if exists artist_id, drop column if exists featured, drop column if exists origin;
-- alter table public.library_series drop column if exists status, drop column if exists featured, drop column if exists origin;
-- create policy "library_series_read" on public.library_series for select using (true);
