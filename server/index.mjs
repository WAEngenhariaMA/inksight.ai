import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { generateImageWithProvider, imageProviderName } from "./providers/image/imageProvider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(rootDir, "public");
const generatedDir = path.join(publicDir, "generated");

dotenv.config({ path: path.join(rootDir, ".env") });

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "8mb" }));
app.use("/generated", express.static(generatedDir));

const jwtRole = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")).role || "unknown";
  } catch {
    return "unknown";
  }
};

const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseKeyRole = supabaseServiceRoleKey ? jwtRole(supabaseServiceRoleKey) : "";
const hasSupabaseAuth = Boolean(process.env.SUPABASE_URL && (supabaseAnonKey || supabaseServiceRoleKey));
const hasSupabase = Boolean(process.env.SUPABASE_URL && supabaseServiceRoleKey && hasSupabaseAuth);
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, supabaseServiceRoleKey)
  : null;
const supabaseAuth = hasSupabaseAuth
  ? createClient(process.env.SUPABASE_URL, supabaseAnonKey || supabaseServiceRoleKey)
  : null;
const hasOpenAIKey = () => Boolean(process.env.OPENAI_API_KEY?.trim());
const draftBucket = "tattoo-drafts";
const generationBucket = "tattoo-generations";
const creditSystemEnabled = () => process.env.ENABLE_CREDIT_SYSTEM !== "false";
const manualCreditAdminEnabled = () => process.env.ENABLE_MANUAL_CREDIT_ADMIN === "true";

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

