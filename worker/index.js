const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const CREDIT_COSTS = {
  concept: 1,
  tattooImage: 5,
  mockup: 5,
  stencil: 4,
  report: 2,
  fullPackage: 12,
};

const GENERATION_TYPES = {
  concept: "concept",
  tattooImage: "tattoo_image",
  mockup: "mockup",
  stencil: "stencil",
  fullPackage: "full_package",
};

const STORAGE_BUCKET = "tattoo-generations";

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
  typeof value === "string" && value.trim() ? value.trim().slice(0, 24000) : fallback;

const baseUrl = (value) => cleanText(value).replace(/\/$/, "");
const restQueryValue = (value) => encodeURIComponent(String(value));
const imageProviderName = (env) => cleanText(env.IMAGE_PROVIDER, "openai").toLowerCase();
const creditSystemEnabled = (env) => cleanText(env.ENABLE_CREDIT_SYSTEM, "true") !== "false";
const manualCreditAdminEnabled = (env) => cleanText(env.ENABLE_MANUAL_CREDIT_ADMIN, "false") === "true";
const hasOpenAI = (env) => Boolean(cleanText(env.OPENAI_API_KEY));
const hasReplicate = (env) => Boolean(cleanText(env.REPLICATE_API_TOKEN));
const supabaseAuthKey = (env) => cleanText(env.SUPABASE_ANON_KEY) || cleanText(env.SUPABASE_SERVICE_ROLE_KEY);
const hasSupabase = (env) =>
  Boolean(cleanText(env.SUPABASE_URL) && cleanText(env.SUPABASE_SERVICE_ROLE_KEY) && supabaseAuthKey(env));

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
    throw new HttpError("Supabase nao esta configurado no backend.", 503);
  }

  const serviceRoleKey = cleanText(env.SUPABASE_SERVICE_ROLE_KEY);
  const key = options.serviceRole ? serviceRoleKey : supabaseAuthKey(env);
  if (!key) throw new HttpError("Chave Supabase ausente no backend.", 503);

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

