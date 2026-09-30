-- Dedicated saved receiving records.
-- The legacy receivings/orders mirrors remain available for operational reports;
-- these tables are the authoritative records used by the receiving screens.

create table if not exists public.company_receivings (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null,
  factory_id text not null default '',
  factory_name text not null default '',
  company_name text not null default '',
  receive_data jsonb not null default '{}'::jsonb,
  order_data jsonb not null default '{}'::jsonb,
  received_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_username text,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_receivings_serial_not_blank
    check (length(btrim(serial_number)) > 0),
  constraint company_receivings_serial_unique unique (serial_number),
  constraint company_receivings_data_is_object
    check (jsonb_typeof(receive_data) = 'object'),
  constraint company_receivings_order_data_is_object
    check (jsonb_typeof(order_data) = 'object')
);

create unique index if not exists company_receivings_serial_normalized_unique
  on public.company_receivings (lower(btrim(serial_number)));
create index if not exists company_receivings_updated_at_idx
  on public.company_receivings (updated_at desc);
create index if not exists company_receivings_factory_idx
  on public.company_receivings (factory_id);
create index if not exists company_receivings_company_idx
  on public.company_receivings (company_name);

-- Backfill existing company receipts once. Existing reports can continue reading
-- the legacy table while the dedicated table becomes the screen-level source.
insert into public.company_receivings (
  serial_number,
  factory_id,
  factory_name,
  company_name,
  receive_data,
  order_data
)
select distinct on (lower(btrim(r.serial_number)))
  btrim(r.serial_number),
  coalesce(o.order_data ->> 'factoryId', ''),
  coalesce(o.order_data ->> 'factoryName', ''),
  coalesce(o.order_data ->> 'buyerCompany', o.order_data ->> 'company', ''),
  case when jsonb_typeof(r.receive_data) = 'object' then r.receive_data else '{}'::jsonb end,
  case when jsonb_typeof(o.order_data) = 'object' then o.order_data else '{}'::jsonb end
from public.receivings r
left join public.orders o on lower(btrim(o.serial_number)) = lower(btrim(r.serial_number))
where length(btrim(r.serial_number)) > 0
  and not exists (
    select 1
    from public.company_receivings existing
    where lower(btrim(existing.serial_number)) = lower(btrim(r.serial_number))
  )
order by lower(btrim(r.serial_number)), r.serial_number;

create table if not exists public.factory_receivings (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null,
  factory_id text not null default '',
  factory_name text not null default '',
  company_name text not null default '',
  receiving_data jsonb not null default '{}'::jsonb,
  order_data jsonb not null default '{}'::jsonb,
  received_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_username text,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factory_receivings_serial_not_blank
    check (length(btrim(serial_number)) > 0),
  constraint factory_receivings_serial_unique unique (serial_number),
  constraint factory_receivings_data_is_object
    check (jsonb_typeof(receiving_data) = 'object'),
  constraint factory_receivings_order_data_is_object
    check (jsonb_typeof(order_data) = 'object')
);

create unique index if not exists factory_receivings_serial_normalized_unique
  on public.factory_receivings (lower(btrim(serial_number)));
create index if not exists factory_receivings_updated_at_idx
  on public.factory_receivings (updated_at desc);
create index if not exists factory_receivings_factory_idx
  on public.factory_receivings (factory_id);
create index if not exists factory_receivings_company_idx
  on public.factory_receivings (company_name);

-- Backfill factory receipts from the factory fields previously embedded in orders.
insert into public.factory_receivings (
  serial_number,
  factory_id,
  factory_name,
  company_name,
  receiving_data,
  order_data
)
select distinct on (lower(btrim(o.serial_number)))
  btrim(o.serial_number),
  coalesce(o.order_data ->> 'factoryId', ''),
  coalesce(o.order_data ->> 'factoryName', ''),
  coalesce(o.order_data ->> 'buyerCompany', o.order_data ->> 'company', ''),
  jsonb_build_object(
    'factoryStatus', o.order_data -> 'factoryStatus',
    'factoryProduction', o.order_data -> 'factoryProduction',
    'factoryPackages', o.order_data -> 'factoryPackages'
  ),
  case when jsonb_typeof(o.order_data) = 'object' then o.order_data else '{}'::jsonb end
from public.orders o
where length(btrim(o.serial_number)) > 0
  and jsonb_typeof(o.order_data) = 'object'
  and (
    o.order_data ? 'factoryStatus'
    or o.order_data ? 'factoryProduction'
    or o.order_data ? 'factoryPackages'
  )
  and not exists (
    select 1
    from public.factory_receivings existing
    where lower(btrim(existing.serial_number)) = lower(btrim(o.serial_number))
  )
order by lower(btrim(o.serial_number)), o.serial_number;