const createUserSupabase = (token) =>
  createClient(process.env.SUPABASE_URL, supabaseAnonKey || supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

const requireSupabase = (response) => {
  if (supabase && supabaseAuth) return true;
  response.status(503).json({
    error:
      "Supabase nao esta configurado no backend. Confira SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY no .env.",
  });
  return false;
};

const cleanText = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : fallback;

const normalizeDraft = (draft) => ({
  id: draft.id,
  userId: draft.user_id,
  title: draft.title,
  userName: draft.user_name,
  profileGender: draft.profile_gender,
  answers: draft.answers || {},
  reading: draft.reading || {},
  activeIndex: draft.active_index || 0,
  completion: draft.completion || 0,
  createdAt: draft.created_at,
  updatedAt: draft.updated_at,
});

const normalizeGeneration = (generation) => ({
  id: generation.id,
  userId: generation.user_id,
  status: generation.status,
  generationType: generation.generation_type,
  tattooName: generation.tattoo_name || generation.symbolic_reading?.tattooName || generation.reading?.tattooName || "Tattoo simbólica",
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

const isMissingDraftTable = (error) =>
  error?.message?.includes("tattoo_drafts") || error?.code === "PGRST205";

const isDraftSetupError = (error) =>
  isMissingDraftTable(error) || error?.message?.includes("user_id") || error?.code === "PGRST204";

const missingDraftTableResponse = (response, payload = {}) =>
  response.json({
    ...payload,
    setupRequired: true,
    error:
      "A tabela tattoo_drafts ainda nao existe ou esta desatualizada no Supabase. Execute o SQL atualizado de supabase/schema.sql no SQL Editor do Supabase.",
  });

const authUserPayload = (data) => ({
  accessToken: data.session?.access_token,
  needsConfirmation: !data.session?.access_token,
  user: data.user
    ? {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || null,
      }
    : null,
});

const requireAuthUser = async (request, response) => {
  if (!requireSupabase(response)) return null;

  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    response.status(401).json({ error: "Faça login para acessar seus projetos." });
    return null;
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    response.status(401).json({ error: "Sessão expirada. Entre novamente." });
    return null;
  }

  await ensureProfile(data.user).catch(() => null);
  await ensureWallet(data.user.id).catch(() => null);

  return {
    db: createUserSupabase(token),
    user: data.user,
  };
};

const ensureDraftBucket = async () => {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (buckets?.some((bucket) => bucket.name === draftBucket)) return;

  const { error } = await supabase.storage.createBucket(draftBucket, { public: false });
  if (error && !error.message.toLowerCase().includes("already exists")) throw error;
};

const draftStoragePath = (clientId, draftId) => `${clientId}/${draftId}.json`;

const normalizeStorageDraft = (draft) => ({
  id: draft.id,
  title: draft.title,
  userName: draft.userName || null,
  profileGender: draft.profileGender || null,
  answers: draft.answers || {},
  reading: draft.reading || {},
  activeIndex: draft.activeIndex || 0,
  completion: draft.completion || 0,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
});

const readStorageDraft = async (clientId, draftId) => {
  await ensureDraftBucket();
  const { data, error } = await supabase.storage.from(draftBucket).download(draftStoragePath(clientId, draftId));
  if (error) throw error;
  return normalizeStorageDraft(JSON.parse(await data.text()));
};

const listStorageDrafts = async (clientId) => {
  await ensureDraftBucket();
  const { data, error } = await supabase.storage.from(draftBucket).list(clientId, {
    limit: 20,
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error) throw error;

  const drafts = await Promise.all(
    (data || [])
      .filter((item) => item.name.endsWith(".json"))
      .map(async (item) => readStorageDraft(clientId, item.name.replace(/\.json$/, ""))),
  );

  return drafts.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
};

const saveStorageDraft = async ({
  activeIndex,
  answers,
  clientId,
  completion,
  draftId,
  profileGender,
  reading,
  title,
  updatedAt,
  userName,
}) => {
  await ensureDraftBucket();
  const id = cleanText(draftId) || randomUUID();
  let createdAt = updatedAt;

  try {
    const current = await readStorageDraft(clientId, id);
    createdAt = current.createdAt || createdAt;
  } catch {
    createdAt = updatedAt;
  }

  const draft = normalizeStorageDraft({
    activeIndex,
    answers,
    completion,
    createdAt,
    id,
    profileGender,
    reading,
    title,
    updatedAt,
    userName,
  });

  const { error } = await supabase.storage
    .from(draftBucket)
    .upload(draftStoragePath(clientId, id), JSON.stringify(draft, null, 2), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw error;

  return draft;
};

const jsonFromText = (text) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
};

const ensureProfile = async (user) => {
  if (!supabase || !user?.id) return null;
  const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (existing) return existing;
  const { data } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email || null,
      name: user.user_metadata?.name || null,
      role: user.app_metadata?.role || "user",
    })
    .select("*")
    .single();
  return data || null;
};

const ensureWallet = async (userId) => {
  if (!supabase) throw new Error("Supabase nao esta configurado no backend.");
  const { data: existing, error: selectError } = await supabase
    .from("credits_wallet")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;
  const { data, error } = await supabase
    .from("credits_wallet")
    .insert({ user_id: userId, balance: 0 })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

const getUserRole = async (user) => {
  if (user?.app_metadata?.role || user?.user_metadata?.role) {
    return user.app_metadata?.role || user.user_metadata?.role;
  }
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role || "user";
};

const changeCredits = async ({ userId, amount, type, description, generationId = null, paymentId = null, metadata = {} }) => {
  const wallet = await ensureWallet(userId);
  const balanceBefore = Number(wallet.balance || 0);
  const balanceAfter = balanceBefore + amount;
  if (balanceAfter < 0) {
    const error = new Error("Você não possui créditos suficientes para gerar esta imagem. Compre créditos para continuar.");
    error.status = 402;
    throw error;
  }

  const { data: updated, error: updateError } = await supabase
    .from("credits_wallet")
    .update({ balance: balanceAfter })
    .eq("id", wallet.id)
    .eq("balance", balanceBefore)
    .select("*")
    .single();
  if (updateError || !updated) {
    throw updateError || new Error("Saldo alterado por outra operação. Tente novamente.");
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: userId,
      type,
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description,
      generation_id: generationId,
      payment_id: paymentId,
      metadata,
    })
    .select("*")
    .single();
  if (transactionError) throw transactionError;

  return { balance: balanceAfter, transaction };
};

const chargeCredits = async ({ userId, action, generationId, description }) => {
  const cost = CREDIT_COSTS[action] || 0;
  if (!creditSystemEnabled() || cost <= 0) return { charged: false, cost: 0, balance: null };
  const result = await changeCredits({
    userId,
    amount: -cost,
    type: "usage",
    description,
    generationId,
    metadata: { action },
  });
  return { charged: true, cost, balance: result.balance, transaction: result.transaction };
};

const refundCredits = async ({ userId, amount, generationId, reason }) => {
  if (!creditSystemEnabled() || amount <= 0) return null;
  return changeCredits({
    userId,
    amount,
    type: "refund",
    description: reason || "Estorno automático por falha de geração.",
    generationId,
    metadata: { automatic: true },
  });
};

const buildTattooPrompt = ({ answers, reading }) => {
  const profile = answers.profileGender || "perfil neutro";
  return [
    "Crie uma tatuagem simbólica premium, pronta para briefing de tatuador.",
    `Perfil visual corporal: ${profile}.`,
    `Nome/conceito: ${reading.tattooName}.`,
    `Arquétipo: ${reading.dominantArchetype}.`,
    `Estilo: ${reading.idealStyle}.`,
    `Composição corporal: ${reading.bodyComposition}.`,
    `Conceito: ${reading.cinematicConcept}.`,
    `Significado: ${reading.hiddenMeaning}.`,
    "A imagem deve ser uma arte de tattoo em fundo limpo escuro, sem texto, sem watermark, sem mockup de interface.",
    "Priorize silhouette forte, linework claro, sombras tatuáveis, contraste cinematográfico, anatomia e espaço negativo.",
  ].join("\n");
};

const buildMockupPrompt = ({ answers = {}, reading = {} }) =>
  [
    `Create a realistic tattoo mockup of "${reading.tattooName || "Tattoo simbólica"}" applied to ${answers.bodyPlacement || "the selected body area"}.`,
    "The tattoo must follow anatomical muscle flow, natural skin curvature, realistic black and grey contrast or selected color style, without deforming main symbols and without looking like a digital sticker.",
    "No text, no watermark, no logo.",
  ].join("\n");

const buildStencilPrompt = ({ reading = {} }) =>
  [
    "Create a clean tattoo stencil version of the composition.",
    reading.imagePrompt || reading.professionalPrompt || reading.cinematicConcept || "",
    "High contrast black linework, simplified shading areas, clear hierarchy of main lines, negative space preserved, tattoo-ready, no text, no watermark, no logo.",
  ].join("\n");

const callOpenAIReading = async ({ answers = {}, reading = {} }) => {
  if (!hasOpenAIKey()) {
    throw new Error("OPENAI_API_KEY nao esta configurada no backend.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-5";
  const conceptResponse = await openai.responses.create({
    model: textModel,
    input: [
      {
        role: "developer",
        content: "Voce e um diretor criativo de tatuagem simbolica. Responda somente JSON valido, sem markdown.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Aprimore a leitura, gere prompts finais para imagem, stencil, mockup corporal e relatorio premium. Nao gere texto dentro da imagem.",
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
  });

  return jsonFromText(conceptResponse.output_text);
};

const saveGeneratedImage = async (imageUrl, prefix = "tattoo") => {
  if (!imageUrl?.startsWith("data:")) return imageUrl;
  const match = imageUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return imageUrl;
  await fs.mkdir(generatedDir, { recursive: true });
  const fileName = `${prefix}-${Date.now()}-${randomUUID()}.png`;
  const filePath = path.join(generatedDir, fileName);
  await fs.writeFile(filePath, Buffer.from(match[1], "base64"));
  return `/generated/${fileName}`;
};

const createGenerationRecord = async ({ userId, generationType, answers, reading, prompts }) => {
  const { data, error } = await supabase
    .from("tattoo_generations")
    .insert({
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
      provider: imageProviderName(),
      model: process.env.OPENAI_IMAGE_MODEL || process.env.REPLICATE_MODEL || imageProviderName(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

const updateGenerationRecord = async (id, payload) => {
  const { data, error } = await supabase
    .from("tattoo_generations")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    runtime: "node-express-local",
    provider: imageProviderName(),
    openaiConfigured: hasOpenAIKey(),
    replicateConfigured: Boolean(process.env.REPLICATE_API_TOKEN?.trim()),
    supabaseConfigured: hasSupabase,
    creditSystemEnabled: creditSystemEnabled(),
    openai: hasOpenAIKey(),
    supabase: hasSupabase,
    supabaseRole: supabaseKeyRole || "missing",
  });
});

app.post("/api/auth/register", async (request, response) => {
  if (!requireSupabase(response)) return;

  const email = cleanText(request.body?.email).toLowerCase();
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const name = cleanText(request.body?.name, "");
  if (!email || password.length < 6) {
    return response.status(400).json({ error: "Informe e-mail e senha com no mínimo 6 caracteres." });
  }

  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });
  if (error) return response.status(400).json({ error: error.message });
  if (data.user?.id) {
    await ensureProfile(data.user).catch(() => null);
    await ensureWallet(data.user.id).catch(() => null);
  }

  response.json({
    ...authUserPayload(data),
    message: data.session?.access_token
      ? "Cadastro criado e acesso liberado."
      : "Cadastro criado. Confirme seu e-mail antes de entrar.",
  });
});

app.post("/api/auth/login", async (request, response) => {
  if (!requireSupabase(response)) return;

  const email = cleanText(request.body?.email).toLowerCase();
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!email || !password) {
    return response.status(400).json({ error: "Informe e-mail e senha." });
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error) return response.status(401).json({ error: error.message });
  if (data.user?.id) {
    await ensureProfile(data.user).catch(() => null);
    await ensureWallet(data.user.id).catch(() => null);
  }

  response.json({
    ...authUserPayload(data),
    message: "Login realizado.",
  });
});

app.post("/api/auth/recover", async (request, response) => {
  if (!requireSupabase(response)) return;

  const email = cleanText(request.body?.email).toLowerCase();
  if (!email) {
    return response.status(400).json({ error: "Informe o e-mail da conta." });
  }

  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email);
  if (error) return response.status(400).json({ error: error.message });

  response.json({ message: "Se o e-mail existir, o Supabase enviará um link de recuperação." });
});

app.get("/api/credits/costs", (_request, response) => {
  response.json({ ok: true, costs: CREDIT_COSTS });
});

app.get("/api/credits/balance", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;

  try {
    const wallet = await ensureWallet(auth.user.id);
    response.json({ ok: true, balance: Number(wallet.balance || 0), costs: CREDIT_COSTS });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Erro ao carregar saldo." });
  }
});

app.post("/api/admin/add-credits", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  if (!manualCreditAdminEnabled()) {
    return response.status(403).json({ error: "Admin manual de creditos desativado." });
  }

  try {
    const role = await getUserRole(auth.user);
    if (role !== "admin") {
      return response.status(403).json({ error: "Somente admin pode adicionar creditos." });
    }

    const userId = cleanText(request.body?.userId);
    const amount = Math.max(0, Math.floor(Number(request.body?.amount) || 0));
    if (!userId || amount <= 0) {
      return response.status(400).json({ error: "Informe userId e quantidade de creditos." });
    }

    await ensureWallet(userId);
    const result = await changeCredits({
      userId,
      amount,
      type: "admin_adjustment",
      description: cleanText(request.body?.description, "Credito manual de administrador."),
      metadata: { adminUserId: auth.user.id },
    });
    response.json({ ok: true, balance: result.balance, transaction: result.transaction });
  } catch (error) {
    response.status(error.status || 500).json({ error: error instanceof Error ? error.message : "Erro ao adicionar creditos." });
  }
});