const supabaseRawFetch = async (env, path, options = {}) => {
  const serviceRoleKey = cleanText(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!cleanText(env.SUPABASE_URL) || !serviceRoleKey) {
    throw new HttpError("Supabase Storage nao esta configurado no backend.", 503);
  }
  const response = await fetch(`${baseUrl(env.SUPABASE_URL)}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new HttpError(data?.message || "Erro ao salvar arquivo no Supabase Storage.", response.status, data);
  }
  return response;
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
  if (!token) throw new HttpError("Faca login para acessar seus dados.", 401);
  const user = await supabaseFetch(env, "/auth/v1/user", { token });
  if (!user?.id) throw new HttpError("Sessao expirada. Entre novamente.", 401);
  await ensureProfile(env, user);
  await ensureWallet(env, user.id);
  return { token, user };
};

const buildTattooPrompt = ({ answers = {}, reading = {} }) => {
  const profile = answers.profileGender || "perfil neutro";
  return [
    `Tattoo design for ${answers.bodyPlacement || "body placement"}, ${reading.idealStyle || "premium symbolic tattoo"}, ${answers.detailLevel || "medium detail"}, ${answers.colorPreference || "black and grey"}.`,
    `Visual body profile: ${profile}.`,
    `Central archetype: ${reading.dominantArchetype || "symbolic guardian"}.`,
    `Symbolic elements: ${reading.symbolExplanations?.join(", ") || answers.mustHaveSymbol || "custom symbolic elements"}.`,
    `Emotional meaning: ${reading.hiddenMeaning || "personal evolution, protection and transformation"}.`,
    `Atmosphere: ${answers.soulEnvironment || answers.energyScenario || "cinematic symbolic atmosphere"}.`,
    `Body flow: ${answers.bodyFlow || "anatomical organic flow"}.`,
    "Create a premium symbolic tattoo composition with strong silhouette, clean stencil readability, balanced negative space, anatomical flow, cinematic contrast, no text, no watermark, tattoo-ready linework.",
  ].join("\n");
};

const buildMockupPrompt = ({ answers = {}, reading = {} }) =>
  [
    `Create a realistic tattoo mockup of "${reading.tattooName || "Tattoo simbolica"}" applied to ${answers.bodyPlacement || "the selected body area"}.`,
    "The tattoo must follow anatomical muscle flow, natural skin curvature, realistic contrast, without deforming main symbols and without looking like a digital sticker.",
    `Style: ${reading.idealStyle || answers.visualStyle || "premium tattoo design"}.`,
    "No text, no watermark, no logo.",
  ].join("\n");

const buildStencilPrompt = ({ reading = {} }) =>
  [
    "Create a clean tattoo stencil version of this composition.",
    reading.imagePrompt || reading.professionalPrompt || reading.cinematicConcept || "",
    "High contrast black linework, simplified shading zones, clear hierarchy of main lines, preserved negative space, tattoo-ready, no text, no watermark, no logo.",
  ].join("\n");

const callOpenAIResponses = async (env, { answers, reading }) => {
  if (!hasOpenAI(env)) throw new HttpError("OPENAI_API_KEY nao esta configurada no backend.", 503);
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
            "Voce e um diretor criativo senior de tatuagem simbolica e SaaS premium. Responda somente JSON valido, sem markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Refine a leitura simbolica e gere conceito cinematografico, significado oculto, prompt de imagem, prompt de mockup, brief de stencil, relatorio premium e significados de simbolos. Nao coloque texto dentro da imagem; textos ficam no relatorio HTML/CSS.",
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
  if (!response.ok) throw new HttpError(payload?.error?.message || "Erro ao gerar texto na OpenAI.", response.status, payload);
  const text = extractResponseText(payload);
  if (!text) throw new HttpError("A OpenAI nao retornou texto para a leitura.", 502);
  return jsonFromText(text);
};

const callOpenAIImage = async (env, prompt) => {
  if (!hasOpenAI(env)) throw new HttpError("OPENAI_API_KEY nao esta configurada no backend.", 503);
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
  if (!response.ok) throw new HttpError(payload?.error?.message || "Erro ao gerar imagem na OpenAI.", response.status, payload);
  const imageBase64 = payload?.data?.[0]?.b64_json;
  if (!imageBase64) throw new HttpError("A OpenAI nao retornou imagem em base64.", 502, payload);
  return {
    imageUrl: `data:image/png;base64,${imageBase64}`,
    provider: "openai",
    model: imageModel,
  };
};

const callReplicateImage = async (env, prompt) => {
  if (!hasReplicate(env)) throw new HttpError("REPLICATE_API_TOKEN nao esta configurado no backend.", 503);
  const model = cleanText(env.REPLICATE_MODEL);
  if (!model) throw new HttpError("REPLICATE_MODEL nao esta configurado no backend.", 503);

  const endpoint = model.includes("/")
    ? `https://api.replicate.com/v1/models/${model}/predictions`
    : "https://api.replicate.com/v1/predictions";
  const body = model.includes("/") ? { input: { prompt } } : { version: model, input: { prompt } };
  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify(body),
  });
  let payload = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(payload?.detail || "Erro ao gerar imagem no Replicate.", response.status, payload);

  for (let attempt = 0; payload?.status && !["succeeded", "failed", "canceled"].includes(payload.status) && attempt < 24; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    response = await fetch(payload.urls?.get, {
      headers: { Authorization: `Bearer ${env.REPLICATE_API_TOKEN}` },
    });
    payload = await response.json().catch(() => null);
  }
  if (payload?.status !== "succeeded") throw new HttpError("Replicate nao concluiu a imagem.", 502, payload);
  const output = Array.isArray(payload.output) ? payload.output[0] : payload.output;
  if (!output) throw new HttpError("Replicate nao retornou URL de imagem.", 502, payload);
  return { imageUrl: output, provider: "replicate", model };
};

