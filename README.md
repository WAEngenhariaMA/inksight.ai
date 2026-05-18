# Inksight AI

Sistema de formulario simbolico para gerar conceito, prompt tecnico, imagem IA, stencil, mockup e relatorio premium de tatuagem.

## Arquitetura

- Front-end: React/Vite publicado no GitHub Pages.
- Backend/API: Cloudflare Worker em `worker/index.js`.
- IA: OpenAI Responses API para texto e OpenAI Images API para imagem.
- Dados: Supabase Auth, `tattoo_drafts` e `tattoo_generations`.
- Seguranca: chaves sensiveis ficam somente no Cloudflare Worker.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend local: http://127.0.0.1:5176

Backend local legado: http://127.0.0.1:8787

## Publicar o Cloudflare Worker

1. Instale as dependencias:

```bash
npm install
```

2. Se necessario, instale Wrangler:

```bash
npm install -D wrangler
```

3. Faca login na Cloudflare:

```bash
npx wrangler login
```

4. Cadastre os secrets do Worker:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

5. Publique o Worker:

```bash
npm run worker:deploy
```

6. Copie a URL gerada, por exemplo:

```text
https://inksight-api.xxxxx.workers.dev
```

7. Teste a API:

```bash
https://inksight-api.xxxxx.workers.dev/api/health
```

## Configurar GitHub Pages

1. No GitHub, va em **Settings > Pages**.
2. Em **Build and deployment > Source**, escolha **GitHub Actions**.
3. Va em **Settings > Secrets and variables > Actions > Variables**.
4. Crie a variavel:

```bash
VITE_API_BASE_URL=https://inksight-api.xxxxx.workers.dev
```

5. Rode novamente o workflow **Deploy GitHub Pages**.
6. Abra:

```text
https://waengenhariama.github.io/inksight.ai/
```

## Supabase

Rode o arquivo `supabase/schema.sql` no SQL Editor do Supabase. Ele cria/atualiza:

- `tattoo_drafts`
- `tattoo_generations`
- indices por `user_id`
- RLS
- politicas futuras para usuarios autenticados

O Worker usa `SUPABASE_SERVICE_ROLE_KEY` para gravar com seguranca no backend e filtra dados pelo usuario validado no Supabase Auth.

## Variaveis

No GitHub Actions Variables deve existir apenas:

```bash
VITE_API_BASE_URL=https://URL-DO-WORKER.workers.dev
```

No Cloudflare Worker Secrets devem existir:

```bash
OPENAI_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

No `wrangler.toml` ficam somente variaveis nao sensiveis:

```toml
OPENAI_TEXT_MODEL = "gpt-5"
OPENAI_IMAGE_MODEL = "gpt-image-1"
OPENAI_IMAGE_SIZE = "1024x1536"
```

## Seguranca

- Nunca coloque `OPENAI_API_KEY` no front-end.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no front-end.
- Nunca coloque secrets no `wrangler.toml`.
- Nunca commite `.env`.
- Se alguma chave ja foi exposta, revogue e gere uma nova no provedor correspondente.
