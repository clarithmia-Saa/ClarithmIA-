# ClarithmIA — Backend da Fase 6 (Netlify Functions)

Conectores de entrada de feedback + webhook universal. TypeScript, sem dependências
de runtime (usa `fetch`, `crypto.subtle` e `URL` nativos; **Node ≥ 20**).

| Rota | Arquivo | Método | Auth |
|---|---|---|---|
| `/api/connectors/zendesk` | `functions/connectors-zendesk.ts` | GET, POST | `x-api-key` ou `Authorization: Bearer` (`INTERNAL_API_KEY`) |
| `/api/connectors/twitter` | `functions/connectors-twitter.ts` | GET, POST | idem |
| `/api/webhooks/incoming` | `functions/webhooks-incoming.ts` | POST | `x-webhook-token` ou `Authorization: Bearer` (`WEBHOOK_SECRET`) |

Os caminhos são declarados em cada função (`export const config = { path }`), então não
há redirects no `netlify.toml`.

## Pipeline (igual nos três endpoints)

`fonte → normalização (NormalizedFeedback) → IA simulada → (opcional) Supabase → resposta + SyncReport`

* **Normalização** (`lib/normalize.ts`): remove HTML/caracteres de controle, padroniza datas
  (ISO, epoch s/ms), escala notas para 1–5 e gera `dedupeKey = sha256("<fonte>:<id>")`.
* **IA simulada** (`lib/ai.ts`, modelo `clarithmia-sim-1`): léxico EN/PT com negação e
  intensificadores. Devolve `sentiment` (`positive|neutral|negative` + score −1..1),
  `category` (Billing, Stability, Performance, UI/UX, Onboarding, Integrations, Features,
  Support, General), `urgency` (0–100, `low|medium|high|critical`, `inboxLevel`
  compatível com o filtro da Inbox, e os motivos) e `confidence`. É determinístico, então
  dá para trocar `analyze()` por uma chamada de LLM sem mudar o contrato.
* **Persistência** (`lib/sink.ts`): se `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` existirem,
  faz *upsert* idempotente por `dedupe_key` (schema em `supabase/migrations`). Se a gravação
  falhar, a resposta é **502 `PERSISTENCE_FAILED` (retryable)** e o cursor **não avança**,
  então nada se perde. Sem Supabase, só devolve os itens.

## Zendesk — `GET /api/connectors/zendesk`

Usa o *Incremental Tickets Export* com cursor (`/api/v2/incremental/tickets/cursor.json`),
o método indicado pela Zendesk para sincronização.

| Parâmetro | Descrição |
|---|---|
| `since` | ISO ou epoch. Padrão: últimas 24 h. Limitado a `ZENDESK_MAX_LOOKBACK_DAYS` e a ≥ 1 min atrás (exigência da Zendesk). |
| `cursor` | `nextCursor` da resposta anterior (exclusivo com `since`). |
| `limit` | 1–200 (padrão 100). |
| `dryRun` | `true` não grava no banco. |

Autenticação com a Zendesk: **Bearer** (`ZENDESK_ACCESS_TOKEN`, OAuth). Como fallback, se
só existir `ZENDESK_EMAIL` + `ZENDESK_API_TOKEN`, usa o formato `email/token:token` em
**Basic**, que é o que a Zendesk exige para tokens de API. Os nomes dos solicitantes são
resolvidos em lote (`users/show_many`); se isso falhar, vira aviso e o sync continua.

```bash
curl -H "x-api-key: $INTERNAL_API_KEY" \
  "https://SEU-SITE.netlify.app/api/connectors/zendesk?since=2026-10-24T00:00:00Z&limit=100"
# próxima página:
curl -H "x-api-key: $INTERNAL_API_KEY" \
  "https://SEU-SITE.netlify.app/api/connectors/zendesk?cursor=<nextCursor>"
```

## X / Twitter — `GET /api/connectors/twitter`

API v2 `GET /2/users/:id/mentions` com Bearer token de app (`TWITTER_BEARER_TOKEN`),
expansão do autor (`username`, `name`, `verified`, seguidores) e `public_metrics`.

| Parâmetro | Descrição |
|---|---|
| `userId` / `username` | Conta monitorada (padrão: `TWITTER_USER_ID` / `TWITTER_USERNAME`; o id é resolvido uma vez e fica em cache). |
| `sinceId` | Só menções mais novas que esse id (sync incremental). Exclusivo com `startTime`. |
| `startTime` | ISO ou epoch. |
| `paginationToken` | `cursor.paginationToken` da resposta anterior. |
| `limit` | 5–100 (padrão 50). |

Menções escritas pela própria conta são ignoradas (`skipped.own_tweet`). A resposta traz
`cursor: { sinceId, paginationToken }` e `rateLimit` (cabeçalhos `x-rate-limit-*`).
Observação: a leitura de menções depende do **plano da X API**; planos sem acesso devolvem
403, que vira `UPSTREAM_FORBIDDEN` com uma dica.

## Webhook universal — `POST /api/webhooks/incoming`

1. Valida o token do header (comparação em tempo constante, aceita rotação via `WEBHOOK_SECRETS=a,b`).
2. Exige `Content-Type: application/json`, corpo ≤ `WEBHOOK_MAX_BODY_BYTES` (256 KB) e ≤ `WEBHOOK_MAX_ITEMS` itens (100).
3. Se `WEBHOOK_SIGNING_SECRET` existir, também exige `x-signature: sha256=<hmac hex do corpo bruto>`.
4. Aceita um objeto, um array, ou `{ items | data | feedback | events | records: [...] }`.
5. Mapeia campos livres: texto (`text|message|body|content|comment|review|feedback|description`),
   id (`id|external_id|ticket_id|review_id|uuid`; se faltar, gera um hash estável), data, autor
   (string, e-mail ou objeto), nota (`rating|stars|score|nps`), `source|platform`, `url`, `metadata`.
   `x-webhook-source` define a fonte padrão.