const fetchImageAsDataUrl = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new HttpError("Erro ao baixar imagem do provider.", response.status);
  const contentType = response.headers.get("Content-Type") || "image/png";
  const buffer = await response.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:${contentType};base64,${btoa(binary)}`;
};

const callPollinationsImage = async (_env, prompt) => {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1536&nologo=true&private=true`;
  return { imageUrl: await fetchImageAsDataUrl(url), provider: "pollinations", model: "pollinations" };
};

const generateImageWithProvider = async (env, prompt) => {
  const provider = imageProviderName(env);
  if (provider === "replicate") return callReplicateImage(env, prompt);
  if (provider === "pollinations") return callPollinationsImage(env, prompt);
  if (provider === "openai") return callOpenAIImage(env, prompt);
  throw new HttpError(`Provider de imagem nao suportado: ${provider}`, 400);
};

const dataUrlToBytes = (dataUrl) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { contentType: match[1], bytes };
};

const saveImageAsset = async (env, { userId, generationId, kind, imageUrl }) => {
  if (!imageUrl?.startsWith("data:")) return imageUrl;
  const parsed = dataUrlToBytes(imageUrl);
  if (!parsed) return imageUrl;
  const path = `${userId}/${generationId}/${kind}.png`;
  await supabaseRawFetch(env, `/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": parsed.contentType,
      "x-upsert": "true",
    },
    body: parsed.bytes,
  });
  return `${baseUrl(env.SUPABASE_URL)}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
};

const ensureProfile = async (env, user) => {
  if (!hasSupabase(env) || !user?.id) return null;
  const existing = await supabaseFetch(env, `/rest/v1/profiles?select=*&id=eq.${restQueryValue(user.id)}`, {
    serviceRole: true,
  }).catch(() => []);
  if (existing?.length) return existing[0];
  const rows = await supabaseFetch(env, "/rest/v1/profiles?select=*", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: {
      id: user.id,
      email: user.email || null,
      name: user.user_metadata?.name || null,
      role: user.app_metadata?.role || "user",
    },
  });
  return rows?.[0] || null;
};

const getUserRole = async (env, user) => {
  const appRole = user?.app_metadata?.role || user?.user_metadata?.role;
  if (appRole) return appRole;
  const rows = await supabaseFetch(env, `/rest/v1/profiles?select=role&id=eq.${restQueryValue(user.id)}`, {
    serviceRole: true,
  }).catch(() => []);
  return rows?.[0]?.role || "user";
};

const ensureWallet = async (env, userId) => {
  const rows = await supabaseFetch(env, `/rest/v1/credits_wallet?select=*&user_id=eq.${restQueryValue(userId)}`, {
    serviceRole: true,
  });
  if (rows.length) return rows[0];
  const created = await supabaseFetch(env, "/rest/v1/credits_wallet?select=*", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: { user_id: userId, balance: 0 },
  });
  return created[0];
};

const recordCreditTransaction = async (env, transaction) => {
  const rows = await supabaseFetch(env, "/rest/v1/credit_transactions?select=*", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: transaction,
  });
  return rows[0];
};

const changeCredits = async (env, { userId, amount, type, description, generationId = null, paymentId = null, metadata = {} }) => {
  const wallet = await ensureWallet(env, userId);
  const balanceBefore = Number(wallet.balance || 0);
  const balanceAfter = balanceBefore + amount;
  if (balanceAfter < 0) {
    throw new HttpError("Voce nao possui creditos suficientes para gerar esta imagem. Compre creditos para continuar.", 402, {
      balance: balanceBefore,
      required: Math.abs(amount),
    });
  }

  const updated = await supabaseFetch(
    env,
    `/rest/v1/credits_wallet?id=eq.${restQueryValue(wallet.id)}&balance=eq.${restQueryValue(balanceBefore)}&select=*`,
    {
      method: "PATCH",
      serviceRole: true,
      prefer: "return=representation",
      body: { balance: balanceAfter },
    },
  );
  if (!updated.length) throw new HttpError("Saldo alterado por outra operacao. Tente novamente.", 409);

  const transaction = await recordCreditTransaction(env, {
    user_id: userId,
    type,
    amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    description,
    generation_id: generationId,
    payment_id: paymentId,
    metadata,
  });

  return { balance: balanceAfter, balanceBefore, transaction };
};

