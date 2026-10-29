# Revisão das correções de segurança — ClarithmIA

## Alterações incluídas

- `netlify/lib/auth.ts`: remove aceitação de tokens `session_*` e leitura não verificada de claims JWT. Tokens Supabase são validados no endpoint Auth; a organização e a role são resolvidas por `organization_members`. Usuários sem associação são bloqueados, múltiplas associações exigem `x-organization-id` e `viewer` não pode alterar fontes.
- `src/lib/supabase.ts`: deixa de fabricar um token de sessão falso quando o Supabase não está configurado ou não existe sessão.
- `netlify/lib/sink.ts` e conectores: feedback é persistido com `organization_id`; deduplicação é feita por organização + `dedupe_key`; não há fallback silencioso para o tenant `default`.
- `netlify/functions/webhooks-incoming.ts`: exige `WEBHOOK_ORGANIZATION_ID` quando a persistência está habilitada.
- `netlify/lib/http.ts`: permite o cabeçalho `x-organization-id` no CORS.
- `supabase/migrations/20261029000000_security_tenancy_hardening.sql`: endurece RLS, restringe execução das funções de tenancy, remove defaults implícitos e cria deduplicação por tenant.
- Testes de autenticação atualizados para cobrir token inválido, membership, seleção de organização e papel viewer.

## Variáveis necessárias no ambiente do servidor

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (chave pública/anon do projeto, somente para validar usuário pelo Supabase Auth)
- `SUPABASE_SERVICE_ROLE_KEY` (somente no servidor; nunca em `VITE_*`)
- `DEFAULT_ORGANIZATION_ID` (ID real existente em `public.organizations`, para conectores internos)
- `WEBHOOK_ORGANIZATION_ID` (ID real da organização dona do webhook)
- `INTERNAL_API_KEY` e `WEBHOOK_SECRET` conforme as rotas utilizadas

## Verificação realizada

- Testes da API: **58 passaram, 0 falharam**.
- Typecheck das Netlify Functions: **passou**.
- Typecheck completo do frontend: não pôde ser validado neste ambiente porque as dependências de frontend (`react`, `@supabase/supabase-js` e tipos associados) não estão instaladas no ZIP; os erros observados são de dependências ausentes.

## Atenção antes de produção

1. A migração SQL foi adicionada ao projeto, mas **não foi executada** em nenhum banco.
2. Antes de executar a migração, faça backup e confirme a ordem/histórico das migrações no projeto Supabase.
3. Linhas antigas com `organization_id = 'default'` não são atribuídas automaticamente a uma organização. Faça uma análise e migração de dados controlada para organizações verificadas.
4. Cadastre os IDs reais de organização e membros em `organizations` e `organization_members` antes de ativar a autenticação de usuários.
5. Usuários pertencentes a mais de uma organização precisam enviar `x-organization-id`. A interface ainda não tem um seletor de organização; até implementá-lo, essas contas precisarão de integração de UI para enviar esse cabeçalho.
6. A integração GitHub/Supabase remota não foi alterada. Todas as alterações estão somente neste pacote ZIP.
