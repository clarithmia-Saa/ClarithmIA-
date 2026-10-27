-- =============================================================================
-- ClarithmIA — Migration 20261027000000_sources_tenancy_and_persistence.sql
-- Etapa 4: Persistência Real das Fontes de Integração e Isolamento Multi-tenant
--
-- ATENÇÃO DE SEGURANÇA:
-- Nunca armazene segredos, chaves privadas, senhas ou tokens de API nesta tabela.
-- Apenas metadados não sensíveis (ex: URL pública do endpoint, status, versão)
-- podem ser salvos em config_metadata.
-- =============================================================================

-- Adicionar coluna organization_id de forma idempotente para isolamento multi-tenant
alter table public.sources
  add column if not exists organization_id text not null default 'default';

-- Índice único composto para impedir duplicação de uma mesma plataforma no mesmo tenant
create unique index if not exists sources_platform_org_uidx
  on public.sources (platform, organization_id);

-- Índices adicionais para consultas filtradas por tenant e status de conexão
create index if not exists sources_org_connected_idx
  on public.sources (organization_id, connected);

create index if not exists sources_org_platform_idx
  on public.sources (organization_id, platform);

-- Atualizar políticas de Row Level Security (RLS) para suporte a multi-tenancy seguro
drop policy if exists "Allow authenticated read sources" on public.sources;

create policy "Allow authenticated read sources"
  on public.sources
  for select
  to authenticated
  using (
    organization_id = coalesce(auth.jwt() ->> 'organization_id', 'default')
    or organization_id = 'default'
  );

-- Garantir acesso total à service role (backend Netlify Functions / PostgREST)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sources'
      and policyname = 'Allow service role full access to sources'
  ) then
    create policy "Allow service role full access to sources"
      on public.sources
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
