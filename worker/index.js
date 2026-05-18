const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

class HttpError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const errorJson = (error) => {
  const status = error instanceof HttpError ? error.status : 500;
  return json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Erro interno da API.",
      ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
    },
    status,
  );
};

const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const cleanText = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : fallback;

const cleanLongText = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 20000) : fallback;

const baseUrl = (value) => cleanText(value).replace(/\/$/, "");

const hasOpenAI = (env) => Boolean(cleanText(env.OPENAI_API_KEY));
const hasSupabase = (env) =>
  Boolean(cleanText(env.SUPABASE_URL) && cleanText(env.SUPABASE_ANON_KEY) && cleanText(env.SUPABASE_SERVICE_ROLE_KEY));

const bearerToken = (request) => {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === "string") return payload.output_text;

  const texts = [];
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === "string") texts.push(content.text);
      if (typeof content?.output_text === "string") texts.push(content.output_text);
    }
  }
  return texts.join("\n").trim();
};

const jsonFromText = (text) => {
  const trimmed = typeof text === "string" ? text.trim() : "";
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
};

const supabaseFetch = async (env, path, options = {}) => {
  if (!cleanText(env.SUPABASE_URL)) {
    throw new HttpError("Supabase nao esta configurado no Worker.", 503);
  }

  const useServiceRole = options.serviceRole ?? false;
  const key = useServiceRole ? cleanText(env.SUPABASE_SERVICE_ROLE_KEY) : cleanText(env.SUPABASE_ANON_KEY);
  if (!key) {
    throw new HttpError("Chave Supabase ausente no Worker.", 503);
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${options.token || key}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.prefer ? { Prefer: options.prefer } : {}),
  };

  const response = await fetch(`${baseUrl(env.SUPABASE_URL)}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new HttpError(
      data?.error_description || data?.msg || data?.message || "Erro ao conversar com Supabase.",
      response.status,
      data,
    );
  }

  return data;
};

const authPayload = (data) => {
  const accessToken = data?.access_token || data?.session?.access_token || null;
  const user = data?.user || null;
  return {
    accessToken,
    needsConfirmation: !accessToken,
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || null,
        }
      : null,
  };
};

const requireUser = async (request, env) => {
  const token = bearerToken(request);
  if (!token) {
    throw new HttpError("Faca login para acessar seus dados.", 401);
  }

  // Token validation happens here through Supabase Auth. The Worker never trusts user_id from the browser.
  const user = await supabaseFetch(env, "/auth/v1/user", { token });
  if (!user?.id) {
    throw new HttpError("Sessao expirada. Entre novamente.", 401);
  }

  return { token, user };
};

const optionalUser = async (request, env) => {
  if (!bearerToken(request)) return null;
  return requireUser(request, env);
};

const restQueryValue = (value) => encodeURIComponent(String(value));

const normalizeDraft = (draft) => ({
  id: draft.id,
  userId: draft.user_id,
  title: draft.title || "Rascunho sem nome",
  answers: draft.answers || {},
  reading: draft.reading || {},
  activeIndex: draft.active_index || draft.reading?.activeIndex || 0,
  completion: draft.completion || draft.reading?.completion || 0,
  createdAt: draft.created_at,
  updatedAt: draft.updated_at,
});

const normalizeGeneration = (generation) => ({
  id: generation.id,
  userId: generation.user_id,
  tattooName: generation.tattoo_name,
  archetype: generation.archetype,
  style: generation.style,
  prompt: generation.prompt,
  reading: generation.reading || {},
  imageUrl: generation.image_url,
  createdAt: generation.created_at,
});

const buildTattooPrompt = ({ answers, reading }) => {
  const profile = answers?.profileGender || "perfil neutro";
  return [
    "Crie uma tatuagem simbolica premium, pronta para briefing de tatuador.",
    `Perfil visual corporal: ${profile}.`,
    `Nome/conceito: ${reading?.tattooName || "Tattoo simbolica"}.`,
    `Arquetipo: ${reading?.dominantArchetype || "Em leitura"}.`,
    `Estilo: ${reading?.idealStyle || "Blackwork mistico cinematografico"}.`,
    `Composicao corporal: ${reading?.bodyComposition || "Fluxo organico e anatomico"}.`,
    `Conceito: ${reading?.cinematicConcept || "Composicao ritual e personalizada"}.`,
    `Significado: ${reading?.hiddenMeaning || "Evolucao, protecao e renascimento"}.`,
    "A imagem deve ser uma arte de tattoo em fundo limpo escuro, sem texto, sem watermark, sem mockup de interface.",
    "Priorize silhouette forte, linework claro, sombras tatuaveis, contraste cinematografico, anatomia e espaco negativo.",
  ].join("\n");
};

const callOpenAIResponses = async (env, { answers, reading }) => {
  if (!hasOpenAI(env)) throw new HttpError("OPENAI_API_KEY nao esta configurada no Worker.", 503);

  const textModel = env.OPENAI_TEXT_MODEL || "gpt-5";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: textModel,
      input: [
        {
          role: "developer",
          content:
            "Voce e um diretor criativo senior de tatuagem simbolica. Responda somente JSON valido, sem markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Refine a leitura simbolica e gere relatorio premium, conceito cinematografico, significado oculto, prompt de imagem, prompt de mockup, brief de stencil e significados laterais dos simbolos. Considere perfil masculino, feminino ou neutro na composicao anatomica.",
            answers,
            reading,
            schema: {
              tattooName: "string",
              cinematicConcept: "string",
              hiddenMeaning: "string",
              dominantArchetype: "string",
              idealStyle: "string",
              bodyComposition: "string",
              imagePrompt: "string",
              stencilPrompt: "string",
              mockupPrompt: "string",
              premiumReport: "string",
              symbolExplanations: ["string"],
              alternativeVersions: ["string"],
              reportHighlights: ["string"],
            },
          }),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(payload?.error?.message || "Erro ao gerar texto na OpenAI.", response.status, payload);
  }

  const text = extractResponseText(payload);
  if (!text) throw new HttpError("A OpenAI nao retornou texto para a leitura.", 502);

  return jsonFromText(text);
};

const callOpenAIImage = async (env, prompt) => {
  if (!hasOpenAI(env)) throw new HttpError("OPENAI_API_KEY nao esta configurada no Worker.", 503);

  const imageModel = env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: imageModel,
      prompt,
      size: env.OPENAI_IMAGE_SIZE || "1024x1536",
      quality: "high",
      background: "opaque",
      output_format: "png",
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(payload?.error?.message || "Erro ao gerar imagem na OpenAI.", response.status, payload);
  }

  const imageBase64 = payload?.data?.[0]?.b64_json;
  if (!imageBase64) throw new HttpError("A OpenAI nao retornou imagem em base64.", 502, payload);

  return `data:image/png;base64,${imageBase64}`;
};

const saveGeneration = async (env, { userId, reading, prompt, imageUrl }) => {
  if (!hasSupabase(env)) return { saved: false, error: "Supabase nao configurado." };

  const rows = await supabaseFetch(env, "/rest/v1/tattoo_generations?select=id", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: {
      user_id: userId || null,
      tattoo_name: reading?.tattooName || null,
      archetype: reading?.dominantArchetype || null,
      style: reading?.idealStyle || null,
      prompt,
      reading,
      image_url: imageUrl,
    },
  });

  return { saved: true, id: rows?.[0]?.id };
};

const handleHealth = (env) =>
  json({
    ok: true,
    runtime: "cloudflare-worker",
    openai: hasOpenAI(env),
    supabase: hasSupabase(env),
  });

const handleRegister = async (request, env) => {
  const body = await readJson(request);
  const email = cleanText(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const name = cleanText(body.name);

  if (!email || password.length < 6) {
    throw new HttpError("Informe e-mail e senha com no minimo 6 caracteres.", 400);
  }

  const data = await supabaseFetch(env, "/auth/v1/signup", {
    method: "POST",
    body: {
      email,
      password,
      data: { name },
    },
  });

  return json({
    ok: true,
    ...authPayload(data),
    message: data?.access_token ? "Cadastro criado e acesso liberado." : "Cadastro criado. Confirme seu e-mail.",
  });
};

const handleLogin = async (request, env) => {
  const body = await readJson(request);
  const email = cleanText(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) throw new HttpError("Informe e-mail e senha.", 400);

  const data = await supabaseFetch(env, "/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });

  return json({
    ok: true,
    ...authPayload(data),
    message: "Login realizado.",
  });
};

const handleRecover = async (request, env) => {
  const body = await readJson(request);
  const email = cleanText(body.email).toLowerCase();

  if (!email) throw new HttpError("Informe o e-mail da conta.", 400);

  await supabaseFetch(env, "/auth/v1/recover", {
    method: "POST",
    body: { email },
  });

  return json({ ok: true, message: "Se o e-mail existir, o Supabase enviara um link de recuperacao." });
};

const handleGenerateTattoo = async (request, env) => {
  const body = await readJson(request);
  const auth = await optionalUser(request, env);
  const answers = body.answers || {};
  const localReading = body.reading || {};

  const reading = await callOpenAIResponses(env, { answers, reading: localReading });
  const imagePrompt = reading.imagePrompt || buildTattooPrompt({ answers, reading });
  const imageUrl = await callOpenAIImage(env, imagePrompt);
  const history = await saveGeneration(env, {
    userId: auth?.user?.id || null,
    reading,
    prompt: imagePrompt,
    imageUrl,
  }).catch((error) => ({ saved: false, error: error.message }));

  return json({
    ok: true,
    reading,
    imagePrompt,
    imageUrl,
    history,
    models: {
      text: env.OPENAI_TEXT_MODEL || "gpt-5",
      image: env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    },
  });
};

const handleListDrafts = async (request, env) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(
    env,
    `/rest/v1/tattoo_drafts?select=*&user_id=eq.${restQueryValue(user.id)}&order=updated_at.desc`,
    { serviceRole: true },
  );

  return json({ ok: true, drafts: rows.map(normalizeDraft) });
};

const handleGetDraft = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(
    env,
    `/rest/v1/tattoo_drafts?select=*&id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}`,
    { serviceRole: true },
  );

  if (!rows.length) throw new HttpError("Rascunho nao encontrado.", 404);
  return json({ ok: true, draft: normalizeDraft(rows[0]) });
};

const handleCreateDraft = async (request, env) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const now = new Date().toISOString();
  const reading = {
    ...(body.reading || {}),
    activeIndex: Number(body.activeIndex) || 0,
    completion: Math.max(0, Math.min(100, Number(body.completion) || 0)),
  };

  const rows = await supabaseFetch(env, "/rest/v1/tattoo_drafts?select=*", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: {
      client_id: user.id,
      user_id: user.id,
      title: cleanText(body.title, "Rascunho sem nome"),
      user_name: cleanText(body.answers?.identityName, user.user_metadata?.name || user.email || null),
      profile_gender: cleanText(body.answers?.profileGender, null),
      answers: body.answers || {},
      reading,
      active_index: reading.activeIndex,
      completion: reading.completion,
      updated_at: now,
    },
  });

  return json({ ok: true, draft: normalizeDraft(rows[0]) });
};

const handleUpdateDraft = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const reading = {
    ...(body.reading || {}),
    activeIndex: Number(body.activeIndex) || 0,
    completion: Math.max(0, Math.min(100, Number(body.completion) || 0)),
  };

  const rows = await supabaseFetch(
    env,
    `/rest/v1/tattoo_drafts?id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}&select=*`,
    {
      method: "PATCH",
      serviceRole: true,
      prefer: "return=representation",
      body: {
        client_id: user.id,
        title: cleanText(body.title, "Rascunho sem nome"),
        user_name: cleanText(body.answers?.identityName, user.user_metadata?.name || user.email || null),
        profile_gender: cleanText(body.answers?.profileGender, null),
        answers: body.answers || {},
        reading,
        active_index: reading.activeIndex,
        completion: reading.completion,
        updated_at: new Date().toISOString(),
      },
    },
  );

  if (!rows.length) throw new HttpError("Rascunho nao encontrado.", 404);
  return json({ ok: true, draft: normalizeDraft(rows[0]) });
};

const handleDeleteDraft = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(
    env,
    `/rest/v1/tattoo_drafts?id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}&select=*`,
    {
      method: "DELETE",
      serviceRole: true,
      prefer: "return=representation",
    },
  );

  if (!rows.length) throw new HttpError("Rascunho nao encontrado.", 404);
  return json({ ok: true, deleted: true, draft: normalizeDraft(rows[0]) });
};

const handleListGenerations = async (request, env) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(
    env,
    `/rest/v1/tattoo_generations?select=*&user_id=eq.${restQueryValue(user.id)}&order=created_at.desc`,
    { serviceRole: true },
  );

  return json({ ok: true, generations: rows.map(normalizeGeneration) });
};

const handleCreateGeneration = async (request, env) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const reading = body.reading || {};

  const rows = await supabaseFetch(env, "/rest/v1/tattoo_generations?select=*", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: {
      user_id: user.id,
      tattoo_name: cleanText(body.tattooName, reading.tattooName || null),
      archetype: cleanText(body.archetype, reading.dominantArchetype || null),
      style: cleanText(body.style, reading.idealStyle || null),
      prompt: cleanLongText(body.prompt, reading.imagePrompt || ""),
      reading,
      image_url: cleanText(body.imageUrl, null),
    },
  });

  return json({ ok: true, generation: normalizeGeneration(rows[0]) });
};

const route = async (request, env) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const draftMatch = path.match(/^\/api\/drafts\/([^/]+)$/);

  if (request.method === "GET" && path === "/api/health") return handleHealth(env);
  if (request.method === "POST" && path === "/api/generate-tattoo") return handleGenerateTattoo(request, env);

  if (request.method === "POST" && path === "/api/auth/register") return handleRegister(request, env);
  if (request.method === "POST" && path === "/api/auth/login") return handleLogin(request, env);
  if (request.method === "POST" && path === "/api/auth/recover") return handleRecover(request, env);

  if (request.method === "GET" && path === "/api/drafts") return handleListDrafts(request, env);
  if (request.method === "POST" && path === "/api/drafts") return handleCreateDraft(request, env);
  if (request.method === "GET" && draftMatch) return handleGetDraft(request, env, draftMatch[1]);
  if (request.method === "PUT" && draftMatch) return handleUpdateDraft(request, env, draftMatch[1]);
  if (request.method === "DELETE" && draftMatch) return handleDeleteDraft(request, env, draftMatch[1]);

  if (request.method === "GET" && path === "/api/generations") return handleListGenerations(request, env);
  if (request.method === "POST" && path === "/api/generations") return handleCreateGeneration(request, env);

  throw new HttpError("Rota nao encontrada.", 404);
};

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      return errorJson(error);
    }
  },
};
