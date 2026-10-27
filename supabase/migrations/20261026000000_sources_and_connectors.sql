-- =============================================================================
-- ClarithmIA — Migration 20261026000000_sources_and_connectors.sql
-- Etapa 3: Integrações Reais e Configuração Segura
--
-- Tabela para persistência não sensível de estado e metadados de fontes conectadas.
-- ATENÇÃO DE SEGURANÇA:
-- Nunca armazene segredos, tokens de API, chaves privadas ou credenciais nesta
-- tabela. Todas as credenciais de autenticação pertencem estritamente às
-- variáveis de ambiente do servidor (Netlify Environment / Secret Manager).
-- =============================================================================

create table if not exists public.sources (
  id              text        primary key,
  platform        text        not null check (platform in (
                                'support',
                                'appstore',
                                'playstore',
                                'x',
                                'instagram',
                                'tiktok',
                                'youtube',
                                'facebook',
                                'linkedin',
                                'webhook'
                              )),
  status          text        not null default 'disconnected' check (status in ('operational', 'syncing', 'disconnected', 'error')),
  connected       boolean     not null default false,
  display_name    text        not null,
  feedbacks_count integer     not null default 0,
  last_sync_at    timestamptz,
  -- Apenas metadados não sensíveis (ex: endpoint URL, webhook route, estatísticas, versão)
  config_metadata jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices para busca e listagem
create index if not exists sources_platform_idx on public.sources (platform);
create index if not exists sources_status_idx on public.sources (status, connected);
create index if not exists sources_last_sync_idx on public.sources (last_sync_at desc nulls last);

-- Habilitar Row Level Security (RLS)
alter table public.sources enable row level security;

-- Política de leitura: usuários autenticados da organização podem consultar fontes
create policy "Allow authenticated read sources"
  on public.sources
  for select
  to authenticated
  using (true);

-- Política de escrita: apenas a service role (backend Netlify Functions) pode inserir e atualizar
create policy "Allow service role full access to sources"
  on public.sources
  for all
  to service_role
  using (true)
  with check (true);
