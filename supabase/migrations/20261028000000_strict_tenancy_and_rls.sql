-- =============================================================================
-- ClarithmIA — Migração 20261028000000_strict_tenancy_and_rls.sql
-- Correção Estrita de Tenancy, RBAC e Eliminação de Vulnerabilidades RLS
-- =============================================================================

-- 1. Criação da estrutura de Organizações
create table if not exists public.organizations (
  id          text primary key,
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Criação da estrutura de Membros e Funções (RBAC)
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('admin', 'editor', 'viewer')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists org_members_user_idx on public.organization_members (user_id);
create index if not exists org_members_org_idx on public.organization_members (organization_id);

-- 3. Funções de segurança no banco de dados
create or replace function public.current_user_org_ids()
returns setof text
language sql
security definer
stable
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid();
$$;

create or replace function public.user_has_org_role(target_org_id text, min_role text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  user_role text;
begin
  select role into user_role
  from public.organization_members
  where organization_id = target_org_id
    and user_id = auth.uid();

  if user_role is null then
    return false;
  end if;

  if min_role = 'viewer' then
    return true;
  elsif min_role = 'editor' then
    return user_role in ('admin', 'editor');
  elsif min_role = 'admin' then
    return user_role = 'admin';
  end if;

  return false;
end;
$$;

-- 4. Habilitar RLS em Organizations e Members
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy "org_members_select_own"
  on public.organization_members for select
  to authenticated
  using (organization_id in (select public.current_user_org_ids()));

create policy "org_select_own"
  on public.organizations for select
  to authenticated
  using (id in (select public.current_user_org_ids()));

-- 5. Correção Estrita em public.sources (Elimina o vazamento 'default')
alter table public.sources enable row level security;
drop policy if exists "Allow authenticated read sources" on public.sources;
drop policy if exists "sources_tenant_isolation_select" on public.sources;
drop policy if exists "sources_tenant_isolation_modify" on public.sources;

create policy "sources_tenant_isolation_select"
  on public.sources for select
  to authenticated
  using (organization_id in (select public.current_user_org_ids()));

create policy "sources_tenant_isolation_modify"
  on public.sources for all
  to authenticated
  using (public.user_has_org_role(organization_id, 'editor'))
  with check (public.user_has_org_role(organization_id, 'editor'));

-- 6. Correção Estrita em public.feedback (Tenancy + Isolamento de Deduplicação)
alter table public.feedback
  add column if not exists organization_id text not null default 'default';

-- Substituir índice de deduplicação global por índice composto multi-tenant
drop index if exists public.feedback_dedupe_key_uidx;
create unique index if not exists feedback_org_dedupe_key_uidx
  on public.feedback (organization_id, dedupe_key);

create index if not exists feedback_org_created_idx
  on public.feedback (organization_id, created_at desc);

-- RLS para feedback
drop policy if exists "feedback_tenant_isolation_select" on public.feedback;
create policy "feedback_tenant_isolation_select"
  on public.feedback for select
  to authenticated
  using (organization_id in (select public.current_user_org_ids()));

-- Acesso de service_role mantido para ingestão backend
create policy "feedback_service_role_all"
  on public.feedback for all
  to service_role
  using (true)
  with check (true);
