# Inksight AI

Plataforma SaaS para gerar leituras simbolicas, conceitos premium, prompts tecnicos, imagens de tattoo com IA, mockups corporais, stencils e relatorios premium com historico por usuario.

## Arquitetura

- Front-end: React/Vite publicado no GitHub Pages.
- Backend seguro: Cloudflare Worker em `worker/index.js`.
- Backend local de desenvolvimento: Express em `server/index.mjs`.
- IA de texto: OpenAI Responses API.
- IA de imagem: provider configuravel por ambiente (`openai`, `replicate` ou `pollinations`).
- Dados: Supabase Auth, Postgres, RLS e Storage.
- Monetizacao: carteira de creditos, extrato de transacoes e estrutura futura de pagamentos.

O usuario final nunca configura chave de IA. `OPENAI_API_KEY`, `REPLICATE_API_TOKEN` e `SUPABASE_SERVICE_ROLE_KEY` ficam somente no backend.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend local:

```text
http://127.0.0.1:5176
```

API local:

```text
http://127.0.0.1:8787
```

Crie um `.env` local baseado em `.env.example`. Nao commite `.env`.

## Variaveis de ambiente locais

```env
IMAGE_PROVIDER=openai

OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-5
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1536

REPLICATE_API_TOKEN=
REPLICATE_MODEL=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ENABLE_CREDIT_SYSTEM=true
ENABLE_MANUAL_CREDIT_ADMIN=true
```

## Cloudflare Worker

Instale/logue o Wrangler:

```bash
npm install -D wrangler
npx wrangler login
```

Cadastre os secrets no Worker:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put REPLICATE_API_TOKEN
```

`REPLICATE_API_TOKEN` e `REPLICATE_MODEL` so sao obrigatorios se `IMAGE_PROVIDER=replicate`.

Publique:

```bash
npm run worker:deploy
```

Teste:

```text
https://inksight-api.xxxxx.workers.dev/api/health
```

## GitHub Pages

No GitHub Actions Variables, configure apenas:

```bash
VITE_API_BASE_URL=https://inksight-api.xxxxx.workers.dev
```

Depois rode o workflow `Deploy GitHub Pages`. O front-end usa `src/lib/api.ts` para montar todas as chamadas:

```ts
fetch(apiUrl("/api/generate-tattoo-image"))
```

Nao chame `/api/...` diretamente sem `VITE_API_BASE_URL`, porque GitHub Pages so hospeda arquivos estaticos.

## Supabase

Rode `supabase/schema.sql` no SQL Editor do Supabase. Ele cria/atualiza:

- `profiles`
- `credits_wallet`
- `credit_transactions`
- `payments`
- `tattoo_drafts`
- `tattoo_generations`
- bucket publico `tattoo-generations`
- indices, triggers de `updated_at`, RLS e politicas por usuario

O Worker usa `SUPABASE_SERVICE_ROLE_KEY` no backend e filtra tudo pelo usuario autenticado.

## Custos de creditos

Os custos ficam centralizados no backend:

- Conceito: 1 credito
- Imagem principal: 5 creditos
- Mockup corporal: 5 creditos
- Stencil: 4 creditos
- Relatorio premium: 2 creditos
- Pacote completo: 12 creditos

O frontend apenas exibe os custos. A validacao real de saldo e desconto acontece no backend. Se a geracao falhar, o credito e estornado automaticamente.

## Rotas principais

```text
GET  /api/health
GET  /api/credits/balance
GET  /api/credits/costs
POST /api/admin/add-credits

POST /api/auth/register
POST /api/auth/login
POST /api/auth/recover

GET    /api/drafts
POST   /api/drafts
GET    /api/drafts/:id
PUT    /api/drafts/:id
DELETE /api/drafts/:id

POST /api/generate-concept
POST /api/generate-tattoo-image
POST /api/generate-mockup
POST /api/generate-stencil
POST /api/generate-tattoo

GET  /api/generations
GET  /api/generations/:id
POST /api/generations
```

## Creditos manuais para teste

Durante o MVP, marque um usuario como `admin` na tabela `profiles` e use:

```bash
curl -X POST https://inksight-api.xxxxx.workers.dev/api/admin/add-credits \
  -H "Authorization: Bearer TOKEN_DO_ADMIN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"ID_DO_USUARIO\",\"amount\":25,\"description\":\"Credito manual de teste\"}"
```

No futuro, a tabela `payments` esta pronta para Mercado Pago, Stripe, Pix manual, Asaas ou OpenPix.

## Seguranca

- Nunca coloque `OPENAI_API_KEY` no front-end.
- Nunca coloque `REPLICATE_API_TOKEN` no front-end.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no front-end.
- Nunca coloque secrets em `wrangler.toml`.
- Nunca commite `.env`.
- Se alguma chave ja foi exposta, revogue e gere uma nova no provedor correspondente.
