-- Saved shipping invoices.
-- Each invoice stores a full snapshot so later order edits do not alter history.

create table if not exists public.shipping_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null,
  invoice_date date not null default current_date,
  company_name text not null default '',
  invoice_data jsonb not null default '{}'::jsonb,
  total_amount numeric(18, 2) not null default 0,
  total_pieces integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_username text,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipping_invoices_invoice_no_not_blank
    check (length(btrim(invoice_no)) > 0),
  constraint shipping_invoices_data_is_object
    check (jsonb_typeof(invoice_data) = 'object'),
  constraint shipping_invoices_total_pieces_nonnegative
    check (total_pieces >= 0)
);

create unique index if not exists shipping_invoices_invoice_no_unique
  on public.shipping_invoices (lower(btrim(invoice_no)));

create index if not exists shipping_invoices_date_idx
  on public.shipping_invoices (invoice_date desc);

create index if not exists shipping_invoices_updated_at_idx
  on public.shipping_invoices (updated_at desc);

create index if not exists shipping_invoices_company_idx
  on public.shipping_invoices (company_name);

create or replace function public.has_shipping_invoice_permission(permission_name text)
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
        (auth.jwt() -> 'user_metadata' -> 'permissions' -> 'shipping-invoice' ->> permission_name)::boolean,
        false
      )
      or (
        permission_name = 'view'
        and coalesce(auth.jwt() -> 'user_metadata' -> 'allowed_pages', '[]'::jsonb) ? 'shipping-invoice'
      )
    );
$$;

create or replace function public.can_access_shipping_invoice_company(target_company text)
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

create or replace function public.set_shipping_invoice_update_metadata()
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

drop trigger if exists shipping_invoices_set_update_metadata on public.shipping_invoices;
create trigger shipping_invoices_set_update_metadata
before insert or update on public.shipping_invoices
for each row execute function public.set_shipping_invoice_update_metadata();

alter table public.shipping_invoices enable row level security;

drop policy if exists shipping_invoices_select on public.shipping_invoices;
create policy shipping_invoices_select
on public.shipping_invoices
for select
to authenticated
using (
  public.has_shipping_invoice_permission('view')
  and public.can_access_shipping_invoice_company(company_name)
);

drop policy if exists shipping_invoices_insert on public.shipping_invoices;
create policy shipping_invoices_insert
on public.shipping_invoices
for insert
to authenticated
with check (
  public.has_shipping_invoice_permission('add')
  and (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or created_by = auth.uid()
  )
  and public.can_access_shipping_invoice_company(company_name)
);

drop policy if exists shipping_invoices_update on public.shipping_invoices;
create policy shipping_invoices_update
on public.shipping_invoices
for update
to authenticated
using (
  public.has_shipping_invoice_permission('edit')
  and public.can_access_shipping_invoice_company(company_name)
)
with check (
  public.has_shipping_invoice_permission('edit')
  and public.can_access_shipping_invoice_company(company_name)
);

drop policy if exists shipping_invoices_delete on public.shipping_invoices;
create policy shipping_invoices_delete
on public.shipping_invoices
for delete
to authenticated
using (
  public.has_shipping_invoice_permission('delete')
  and public.can_access_shipping_invoice_company(company_name)
);

grant select, insert, update, delete on public.shipping_invoices to authenticated;
revoke all on function public.has_shipping_invoice_permission(text) from public, anon;
revoke all on function public.can_access_shipping_invoice_company(text) from public, anon;
grant execute on function public.has_shipping_invoice_permission(text) to authenticated;
grant execute on function public.can_access_shipping_invoice_company(text) to authenticated;