app.get("/api/drafts", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { db, user } = auth;

  const { data, error } = await db
    .from("tattoo_drafts")
    .select("id,user_id,title,user_name,profile_gender,answers,reading,active_index,completion,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isDraftSetupError(error)) {
      if (supabaseKeyRole !== "service_role") return missingDraftTableResponse(response, { drafts: [] });
      const drafts = await listStorageDrafts(user.id);
      return response.json({ drafts, storageFallback: true });
    }
    return response.status(500).json({ error: error.message });
  }

  response.json({ drafts: data.map(normalizeDraft) });
});

app.get("/api/drafts/:id", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { db, user } = auth;

  const draftId = cleanText(request.params.id);
  if (!draftId) {
    return response.status(400).json({ error: "Id do rascunho e obrigatorio." });
  }

  const { data, error } = await db
    .from("tattoo_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .single();

  if (error) {
    if (isDraftSetupError(error)) {
      if (supabaseKeyRole !== "service_role") return missingDraftTableResponse(response, { draft: null });
      try {
        const draft = await readStorageDraft(user.id, draftId);
        return response.json({ draft, storageFallback: true });
      } catch (storageError) {
        return response.status(404).json({
          error: storageError instanceof Error ? storageError.message : "Rascunho nao encontrado.",
        });
      }
    }
    return response.status(404).json({ error: error.message });
  }

  response.json({ draft: normalizeDraft(data) });
});

