-- ClarithmIA security hardening: strict organization membership, tenant-scoped dedupe,
-- and no implicit "default" tenant. Review legacy rows before assigning them to an org.

begin;

-- The application/backend must always provide an explicit organization_id for new rows.
alter table public.sources alter column organization_id drop default;
alter table public.feedback
  add column if not exists organization_id text;
update public.feedback set organization_id = 'default' where organization_id is null;
alter table public.feedback alter column organization_id set not null;
alter table public.feedback alter column organization_id drop default;

-- Deduplication must be scoped to a tenant, not global across all organizations.
drop index if exists public.feedback_dedupe_key_uidx;
create unique index if not exists feedback_org_dedupe_key_uidx
  on public.feedback (organization_id, dedupe_key);
create index if not exists feedback_org_created_idx
  on public.feedback (organization_id, created_at desc);

-- Keep membership lookup functions narrowly scoped and safe from search_path hijacking.
create or replace function public.current_user_org_ids()
returns setof text
language sql
security definer
stable
set search_path = ''
as $function$
  select om.organization_id
  from public.organization_members as om
  where om.user_id = (select auth.uid());
$function$;

create or replace function public.user_has_org_role(target_org_id text, min_role text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select coalesce(bool_or(
    case min_role
      when 'viewer' then om.role in ('admin', 'editor', 'viewer')
      when 'editor' then om.role in ('admin', 'editor')
      when 'admin' then om.role = 'admin'
      else false
    end
  ), false)
  from public.organization_members as om
  where om.organization_id = target_org_id
    and om.user_id = (select auth.uid());
$function$;

revoke all on function public.current_user_org_ids() from public, anon;
revoke all on function public.user_has_org_role(text, text) from public, anon;
grant execute on function public.current_user_org_ids() to authenticated;
grant execute on function public.user_has_org_role(text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.sources enable row level security;
alter table public.feedback enable row level security;

drop policy if exists org_members_select_own on public.organization_members;
create policy org_members_select_own
  on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists org_select_own on public.organizations;
create policy org_select_own
  on public.organizations
  for select to authenticated
  using (id in (select public.current_user_org_ids()));

drop policy if exists "Allow authenticated read sources" on public.sources;
drop policy if exists "sources_tenant_isolation_select" on public.sources;
drop policy if exists "sources_tenant_isolation_modify" on public.sources;
drop policy if exists "Allow service role full access to sources" on public.sources;

create policy sources_tenant_isolation_select
  on public.sources
  for select to authenticated
  using (organization_id in (select public.current_user_org_ids()));

create policy sources_tenant_isolation_modify
  on public.sources
  for all to authenticated
  using (public.user_has_org_role(organization_id, 'editor'))
  with check (public.user_has_org_role(organization_id, 'editor'));

drop policy if exists feedback_tenant_isolation_select on public.feedback;
drop policy if exists feedback_service_role_all on public.feedback;
create policy feedback_tenant_isolation_select
  on public.feedback
  for select to authenticated
  using (organization_id in (select public.current_user_org_ids()));

commit;

-- IMPORTANT: existing rows with organization_id = 'default' are deliberately not
-- assigned to any customer. Review and reassign them manually to a verified
-- organization before relying on them in the tenant UI.
