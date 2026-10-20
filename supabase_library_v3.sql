-- HERE — Biblioteca v3: publicaciones de la comunidad (revisión previa), aceptación de términos y reportes.
-- Ejecutar DESPUÉS de supabase_library.sql y supabase_library_v2.sql. Es repetible y NO borra datos existentes.
-- Quién escribe: SOLO el servidor (api/library-submit.js y api/library-admin.js, con service_role), después de
-- verificar la sesión. Las personas solo pueden LEER lo suyo; nadie escribe estas tablas desde el navegador.

-- 1) Aceptación de términos (versión y fecha) ---------------------------------------------------------
create table if not exists public.library_terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version)
);
alter table public.library_terms_acceptances enable row level security;
drop policy if exists "library_terms_own_read" on public.library_terms_acceptances;
create policy "library_terms_own_read" on public.library_terms_acceptances for select using (user_id = auth.uid());

-- 2) Envíos de canciones de la comunidad ---------------------------------------------------------------
create table if not exists public.library_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  artist_name text not null,
  description text,
  genre text,
  status text not null default 'draft' check (status in ('draft','pending','approved','rejected','withdrawn')),
  rights_confirmed boolean not null default false,        -- la persona declara tener los derechos o permisos
  terms_version text,
  terms_accepted_at timestamptz,
  audio_key text,                                         -- objeto en R2 (carpeta comunidad/)
  audio_content_type text,
  audio_size bigint,
  audio_ready boolean not null default false,             -- el servidor comprobó que el archivo existe en R2
  duration_sec integer,
  cover_key text,
  reviewer_note text,                                     -- motivo de rechazo o nota editorial (visible para la persona)
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_item_id uuid references public.library_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists library_submissions_user_idx on public.library_submissions(user_id, created_at desc);
create index if not exists library_submissions_status_idx on public.library_submissions(status, created_at);
alter table public.library_submissions enable row level security;
drop policy if exists "library_submissions_own_read" on public.library_submissions;
create policy "library_submissions_own_read" on public.library_submissions for select using (user_id = auth.uid());
-- sin políticas de escritura: crear, enviar, retirar y revisar pasa por el servidor.

-- Regla dura: nada pasa a "pending" ni "approved" sin derechos declarados, términos aceptados y audio verificado.
create or replace function public.library_submission_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status in ('pending','approved') then
    if not new.rights_confirmed then raise exception 'Falta confirmar los derechos.'; end if;
    if new.terms_version is null or new.terms_accepted_at is null then raise exception 'Faltan los términos aceptados.'; end if;
    if not new.audio_ready or new.audio_key is null then raise exception 'Falta el audio verificado.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists library_submissions_guard on public.library_submissions;
create trigger library_submissions_guard before insert or update on public.library_submissions
  for each row execute function public.library_submission_guard();

-- 3) Reportes de contenido ----------------------------------------------------------------------------
create table if not exists public.library_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.library_items(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('copyright','inappropriate','wrong_info','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists library_reports_status_idx on public.library_reports(status, created_at);
alter table public.library_reports enable row level security;
-- sin políticas: nadie lee ni escribe desde el navegador; el servidor recibe y el administrador revisa.

-- ROLLBACK (solo si lo necesitas; BORRA envíos, aceptaciones y reportes):
-- drop table if exists public.library_reports, public.library_submissions, public.library_terms_acceptances cascade;
-- drop function if exists public.library_submission_guard();