app.post("/api/drafts", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { db, user } = auth;

  const {
    draftId,
    title,
    answers = {},
    reading = {},
    activeIndex = 0,
    completion = 0,
  } = request.body ?? {};

  const payload = {
    client_id: user.id,
    user_id: user.id,
    title: cleanText(title, "Rascunho sem nome"),
    user_name: cleanText(answers.identityName, user.user_metadata?.name || user.email || null),
    profile_gender: cleanText(answers.profileGender, null),
    answers,
    reading,
    active_index: Number(activeIndex) || 0,
    completion: Math.max(0, Math.min(100, Number(completion) || 0)),
    updated_at: new Date().toISOString(),
  };

  const query = draftId
    ? db
        .from("tattoo_drafts")
        .update(payload)
        .eq("id", cleanText(draftId))
        .eq("user_id", user.id)
        .select("*")
        .single()
    : db.from("tattoo_drafts").insert(payload).select("*").single();

  const { data, error } = await query;
  if (error) {
    if (isDraftSetupError(error)) {
      if (supabaseKeyRole !== "service_role") return missingDraftTableResponse(response);
      const draft = await saveStorageDraft({
        activeIndex: payload.active_index,
        answers,
        clientId: user.id,
        completion: payload.completion,
        draftId,
        profileGender: payload.profile_gender,
        reading,
        title: payload.title,
        updatedAt: payload.updated_at,
        userName: payload.user_name,
      });
      return response.json({ draft, storageFallback: true });
    }
    return response.status(500).json({ error: error.message });
  }

  response.json({ draft: normalizeDraft(data) });
});

