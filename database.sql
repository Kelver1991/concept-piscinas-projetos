create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('comercial', 'arquiteto', 'adm')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

create table if not exists public.projects (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_name text;
  normalized_email text;
  admin_email text := 'kelvermendes1991@gmail.com';
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'comercial');
  requested_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  normalized_email := lower(new.email);

  if normalized_email = lower(admin_email) then
    requested_role := 'adm';
  elsif requested_role not in ('comercial', 'arquiteto') then
    requested_role := 'comercial';
  end if;

  insert into public.profiles (id, name, email, role, status, approved_at)
  values (
    new.id,
    requested_name,
    normalized_email,
    requested_role,
    case when requested_role = 'adm' then 'approved' else 'pending' end,
    case when requested_role = 'adm' then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists "Profiles can read own profile" on public.profiles;
drop policy if exists "Approved admins can read profiles" on public.profiles;
drop policy if exists "Approved admins can update profiles" on public.profiles;
drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Authenticated users can update profiles" on public.profiles;

create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

create or replace function public.admin_set_profile_status(
  target_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_status not in ('approved', 'rejected') then
    raise exception 'Status invalido';
  end if;

  if not exists (
    select 1 from public.profiles adm
    where adm.id = auth.uid()
      and adm.role = 'adm'
      and adm.status = 'approved'
  ) then
    raise exception 'Acesso negado';
  end if;

  update public.profiles
  set
    status = next_status,
    approved_at = case when next_status = 'approved' then now() else null end,
    approved_by = auth.uid()
  where id = target_id;

  if next_status = 'approved' then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = target_id;
  end if;
end;
$$;

grant execute on function public.admin_set_profile_status(uuid, text) to authenticated;

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where id in (
  select id from public.profiles
  where status = 'approved'
);

drop policy if exists "Allow public read projects" on public.projects;
drop policy if exists "Allow public insert projects" on public.projects;
drop policy if exists "Allow public update projects" on public.projects;
drop policy if exists "Allow public delete projects" on public.projects;
drop policy if exists "Approved users can read projects" on public.projects;
drop policy if exists "Commercial and admins can insert projects" on public.projects;
drop policy if exists "Architecture and admins can update projects" on public.projects;
drop policy if exists "Admins can delete projects" on public.projects;

create policy "Approved users can read projects"
on public.projects for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
  )
);

create policy "Commercial and admins can insert projects"
on public.projects for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role in ('comercial', 'adm')
  )
);

create policy "Architecture and admins can update projects"
on public.projects for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role in ('arquiteto', 'adm')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role in ('arquiteto', 'adm')
  )
);

create policy "Admins can delete projects"
on public.projects for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role = 'adm'
  )
);