const chargeCredits = async (env, { userId, action, generationId, description }) => {
  const cost = CREDIT_COSTS[action] || 0;
  if (!creditSystemEnabled(env) || cost <= 0) return { charged: false, cost: 0, balance: null };
  const result = await changeCredits(env, {
    userId,
    amount: -cost,
    type: "usage",
    description,
    generationId,
    metadata: { action },
  });
  return { charged: true, cost, balance: result.balance, transaction: result.transaction };
};

const refundCredits = async (env, { userId, amount, generationId, reason }) => {
  if (!creditSystemEnabled(env) || amount <= 0) return null;
  return changeCredits(env, {
    userId,
    amount,
    type: "refund",
    description: reason || "Estorno automatico por falha de geracao.",
    generationId,
    metadata: { automatic: true },
  });
};

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
  status: generation.status,
  generationType: generation.generation_type,
  tattooName: generation.tattoo_name || generation.symbolic_reading?.tattooName || generation.reading?.tattooName || "Tattoo simbolica",
  archetype: generation.archetype || generation.symbolic_reading?.dominantArchetype || generation.reading?.dominantArchetype || null,
  style: generation.style || generation.symbolic_reading?.idealStyle || generation.reading?.idealStyle || null,
  formData: generation.form_data || {},
  reading: generation.symbolic_reading || generation.reading || {},
  promptImage: generation.prompt_image || generation.prompt,
  promptMockup: generation.prompt_mockup,
  promptStencil: generation.prompt_stencil,
  prompt: generation.prompt || generation.prompt_image,
  imageUrl: generation.image_url,
  mockupUrl: generation.mockup_url,
  stencilUrl: generation.stencil_url,
  provider: generation.provider,
  model: generation.model,
  creditsUsed: generation.credits_used || 0,
  errorMessage: generation.error_message,
  createdAt: generation.created_at,
  updatedAt: generation.updated_at,
});

const createGeneration = async (env, { userId, generationType, answers, reading, prompts, provider, model }) => {
  const rows = await supabaseFetch(env, "/rest/v1/tattoo_generations?select=*", {
    method: "POST",
    serviceRole: true,
    prefer: "return=representation",
    body: {
      user_id: userId,
      status: "processing",
      generation_type: generationType,
      tattoo_name: reading?.tattooName || null,
      archetype: reading?.dominantArchetype || null,
      style: reading?.idealStyle || null,
      form_data: answers || {},
      symbolic_reading: reading || {},
      reading: reading || {},
      prompt_image: prompts?.image || null,
      prompt_mockup: prompts?.mockup || null,
      prompt_stencil: prompts?.stencil || null,
      prompt: prompts?.image || null,
      provider: provider || imageProviderName(env),
      model: model || null,
      credits_used: 0,
    },
  });
  return rows[0];
};