app.put("/api/drafts/:id", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { db, user } = auth;
  const draftId = cleanText(request.params.id);
  if (!draftId) {
    return response.status(400).json({ error: "Id do rascunho e obrigatorio." });
  }

  const {
    title,
    answers = {},
    reading = {},
    activeIndex = 0,
    completion = 0,
  } = request.body ?? {};

  const payload = {
    client_id: user.id,
    user_id: user.id,
    title: cleanText(title, "Rascunho sem nome"),
    user_name: cleanText(answers.identityName, user.user_metadata?.name || user.email || null),
    profile_gender: cleanText(answers.profileGender, null),
    answers,
    reading,
    active_index: Number(activeIndex) || 0,
    completion: Math.max(0, Math.min(100, Number(completion) || 0)),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("tattoo_drafts")
    .update(payload)
    .eq("id", draftId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    if (isDraftSetupError(error)) {
      if (supabaseKeyRole !== "service_role") return missingDraftTableResponse(response);
      const draft = await saveStorageDraft({
        activeIndex: payload.active_index,
        answers,
        clientId: user.id,
        completion: payload.completion,
        draftId,
        profileGender: payload.profile_gender,
        reading,
        title: payload.title,
        updatedAt: payload.updated_at,
        userName: payload.user_name,
      });
      return response.json({ draft, storageFallback: true });
    }
    return response.status(500).json({ error: error.message });
  }

  response.json({ draft: normalizeDraft(data) });
});

