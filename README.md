# Tattoo AI Simbolica

Sistema de formulario simbolico para gerar conceito, prompt tecnico, imagem IA, stencil, mockup e relatorio premium de tatuagem.

## Rodar localmente

```bash
npm install
npm run dev
```

Frontend: http://127.0.0.1:5176
Backend: http://127.0.0.1:8787

## Publicar no GitHub Pages

O GitHub Pages deve publicar o app pelo workflow em `.github/workflows/deploy-pages.yml`, que compila o Vite e envia a pasta `dist`.

No GitHub, abra **Settings > Pages** e altere **Build and deployment > Source** para **GitHub Actions**.

Se o backend estiver hospedado fora do GitHub Pages, cadastre a URL publica em **Settings > Secrets and variables > Actions > Variables**:

```bash
VITE_API_BASE_URL=https://sua-api-publica.com
```

Sem essa URL, a tela abre, mas login, rascunhos, OpenAI e Supabase via backend nao funcionam no GitHub Pages, porque Pages hospeda apenas arquivos estaticos.

## Ligar OpenAI

Crie um arquivo `.env` baseado em `.env.example`:

```bash
OPENAI_API_KEY=sua_chave
OPENAI_TEXT_MODEL=gpt-5
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_SIZE=1024x1536
```

O navegador chama `/api/generate-tattoo`; o backend chama a OpenAI Responses API para refinar o conceito e a OpenAI Images API para gerar a imagem. A chave fica somente no backend.

## Ligar Supabase

Rode `supabase/schema.sql` no SQL Editor do Supabase e adicione:

```bash
SUPABASE_URL=sua_url
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=
```

O login, cadastro e recuperacao de senha usam Supabase Auth. Os rascunhos ficam em `tattoo_drafts` com `user_id`, entao cada conta carrega apenas os proprios projetos.

Quando configurado, cada geracao tambem salva respostas, leitura, prompt, imagem e historico em `tattoo_generations`.