const updateGeneration = async (env, id, patch) => {
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_generations?id=eq.${restQueryValue(id)}&select=*`, {
    method: "PATCH",
    serviceRole: true,
    prefer: "return=representation",
    body: patch,
  });
  return rows[0];
};

const completeGeneration = async (env, generationId, { reading, prompts, imageUrl, mockupUrl, stencilUrl, provider, model, creditsUsed }) =>
  updateGeneration(env, generationId, {
    status: "completed",
    tattoo_name: reading?.tattooName || null,
    archetype: reading?.dominantArchetype || null,
    style: reading?.idealStyle || null,
    symbolic_reading: reading || {},
    reading: reading || {},
    prompt_image: prompts?.image || null,
    prompt_mockup: prompts?.mockup || null,
    prompt_stencil: prompts?.stencil || null,
    prompt: prompts?.image || null,
    image_url: imageUrl || null,
    mockup_url: mockupUrl || null,
    stencil_url: stencilUrl || null,
    provider,
    model,
    credits_used: creditsUsed || 0,
    error_message: null,
  });

const failGeneration = async (env, generationId, error, refunded = false) =>
  updateGeneration(env, generationId, {
    status: refunded ? "refunded" : "failed",
    error_message: error instanceof Error ? error.message : "Falha de geracao.",
  }).catch(() => null);

const handleHealth = (env) =>
  json({
    ok: true,
    runtime: "cloudflare-worker",
    provider: imageProviderName(env),
    openaiConfigured: hasOpenAI(env),
    replicateConfigured: hasReplicate(env),
    supabaseConfigured: hasSupabase(env),
    creditSystemEnabled: creditSystemEnabled(env),
    openai: hasOpenAI(env),
    supabase: hasSupabase(env),
  });

const handleRegister = async (request, env) => {
  const body = await readJson(request);
  const email = cleanText(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const name = cleanText(body.name);
  if (!email || password.length < 6) throw new HttpError("Informe e-mail e senha com no minimo 6 caracteres.", 400);
  const data = await supabaseFetch(env, "/auth/v1/signup", {
    method: "POST",
    body: { email, password, data: { name } },
  });
  if (data?.user?.id) {
    await ensureProfile(env, data.user).catch(() => null);
    await ensureWallet(env, data.user.id).catch(() => null);
  }
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
  if (data?.user?.id) {
    await ensureProfile(env, data.user).catch(() => null);
    await ensureWallet(env, data.user.id).catch(() => null);
  }
  return json({ ok: true, ...authPayload(data), message: "Login realizado." });
};

const handleRecover = async (request, env) => {
  const body = await readJson(request);
  const email = cleanText(body.email).toLowerCase();
  if (!email) throw new HttpError("Informe o e-mail da conta.", 400);
  await supabaseFetch(env, "/auth/v1/recover", { method: "POST", body: { email } });
  return json({ ok: true, message: "Se o e-mail existir, o Supabase enviara um link de recuperacao." });
};

const handleCreditBalance = async (request, env) => {
  const { user } = await requireUser(request, env);
  const wallet = await ensureWallet(env, user.id);
  return json({ ok: true, balance: Number(wallet.balance || 0), costs: CREDIT_COSTS });
};

const handleCreditCosts = async () => json({ ok: true, costs: CREDIT_COSTS });

const handleAdminAddCredits = async (request, env) => {
  if (!manualCreditAdminEnabled(env)) throw new HttpError("Admin manual de creditos desativado.", 403);
  const { user } = await requireUser(request, env);
  const role = await getUserRole(env, user);
  if (role !== "admin") throw new HttpError("Somente admin pode adicionar creditos.", 403);
  const body = await readJson(request);
  const targetUserId = cleanText(body.userId);
  const amount = Math.max(0, Math.floor(Number(body.amount) || 0));
  if (!targetUserId || amount <= 0) throw new HttpError("Informe userId e quantidade de creditos.", 400);
  await ensureWallet(env, targetUserId);
  const result = await changeCredits(env, {
    userId: targetUserId,
    amount,
    type: "admin_adjustment",
    description: cleanText(body.description, "Credito manual de administrador."),
    metadata: { adminUserId: user.id },
  });
  return json({ ok: true, balance: result.balance, transaction: result.transaction });
};

const handleGenerateConcept = async (request, env) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const answers = body.answers || {};
  const localReading = body.reading || {};
  let generation = null;
  let charge = null;
  try {
    generation = await createGeneration(env, {
      userId: user.id,
      generationType: GENERATION_TYPES.concept,
      answers,
      reading: localReading,
      prompts: {},
      provider: "openai",
      model: env.OPENAI_TEXT_MODEL || "gpt-5",
    });
    charge = await chargeCredits(env, {
      userId: user.id,
      action: "concept",
      generationId: generation.id,
      description: "Geracao de conceito simbolico.",
    });
    const reading = await callOpenAIResponses(env, { answers, reading: localReading });
    const prompts = {
      image: reading.imagePrompt || buildTattooPrompt({ answers, reading }),
      mockup: reading.mockupPrompt || buildMockupPrompt({ answers, reading }),
      stencil: reading.stencilPrompt || buildStencilPrompt({ reading }),
    };
    const completed = await completeGeneration(env, generation.id, {
      reading,
      prompts,
      provider: "openai",
      model: env.OPENAI_TEXT_MODEL || "gpt-5",
      creditsUsed: charge?.cost || 0,
    });
    return json({ ok: true, reading, imagePrompt: prompts.image, mockupPrompt: prompts.mockup, stencilPrompt: prompts.stencil, generation: normalizeGeneration(completed), credits: { balance: charge?.balance, used: charge?.cost || 0 } });
  } catch (error) {
    if (charge?.charged) await refundCredits(env, { userId: user.id, amount: charge.cost, generationId: generation?.id, reason: "Estorno por falha ao gerar conceito." });
    if (generation?.id) await failGeneration(env, generation.id, error, Boolean(charge?.charged));
    throw error;
  }
};

const handleImageAction = async (request, env, action) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const answers = body.answers || {};
  const reading = body.reading || {};
  const generationType = GENERATION_TYPES[action];
  const prompt =
    cleanLongText(body.prompt) ||
    (action === "mockup"
      ? reading.mockupPrompt || buildMockupPrompt({ answers, reading })
      : action === "stencil"
        ? reading.stencilPrompt || buildStencilPrompt({ reading })
        : reading.imagePrompt || body.imagePrompt || buildTattooPrompt({ answers, reading }));
  const prompts = {
    image: action === "tattooImage" ? prompt : reading.imagePrompt || buildTattooPrompt({ answers, reading }),
    mockup: action === "mockup" ? prompt : reading.mockupPrompt || buildMockupPrompt({ answers, reading }),
    stencil: action === "stencil" ? prompt : reading.stencilPrompt || buildStencilPrompt({ reading }),
  };
  let generation = null;
  let charge = null;
  try {
    generation = await createGeneration(env, {
      userId: user.id,
      generationType,
      answers,
      reading,
      prompts,
      provider: imageProviderName(env),
      model: env.OPENAI_IMAGE_MODEL || env.REPLICATE_MODEL || imageProviderName(env),
    });
    charge = await chargeCredits(env, {
      userId: user.id,
      action,
      generationId: generation.id,
      description: `Geracao premium: ${generationType}.`,
    });
    const image = await generateImageWithProvider(env, prompt);
    const assetKind = action === "mockup" ? "mockup" : action === "stencil" ? "stencil" : "image";
    const assetUrl = await saveImageAsset(env, { userId: user.id, generationId: generation.id, kind: assetKind, imageUrl: image.imageUrl });
    const completed = await completeGeneration(env, generation.id, {
      reading,
      prompts,
      imageUrl: action === "tattooImage" ? assetUrl : null,
      mockupUrl: action === "mockup" ? assetUrl : null,
      stencilUrl: action === "stencil" ? assetUrl : null,
      provider: image.provider,
      model: image.model,
      creditsUsed: charge?.cost || 0,
    });
    return json({
      ok: true,
      reading,
      imagePrompt: prompts.image,
      mockupPrompt: prompts.mockup,
      stencilPrompt: prompts.stencil,
      imageUrl: action === "tattooImage" ? assetUrl : undefined,
      mockupUrl: action === "mockup" ? assetUrl : undefined,
      stencilUrl: action === "stencil" ? assetUrl : undefined,
      generation: normalizeGeneration(completed),
      credits: { balance: charge?.balance, used: charge?.cost || 0 },
      models: { image: image.model, provider: image.provider },
    });
  } catch (error) {
    if (charge?.charged) await refundCredits(env, { userId: user.id, amount: charge.cost, generationId: generation?.id, reason: "Nao foi possivel gerar a imagem. Nenhum credito foi descontado." });
    if (generation?.id) await failGeneration(env, generation.id, error, Boolean(charge?.charged));
    throw error instanceof HttpError
      ? error
      : new HttpError("Nao foi possivel gerar a imagem agora. Nenhum credito foi descontado. Tente novamente.", 500);
  }
};

const handleGenerateFullPackage = async (request, env) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const answers = body.answers || {};
  const localReading = body.reading || {};
  let generation = null;
  let charge = null;
  try {
    generation = await createGeneration(env, {
      userId: user.id,
      generationType: GENERATION_TYPES.fullPackage,
      answers,
      reading: localReading,
      prompts: {},
      provider: imageProviderName(env),
      model: env.OPENAI_IMAGE_MODEL || env.REPLICATE_MODEL || imageProviderName(env),
    });
    charge = await chargeCredits(env, {
      userId: user.id,
      action: "fullPackage",
      generationId: generation.id,
      description: "Geracao de pacote completo premium.",
    });
    const reading = await callOpenAIResponses(env, { answers, reading: localReading });
    const prompts = {
      image: reading.imagePrompt || buildTattooPrompt({ answers, reading }),
      mockup: reading.mockupPrompt || buildMockupPrompt({ answers, reading }),
      stencil: reading.stencilPrompt || buildStencilPrompt({ reading }),
    };
    const mainImage = await generateImageWithProvider(env, prompts.image);
    const imageUrl = await saveImageAsset(env, { userId: user.id, generationId: generation.id, kind: "image", imageUrl: mainImage.imageUrl });
    const mockupImage = await generateImageWithProvider(env, prompts.mockup);
    const mockupUrl = await saveImageAsset(env, { userId: user.id, generationId: generation.id, kind: "mockup", imageUrl: mockupImage.imageUrl });
    const stencilImage = await generateImageWithProvider(env, prompts.stencil);
    const stencilUrl = await saveImageAsset(env, { userId: user.id, generationId: generation.id, kind: "stencil", imageUrl: stencilImage.imageUrl });
    const completed = await completeGeneration(env, generation.id, {
      reading,
      prompts,
      imageUrl,
      mockupUrl,
      stencilUrl,
      provider: mainImage.provider,
      model: mainImage.model,
      creditsUsed: charge?.cost || 0,
    });
    return json({
      ok: true,
      reading,
      imagePrompt: prompts.image,
      mockupPrompt: prompts.mockup,
      stencilPrompt: prompts.stencil,
      imageUrl,
      mockupUrl,
      stencilUrl,
      history: { saved: true, id: completed.id },
      generation: normalizeGeneration(completed),
      credits: { balance: charge?.balance, used: charge?.cost || 0 },
      models: { text: env.OPENAI_TEXT_MODEL || "gpt-5", image: mainImage.model, provider: mainImage.provider },
    });
  } catch (error) {
    if (charge?.charged) await refundCredits(env, { userId: user.id, amount: charge.cost, generationId: generation?.id, reason: "Estorno por falha no pacote completo." });
    if (generation?.id) await failGeneration(env, generation.id, error, Boolean(charge?.charged));
    throw error instanceof HttpError
      ? error
      : new HttpError("Nao foi possivel gerar a imagem agora. Nenhum credito foi descontado. Tente novamente.", 500);
  }
};

const handleListDrafts = async (request, env) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_drafts?select=*&user_id=eq.${restQueryValue(user.id)}&order=updated_at.desc`, { serviceRole: true });
  return json({ ok: true, drafts: rows.map(normalizeDraft) });
};