app.delete("/api/drafts/:id", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { db, user } = auth;
  const draftId = cleanText(request.params.id);
  if (!draftId) {
    return response.status(400).json({ error: "Id do rascunho e obrigatorio." });
  }

  const { data, error } = await db
    .from("tattoo_drafts")
    .delete()
    .eq("id", draftId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) {
    if (isDraftSetupError(error)) {
      if (supabaseKeyRole !== "service_role") return missingDraftTableResponse(response);
      await supabase.storage.from(draftBucket).remove([draftStoragePath(user.id, draftId)]).catch(() => null);
      return response.json({ deleted: true, storageFallback: true });
    }
    return response.status(404).json({ error: error.message });
  }

  response.json({ deleted: true, draft: normalizeDraft(data) });
});

app.post("/api/generate-concept", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;

  const { answers = {}, reading = {} } = request.body ?? {};
  let generation;
  let charge;

  try {
    generation = await createGenerationRecord({
      userId: auth.user.id,
      generationType: GENERATION_TYPES.concept,
      answers,
      reading,
      prompts: {},
    });
    charge = await chargeCredits({
      userId: auth.user.id,
      action: "concept",
      generationId: generation.id,
      description: "Geração de conceito simbólico.",
    });

    const aiReading = await callOpenAIReading({ answers, reading });
    const prompts = {
      image: aiReading.imagePrompt || buildTattooPrompt({ answers, reading: aiReading }),
      mockup: aiReading.mockupPrompt || buildMockupPrompt({ answers, reading: aiReading }),
      stencil: aiReading.stencilPrompt || buildStencilPrompt({ reading: aiReading }),
    };
    const completed = await updateGenerationRecord(generation.id, {
      status: "completed",
      tattoo_name: aiReading.tattooName || null,
      archetype: aiReading.dominantArchetype || null,
      style: aiReading.idealStyle || null,
      symbolic_reading: aiReading,
      reading: aiReading,
      prompt_image: prompts.image,
      prompt_mockup: prompts.mockup,
      prompt_stencil: prompts.stencil,
      prompt: prompts.image,
      provider: "openai",
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5",
      credits_used: charge?.cost || 0,
    });

    response.json({
      ok: true,
      reading: aiReading,
      imagePrompt: prompts.image,
      mockupPrompt: prompts.mockup,
      stencilPrompt: prompts.stencil,
      generation: normalizeGeneration(completed),
      credits: { balance: charge?.balance, used: charge?.cost || 0 },
    });
  } catch (error) {
    if (charge?.charged) {
      await refundCredits({
        userId: auth.user.id,
        amount: charge.cost,
        generationId: generation?.id,
        reason: "Estorno por falha ao gerar conceito.",
      }).catch(() => null);
    }
    if (generation?.id) {
      await updateGenerationRecord(generation.id, {
        status: charge?.charged ? "refunded" : "failed",
        error_message: error instanceof Error ? error.message : "Erro ao gerar conceito.",
      }).catch(() => null);
    }
    response.status(error.status || 500).json({ error: error instanceof Error ? error.message : "Erro ao gerar conceito." });
  }
});