6. Itens inválidos são rejeitados individualmente (`rejects[]`); duplicados no lote são descartados.

```bash
curl -X POST "https://SEU-SITE.netlify.app/api/webhooks/incoming" \
  -H "content-type: application/json" -H "x-webhook-token: $WEBHOOK_SECRET" \
  -d '{"id":"rev-42","source":"trustpilot","message":"Charged twice and still no response!","rating":1}'
```

## Erros

Envelope único; nunca vaza stack, tokens ou detalhes internos:

```json
{ "ok": false, "error": { "code": "RATE_LIMITED", "message": "Zendesk rate limit reached.",
  "requestId": "…", "retryable": true, "details": { "retryAfterSeconds": 120 } } }
```

| Status | `code` | Quando |
|---|---|---|
| 400 | `INVALID_PARAMETER`, `CONFLICTING_PARAMETERS`, `INVALID_JSON`, `EMPTY_PAYLOAD`, `MISSING_ACCOUNT` | Entrada inválida |
| 401 | `UNAUTHORIZED`, `INVALID_SIGNATURE` | Credencial/assinatura ausente ou errada |
| 405 / 413 / 415 / 422 | `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `NO_VALID_ITEMS`, `TOO_MANY_ITEMS` | Requisição fora das regras |
| 429 | `RATE_LIMITED` | Limite do provedor; cabeçalho `Retry-After` |
| 500 | `CONFIG_MISSING`, `INTERNAL_ERROR` | Variável ausente (falha fechada) ou erro inesperado |
| 502 / 504 | `UPSTREAM_AUTH_FAILED`, `UPSTREAM_FORBIDDEN`, `UPSTREAM_NOT_FOUND`, `UPSTREAM_ERROR`, `UPSTREAM_BAD_RESPONSE`, `UPSTREAM_UNREACHABLE`, `PERSISTENCE_FAILED`, `DEADLINE_EXCEEDED` | Falha no provedor ou no banco |

O cliente HTTP (`lib/http-client.ts`) usa timeout por tentativa, até 2 *retries* em
5xx/rede com backoff exponencial + jitter, respeita `Retry-After` / `x-rate-limit-reset` e
**nunca espera além do orçamento da requisição** (`REQUEST_DEADLINE_MS`, 8 s por padrão,
abaixo do timeout padrão de 10 s das functions do Netlify).

## Logs estruturados

Uma linha JSON por evento, com `requestId` (aceita `x-request-id` seguro ou gera UUID),
`fn`, `connector` e `runId`. Chaves sensíveis (`token`, `secret`, `authorization`,
`apiKey`, `signature`, `password`, …) são mascaradas e o texto dos feedbacks **não** é logado.

| Evento | Nível | Conteúdo |
|---|---|---|
| `sync.started` | info | parâmetros da execução |
| `sync.warning` | warn | ex.: `since` ajustado, erro parcial da X, falha ao resolver solicitantes |
| `sync.completed` / `sync.failed` | info / error | `status`, `durationMs`, `counts{fetched,normalized,analyzed,persisted,skipped}`, `skipped{motivo}`, `cursor`, `rateLimit`, nº de avisos/erros |
| `upstream.retry`, `upstream.error_response` | info / warn | provedor, motivo, espera, tentativa, pré-visualização do corpo |
| `request.rejected` / `request.failed` | warn / error | 4xx / 5xx com erro serializado |
| `http.request` | info | método, caminho, status, duração |

```json
{"ts":"2026-10-26T03:01:48.569Z","level":"info","event":"sync.completed","service":"clarithmia-api","fn":"webhook.incoming","requestId":"e50473d8-…","connector":"webhook","runId":"535ac1d2-…","status":"success","durationMs":3,"counts":{"fetched":1,"normalized":1,"analyzed":1,"persisted":0,"skipped":0},"skipped":{},"hasMore":false,"warnings":0,"errors":0}
```

`status` do sync: `success`, `partial` (houve avisos/erros mas itens foram processados) ou `failed`.
O mesmo `SyncReport` vai no campo `sync` da resposta.

## Executar

```bash
cp .env.example .env            # preencha os valores
npm run typecheck:api           # tsc estrito
npm run test:api                # 40 testes (Node ≥ 22.6; upstreams simulados)
npx netlify dev                 # functions em http://localhost:8888/api/...
```

No Netlify: *Site settings → Environment variables*, com as mesmas chaves do `.env.example`.
Aplique `supabase/migrations/20261025000000_feedback.sql` se for persistir.

## Limitações conhecidas

* As functions são *pull on demand*: não há agendador. Chame-as por cron externo, Netlify
  Scheduled Functions ou pelo próprio app, guardando `nextCursor` / `cursor` entre execuções.
* `INTERNAL_API_KEY` protege os conectores de forma simples. Quando houver sessão de usuário
  (ex.: Supabase Auth), troque `requireInternalAuth` por validação do JWT.
* O cache `username → id` da X vive na instância da function (some em *cold start*).
* A gravação no Supabase usa a API REST (PostgREST) e **não foi testada contra um banco real**;
  os testes a cobrem com `fetch` simulado.
