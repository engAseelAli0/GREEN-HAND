-- Invoice creators need read-only access to saved Packing Lists so they can
-- import one list into a new invoice. Company scope remains enforced.

drop policy if exists packing_lists_select on public.packing_lists;
create policy packing_lists_select
on public.packing_lists for select to authenticated
using (
  (
    public.has_packing_list_permission('view')
    or public.has_shipping_invoice_permission('add')
  )
  and public.can_access_packing_list_company(company_name)
);

