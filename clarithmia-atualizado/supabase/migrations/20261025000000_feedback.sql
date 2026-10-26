-- Storage for normalized + AI-analyzed feedback (Phase 6 connectors / webhook).
create table if not exists public.feedback (
  id               bigint generated always as identity primary key,
  dedupe_key       text        not null,
  source           text        not null,
  channel          text        not null,
  external_id      text        not null,
  author_name      text        not null,
  author_handle    text,
  author_email     text,
  subject          text,
  text             text        not null,
  rating           numeric(3,1),
  url              text,
  language         text,
  created_at       timestamptz not null,
  received_at      timestamptz not null,
  sentiment_label  text        not null check (sentiment_label in ('positive', 'neutral', 'negative')),
  sentiment_score  numeric(4,2) not null,
  category         text        not null,
  topics           jsonb       not null default '[]'::jsonb,
  urgency_score    smallint    not null check (urgency_score between 0 and 100),
  urgency_level    text        not null check (urgency_level in ('low', 'medium', 'high', 'critical')),
  urgency_reasons  jsonb       not null default '[]'::jsonb,
  confidence       numeric(3,2) not null,
  summary          text        not null,
  analysis_model   text        not null,
  metadata         jsonb       not null default '{}'::jsonb,
  synced_at        timestamptz not null default now()
);

-- The connectors upsert on this key, which makes re-deliveries idempotent.
create unique index if not exists feedback_dedupe_key_uidx on public.feedback (dedupe_key);
create index if not exists feedback_source_created_idx on public.feedback (source, created_at desc);
create index if not exists feedback_urgency_idx on public.feedback (urgency_score desc);

-- Only the service role (used by the functions) may touch this table.
alter table public.feedback enable row level security;