create or replace function public.has_receiving_permission(screen_key text, permission_name text)
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
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> screen_key ->> permission_name)::boolean,
        false
      )
      or (
        permission_name = 'view'
        and coalesce(auth.jwt() -> 'user_metadata' -> 'allowed_pages', '[]'::jsonb) ? screen_key
      )
      or (
        screen_key = 'factory-portal'
        and coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'factory'
        and permission_name in ('view', 'add', 'edit')
        and coalesce(auth.jwt() -> 'user_metadata' -> 'allowed_pages', '[]'::jsonb) ? screen_key
      )
    );
$$;

create or replace function public.can_access_receiving_scope(
  target_factory_id text,
  target_factory_name text,
  target_company text
)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  with permission_scope as (
    select
      coalesce(auth.jwt() -> 'user_metadata' -> 'permissions' -> 'allowed_factories', '[]'::jsonb) as factories,
      coalesce(auth.jwt() -> 'user_metadata' -> 'permissions' -> 'allowed_companies', '[]'::jsonb) as companies
  ),
  normalized_scope as (
    select
      case when jsonb_typeof(factories) = 'array' then factories else '[]'::jsonb end as factories,
      case when jsonb_typeof(companies) = 'array' then companies else '[]'::jsonb end as companies
    from permission_scope
  )
  select
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or (
      jsonb_array_length(factories) = 0
      and jsonb_array_length(companies) = 0
    )
    or (
      (
        jsonb_array_length(factories) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(factories) allowed_factory
          where lower(btrim(allowed_factory)) in (
            lower(btrim(coalesce(target_factory_id, ''))),
            lower(btrim(coalesce(target_factory_name, '')))
          )
        )
      )
      and (
        jsonb_array_length(companies) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(companies) allowed_company
          where lower(btrim(allowed_company)) = lower(btrim(coalesce(target_company, '')))
        )
      )
    )
  from normalized_scope;
$$;

create or replace function public.set_receiving_update_metadata()
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

drop trigger if exists company_receivings_set_update_metadata on public.company_receivings;
create trigger company_receivings_set_update_metadata
before insert or update on public.company_receivings
for each row execute function public.set_receiving_update_metadata();

drop trigger if exists factory_receivings_set_update_metadata on public.factory_receivings;
create trigger factory_receivings_set_update_metadata
before insert or update on public.factory_receivings
for each row execute function public.set_receiving_update_metadata();

alter table public.company_receivings enable row level security;
alter table public.factory_receivings enable row level security;

drop policy if exists company_receivings_select on public.company_receivings;
create policy company_receivings_select
on public.company_receivings for select to authenticated
using (
  public.has_receiving_permission('receiving', 'view')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists company_receivings_insert on public.company_receivings;
create policy company_receivings_insert
on public.company_receivings for insert to authenticated
with check (
  public.has_receiving_permission('receiving', 'add')
  and (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or created_by = auth.uid()
  )
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists company_receivings_update on public.company_receivings;
create policy company_receivings_update
on public.company_receivings for update to authenticated
using (
  public.has_receiving_permission('receiving', 'edit')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
)
with check (
  public.has_receiving_permission('receiving', 'edit')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists company_receivings_delete on public.company_receivings;
create policy company_receivings_delete
on public.company_receivings for delete to authenticated
using (
  public.has_receiving_permission('receiving', 'delete')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists factory_receivings_select on public.factory_receivings;
create policy factory_receivings_select
on public.factory_receivings for select to authenticated
using (
  public.has_receiving_permission('factory-portal', 'view')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists factory_receivings_insert on public.factory_receivings;
create policy factory_receivings_insert
on public.factory_receivings for insert to authenticated
with check (
  public.has_receiving_permission('factory-portal', 'add')
  and (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or created_by = auth.uid()
  )
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists factory_receivings_update on public.factory_receivings;
create policy factory_receivings_update
on public.factory_receivings for update to authenticated
using (
  public.has_receiving_permission('factory-portal', 'edit')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
)
with check (
  public.has_receiving_permission('factory-portal', 'edit')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

drop policy if exists factory_receivings_delete on public.factory_receivings;
create policy factory_receivings_delete
on public.factory_receivings for delete to authenticated
using (
  public.has_receiving_permission('factory-portal', 'delete')
  and public.can_access_receiving_scope(factory_id, factory_name, company_name)
);

grant select, insert, update, delete on public.company_receivings to authenticated;
grant select, insert, update, delete on public.factory_receivings to authenticated;
revoke all on function public.has_receiving_permission(text, text) from public, anon;
revoke all on function public.can_access_receiving_scope(text, text, text) from public, anon;
grant execute on function public.has_receiving_permission(text, text) to authenticated;
grant execute on function public.can_access_receiving_scope(text, text, text) to authenticated;