const runImageGeneration = async (request, response, action) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;

  const { answers = {}, reading = {}, prompt } = request.body ?? {};
  const generationType = GENERATION_TYPES[action];
  const finalPrompt =
    cleanText(prompt, "") ||
    (action === "mockup"
      ? reading.mockupPrompt || buildMockupPrompt({ answers, reading })
      : action === "stencil"
        ? reading.stencilPrompt || buildStencilPrompt({ reading })
        : reading.imagePrompt || buildTattooPrompt({ answers, reading }));
  const prompts = {
    image: action === "tattooImage" ? finalPrompt : reading.imagePrompt || buildTattooPrompt({ answers, reading }),
    mockup: action === "mockup" ? finalPrompt : reading.mockupPrompt || buildMockupPrompt({ answers, reading }),
    stencil: action === "stencil" ? finalPrompt : reading.stencilPrompt || buildStencilPrompt({ reading }),
  };
  let generation;
  let charge;

  try {
    generation = await createGenerationRecord({
      userId: auth.user.id,
      generationType,
      answers,
      reading,
      prompts,
    });
    charge = await chargeCredits({
      userId: auth.user.id,
      action,
      generationId: generation.id,
      description: `Geração premium: ${generationType}.`,
    });

    const generated = await generateImageWithProvider(finalPrompt);
    const assetKind = action === "mockup" ? "mockup" : action === "stencil" ? "stencil" : "tattoo";
    const assetUrl = await saveGeneratedImage(generated.imageUrl, assetKind);
    const completed = await updateGenerationRecord(generation.id, {
      status: "completed",
      image_url: action === "tattooImage" ? assetUrl : null,
      mockup_url: action === "mockup" ? assetUrl : null,
      stencil_url: action === "stencil" ? assetUrl : null,
      provider: generated.provider,
      model: generated.model,
      credits_used: charge?.cost || 0,
      error_message: null,
    });

    response.json({
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
      models: { provider: generated.provider, image: generated.model },
    });
  } catch (error) {
    if (charge?.charged) {
      await refundCredits({
        userId: auth.user.id,
        amount: charge.cost,
        generationId: generation?.id,
        reason: "Não foi possível gerar a imagem. Nenhum crédito foi descontado.",
      }).catch(() => null);
    }
    if (generation?.id) {
      await updateGenerationRecord(generation.id, {
        status: charge?.charged ? "refunded" : "failed",
        error_message: error instanceof Error ? error.message : "Erro ao gerar imagem.",
      }).catch(() => null);
    }
    response.status(error.status || 500).json({
      error: error instanceof Error ? error.message : "Não foi possível gerar a imagem agora. Nenhum crédito foi descontado. Tente novamente.",
    });
  }
};

app.post("/api/generate-tattoo-image", (request, response) => runImageGeneration(request, response, "tattooImage"));
app.post("/api/generate-mockup", (request, response) => runImageGeneration(request, response, "mockup"));
app.post("/api/generate-stencil", (request, response) => runImageGeneration(request, response, "stencil"));