const handleGetDraft = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_drafts?select=*&id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}`, { serviceRole: true });
  if (!rows.length) throw new HttpError("Rascunho nao encontrado.", 404);
  return json({ ok: true, draft: normalizeDraft(rows[0]) });
};

const handleCreateDraft = async (request, env) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const reading = { ...(body.reading || {}), activeIndex: Number(body.activeIndex) || 0, completion: Math.max(0, Math.min(100, Number(body.completion) || 0)) };
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
    },
  });
  return json({ ok: true, draft: normalizeDraft(rows[0]) });
};

const handleUpdateDraft = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const body = await readJson(request);
  const reading = { ...(body.reading || {}), activeIndex: Number(body.activeIndex) || 0, completion: Math.max(0, Math.min(100, Number(body.completion) || 0)) };
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_drafts?id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}&select=*`, {
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
    },
  });
  if (!rows.length) throw new HttpError("Rascunho nao encontrado.", 404);
  return json({ ok: true, draft: normalizeDraft(rows[0]) });
};

const handleDeleteDraft = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_drafts?id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}&select=*`, {
    method: "DELETE",
    serviceRole: true,
    prefer: "return=representation",
  });
  if (!rows.length) throw new HttpError("Rascunho nao encontrado.", 404);
  return json({ ok: true, deleted: true, draft: normalizeDraft(rows[0]) });
};

const handleListGenerations = async (request, env) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_generations?select=*&user_id=eq.${restQueryValue(user.id)}&order=created_at.desc`, { serviceRole: true });
  return json({ ok: true, generations: rows.map(normalizeGeneration) });
};

