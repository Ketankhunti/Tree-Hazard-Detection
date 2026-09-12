-- ============================================================
-- Tree Hazard Detection — Supabase Schema
-- Idempotent: safe to run multiple times in the SQL Editor
-- ============================================================

-- Citizen-submitted tree hazard complaints
create table if not exists public.complaints (
  id            text primary key,                    -- CIT-XXXX
  address       text not null,
  street        text,
  neighborhood  text not null default 'Unknown',
  complaint_text text not null,
  days_waiting  integer not null default 0,
  submitted_date timestamptz not null default now(),
  status        text not null default 'Pending',     -- Pending | Inspected | In Progress
  latitude      double precision not null default 44.6488,
  longitude     double precision not null default -63.5752,
  photo_url     text,                                -- /uploads/CIT-XXXX.jpg
  photo_path    text,                                -- storage path if using Supabase Storage
  source        text not null default 'citizen',
  created_at    timestamptz not null default now()
);

-- Index for common queries
create index if not exists complaints_submitted_date_idx
  on public.complaints (submitted_date desc);

create index if not exists complaints_status_idx
  on public.complaints (status);

-- Enable Row Level Security
alter table public.complaints enable row level security;

-- Drop existing policies before recreating (idempotent)
drop policy if exists "Public can read complaints"    on public.complaints;
drop policy if exists "Public can submit complaints"  on public.complaints;
drop policy if exists "Public can update complaints"  on public.complaints;

-- Anyone can read complaints (public dashboard)
create policy "Public can read complaints"
  on public.complaints for select
  using (true);

-- Anyone can submit a complaint (public submission form)
create policy "Public can submit complaints"
  on public.complaints for insert
  with check (true);

-- Anyone can update complaint status (officer workflow — tighten later with auth)
create policy "Public can update complaints"
  on public.complaints for update
  using (true);

-- ============================================================
-- Storage bucket for citizen photos (optional — backend
-- currently saves photos locally and serves via /uploads/)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('complaint-photos', 'complaint-photos', true)
on conflict (id) do nothing;

-- Drop existing storage policies before recreating (idempotent)
drop policy if exists "Public can upload complaint photos" on storage.objects;
drop policy if exists "Public can read complaint photos"    on storage.objects;

-- Allow public uploads to the complaint-photos bucket
create policy "Public can upload complaint photos"
  on storage.objects for insert
  with check (bucket_id = 'complaint-photos');

-- Allow public reads of complaint photos
create policy "Public can read complaint photos"
  on storage.objects for select
  using (bucket_id = 'complaint-photos');

-- ============================================================
-- AI Hazard Analyses — stores LLM results so they persist
-- across server restarts and are visible to all clients
-- ============================================================
create table if not exists public.ai_analyses (
  complaint_id    text primary key,                 -- CIT-XXXX or HRM-XXXX
  danger_score    integer not null,
  hazards         jsonb not null default '[]',      -- [{label, points, source}]
  is_unsure       boolean not null default false,
  text_image_conflict boolean not null default false,
  confidence      double precision not null default 0.5,
  reasoning       text not null default '',
  has_image       boolean not null default false,
  photo_description text,
  summary         text not null default '',
  created_at      timestamptz not null default now()
);

-- Enable RLS
alter table public.ai_analyses enable row level security;

drop policy if exists "Public can read AI analyses"   on public.ai_analyses;
drop policy if exists "Public can write AI analyses"  on public.ai_analyses;

create policy "Public can read AI analyses"
  on public.ai_analyses for select
  using (true);

create policy "Public can write AI analyses"
  on public.ai_analyses for insert
  with check (true);

-- Allow upsert (for re-analysis updates)
drop policy if exists "Public can update AI analyses" on public.ai_analyses;
create policy "Public can update AI analyses"
  on public.ai_analyses for update
  using (true);
