create table if not exists public.projects (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "Allow public read projects" on public.projects;
drop policy if exists "Allow public insert projects" on public.projects;
drop policy if exists "Allow public update projects" on public.projects;
drop policy if exists "Allow public delete projects" on public.projects;

create policy "Allow public read projects"
on public.projects for select
to anon
using (true);

create policy "Allow public insert projects"
on public.projects for insert
to anon
with check (true);

create policy "Allow public update projects"
on public.projects for update
to anon
using (true)
with check (true);

create policy "Allow public delete projects"
on public.projects for delete
to anon
using (true);