const handleGetGeneration = async (request, env, id) => {
  const { user } = await requireUser(request, env);
  const rows = await supabaseFetch(env, `/rest/v1/tattoo_generations?select=*&id=eq.${restQueryValue(id)}&user_id=eq.${restQueryValue(user.id)}`, { serviceRole: true });
  if (!rows.length) throw new HttpError("Geracao nao encontrada.", 404);
  return json({ ok: true, generation: normalizeGeneration(rows[0]) });
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
      status: "completed",
      generation_type: cleanText(body.generationType, "concept"),
      tattoo_name: cleanText(body.tattooName, reading.tattooName || null),
      archetype: cleanText(body.archetype, reading.dominantArchetype || null),
      style: cleanText(body.style, reading.idealStyle || null),
      form_data: body.answers || {},
      symbolic_reading: reading,
      reading,
      prompt_image: cleanLongText(body.prompt, reading.imagePrompt || ""),
      prompt: cleanLongText(body.prompt, reading.imagePrompt || ""),
      image_url: cleanText(body.imageUrl, null),
      provider: cleanText(body.provider, null),
      model: cleanText(body.model, null),
      credits_used: 0,
    },
  });
  return json({ ok: true, generation: normalizeGeneration(rows[0]) });
};

const route = async (request, env) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const draftMatch = path.match(/^\/api\/drafts\/([^/]+)$/);
  const generationMatch = path.match(/^\/api\/generations\/([^/]+)$/);

  if (request.method === "GET" && path === "/api/health") return handleHealth(env);
  if (request.method === "GET" && path === "/api/credits/balance") return handleCreditBalance(request, env);
  if (request.method === "GET" && path === "/api/credits/costs") return handleCreditCosts();
  if (request.method === "POST" && path === "/api/admin/add-credits") return handleAdminAddCredits(request, env);

  if (request.method === "POST" && path === "/api/generate-concept") return handleGenerateConcept(request, env);
  if (request.method === "POST" && path === "/api/generate-tattoo-image") return handleImageAction(request, env, "tattooImage");
  if (request.method === "POST" && path === "/api/generate-mockup") return handleImageAction(request, env, "mockup");
  if (request.method === "POST" && path === "/api/generate-stencil") return handleImageAction(request, env, "stencil");
  if (request.method === "POST" && path === "/api/generate-tattoo") return handleGenerateFullPackage(request, env);

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
  if (request.method === "GET" && generationMatch) return handleGetGeneration(request, env, generationMatch[1]);

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
