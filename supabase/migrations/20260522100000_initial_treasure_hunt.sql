create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  phase text not null default 'lobby' check (phase in ('lobby', 'safety', 'scanning', 'hiding', 'seeking', 'treasure', 'finished')),
  key_count integer not null check (key_count between 1 and 5),
  hider_ready boolean not null default false,
  seeker_ready boolean not null default false,
  active_key_index integer not null default 1 check (active_key_index between 1 and 5),
  winner text check (winner in ('hider', 'seeker')),
  countdown_starts_at timestamptz,
  hide_ends_at timestamptz,
  seek_ends_at timestamptz,
  treasure_position jsonb,
  calibration jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.keys (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  key_index integer not null check (key_index between 1 and 5),
  label text not null,
  position jsonb not null,
  found boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, key_index)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.keys enable row level security;

drop policy if exists "anon can read rooms" on public.rooms;
create policy "anon can read rooms"
on public.rooms for select
to anon
using (true);

drop policy if exists "anon can insert rooms" on public.rooms;
create policy "anon can insert rooms"
on public.rooms for insert
to anon
with check (true);

drop policy if exists "anon can update rooms" on public.rooms;
create policy "anon can update rooms"
on public.rooms for update
to anon
using (true)
with check (true);

drop policy if exists "anon can read keys" on public.keys;
create policy "anon can read keys"
on public.keys for select
to anon
using (true);

drop policy if exists "anon can insert keys" on public.keys;
create policy "anon can insert keys"
on public.keys for insert
to anon
with check (true);

drop policy if exists "anon can update keys" on public.keys;
create policy "anon can update keys"
on public.keys for update
to anon
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.keys;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
