-- Saved packing lists with complete document snapshots.

create table if not exists public.packing_lists (
  id uuid primary key default gen_random_uuid(),
  packing_no text not null,
  packing_date date not null default current_date,
  company_name text not null default '',
  customer_name text not null default '',
  packing_data jsonb not null default '{}'::jsonb,
  total_cartons numeric(18, 2) not null default 0,
  total_pieces integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_username text,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_lists_number_not_blank check (length(btrim(packing_no)) > 0),
  constraint packing_lists_data_is_object check (jsonb_typeof(packing_data) = 'object'),
  constraint packing_lists_totals_nonnegative check (total_cartons >= 0 and total_pieces >= 0)
);

create unique index if not exists packing_lists_number_unique
  on public.packing_lists (lower(btrim(packing_no)));
create index if not exists packing_lists_date_idx on public.packing_lists (packing_date desc);
create index if not exists packing_lists_updated_at_idx on public.packing_lists (updated_at desc);
create index if not exists packing_lists_company_idx on public.packing_lists (company_name);

create or replace function public.has_packing_list_permission(permission_name text)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select
    auth.uid() is not null
    and (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
      or coalesce(
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'packing-list' ->> permission_name)::boolean,
        false
      )
      or (
        permission_name = 'view'
        and coalesce(auth.jwt() -> 'user_metadata' -> 'allowed_pages', '[]'::jsonb) ? 'packing-list'
      )
    );
$$;

create or replace function public.can_access_packing_list_company(target_company text)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  with permission_scope as (
    select auth.jwt() -> 'user_metadata' -> 'permissions' -> 'allowed_companies' as companies
  )
  select
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or companies is null
    or jsonb_typeof(companies) <> 'array'
    or jsonb_array_length(companies) = 0
    or exists (
      select 1
      from jsonb_array_elements_text(
        case when jsonb_typeof(companies) = 'array' then companies else '[]'::jsonb end
      ) allowed_company
      where lower(btrim(allowed_company)) = lower(btrim(coalesce(target_company, '')))
    )
  from permission_scope;
$$;

create or replace function public.set_packing_list_update_metadata()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'admin' then
      new.created_by = auth.uid();
      new.created_by_username = coalesce(
        auth.jwt() -> 'user_metadata' ->> 'username',
        new.created_by_username
      );
    end if;
    new.updated_by = coalesce(new.updated_by, new.created_by, auth.uid());
    new.updated_by_username = coalesce(new.updated_by_username, new.created_by_username);
  else
    new.created_by = old.created_by;
    new.created_by_username = old.created_by_username;
    new.created_at = old.created_at;
    new.updated_at = now();
    new.updated_by = auth.uid();
    new.updated_by_username = coalesce(
      auth.jwt() -> 'user_metadata' ->> 'username',
      new.updated_by_username
    );
  end if;
  return new;
end;
$$;

drop trigger if exists packing_lists_set_update_metadata on public.packing_lists;
create trigger packing_lists_set_update_metadata
before insert or update on public.packing_lists
for each row execute function public.set_packing_list_update_metadata();

alter table public.packing_lists enable row level security;

drop policy if exists packing_lists_select on public.packing_lists;
create policy packing_lists_select
on public.packing_lists for select to authenticated
using (
  public.has_packing_list_permission('view')
  and public.can_access_packing_list_company(company_name)
);

drop policy if exists packing_lists_insert on public.packing_lists;
create policy packing_lists_insert
on public.packing_lists for insert to authenticated
with check (
  public.has_packing_list_permission('add')
  and (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or created_by = auth.uid()
  )
  and public.can_access_packing_list_company(company_name)
);

drop policy if exists packing_lists_update on public.packing_lists;
create policy packing_lists_update
on public.packing_lists for update to authenticated
using (
  public.has_packing_list_permission('edit')
  and public.can_access_packing_list_company(company_name)
)
with check (
  public.has_packing_list_permission('edit')
  and public.can_access_packing_list_company(company_name)
);

drop policy if exists packing_lists_delete on public.packing_lists;
create policy packing_lists_delete
on public.packing_lists for delete to authenticated
using (
  public.has_packing_list_permission('delete')
  and public.can_access_packing_list_company(company_name)
);

grant select, insert, update, delete on public.packing_lists to authenticated;
revoke all on function public.has_packing_list_permission(text) from public, anon;
revoke all on function public.can_access_packing_list_company(text) from public, anon;
grant execute on function public.has_packing_list_permission(text) to authenticated;
grant execute on function public.can_access_packing_list_company(text) to authenticated;