app.post("/api/generate-tattoo", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;

  const { answers = {}, reading = {} } = request.body ?? {};
  let generation;
  let charge;

  try {
    generation = await createGenerationRecord({
      userId: auth.user.id,
      generationType: GENERATION_TYPES.fullPackage,
      answers,
      reading,
      prompts: {},
    });
    charge = await chargeCredits({
      userId: auth.user.id,
      action: "fullPackage",
      generationId: generation.id,
      description: "Geração de pacote completo premium.",
    });

    const aiReading = await callOpenAIReading({ answers, reading });
    const prompts = {
      image: aiReading.imagePrompt || buildTattooPrompt({ answers, reading: aiReading }),
      mockup: aiReading.mockupPrompt || buildMockupPrompt({ answers, reading: aiReading }),
      stencil: aiReading.stencilPrompt || buildStencilPrompt({ reading: aiReading }),
    };
    const image = await generateImageWithProvider(prompts.image);
    const imageUrl = await saveGeneratedImage(image.imageUrl, "tattoo");
    const mockup = await generateImageWithProvider(prompts.mockup);
    const mockupUrl = await saveGeneratedImage(mockup.imageUrl, "mockup");
    const stencil = await generateImageWithProvider(prompts.stencil);
    const stencilUrl = await saveGeneratedImage(stencil.imageUrl, "stencil");
    const completed = await updateGenerationRecord(generation.id, {
      status: "completed",
      tattoo_name: aiReading.tattooName || null,
      archetype: aiReading.dominantArchetype || null,
      style: aiReading.idealStyle || null,
      symbolic_reading: aiReading,
      reading: aiReading,
      prompt_image: prompts.image,
      prompt_mockup: prompts.mockup,
      prompt_stencil: prompts.stencil,
      prompt: prompts.image,
      image_url: imageUrl,
      mockup_url: mockupUrl,
      stencil_url: stencilUrl,
      provider: image.provider,
      model: image.model,
      credits_used: charge?.cost || 0,
      error_message: null,
    });

    response.json({
      ok: true,
      reading: aiReading,
      imagePrompt: prompts.image,
      mockupPrompt: prompts.mockup,
      stencilPrompt: prompts.stencil,
      imageUrl,
      mockupUrl,
      stencilUrl,
      history: { saved: true, id: completed.id },
      generation: normalizeGeneration(completed),
      credits: { balance: charge?.balance, used: charge?.cost || 0 },
      models: { text: process.env.OPENAI_TEXT_MODEL || "gpt-5", image: image.model, provider: image.provider },
    });
  } catch (error) {
    if (charge?.charged) {
      await refundCredits({
        userId: auth.user.id,
        amount: charge.cost,
        generationId: generation?.id,
        reason: "Estorno por falha no pacote completo.",
      }).catch(() => null);
    }
    if (generation?.id) {
      await updateGenerationRecord(generation.id, {
        status: charge?.charged ? "refunded" : "failed",
        error_message: error instanceof Error ? error.message : "Erro ao gerar pacote completo.",
      }).catch(() => null);
    }
    response.status(error.status || 500).json({
      error: error instanceof Error ? error.message : "Não foi possível gerar a imagem agora. Nenhum crédito foi descontado. Tente novamente.",
    });
  }
});

app.get("/api/generations", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { user } = auth;

  try {
    const { data, error } = await supabase
      .from("tattoo_generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    response.json({ ok: true, generations: (data || []).map(normalizeGeneration) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Erro ao carregar historico." });
  }
});

app.get("/api/generations/:id", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { user } = auth;
  const generationId = cleanText(request.params.id);

  try {
    const { data, error } = await supabase
      .from("tattoo_generations")
      .select("*")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();
    if (error) throw error;
    response.json({ ok: true, generation: normalizeGeneration(data) });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Geracao nao encontrada." });
  }
});

app.post("/api/generations", async (request, response) => {
  const auth = await requireAuthUser(request, response);
  if (!auth) return;
  const { user } = auth;
  const { answers = {}, reading = {}, prompt, imageUrl, provider, model, generationType = "concept" } = request.body ?? {};

  try {
    const { data, error } = await supabase
      .from("tattoo_generations")
      .insert({
        user_id: user.id,
        status: "completed",
        generation_type: cleanText(generationType, "concept"),
        tattoo_name: cleanText(reading.tattooName, null),
        archetype: cleanText(reading.dominantArchetype, null),
        style: cleanText(reading.idealStyle, null),
        form_data: answers,
        symbolic_reading: reading,
        reading,
        prompt_image: cleanText(prompt, reading.imagePrompt || null),
        prompt: cleanText(prompt, reading.imagePrompt || null),
        image_url: cleanText(imageUrl, null),
        provider: cleanText(provider, null),
        model: cleanText(model, null),
        credits_used: 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    response.json({ ok: true, generation: normalizeGeneration(data) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Erro ao salvar geracao." });
  }
});

app.use("/api", (error, _request, response, _next) => {
  response.status(500).json({
    error: error instanceof Error ? error.message : "Erro interno na API.",
  });
});

app.use(express.static(distDir));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Tattoo AI API running at http://127.0.0.1:${port}`);
});
