import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

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
const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;
const supabaseKeyRole = supabaseKey
  ? jwtRole(supabaseKey)
  : "";
const hasSupabase = Boolean(process.env.SUPABASE_URL && supabaseKey);
const supabase = hasSupabase
  ? createClient(process.env.SUPABASE_URL, supabaseKey)
  : null;
const supabaseAuth = process.env.SUPABASE_URL && (supabaseAnonKey || supabaseKey)
  ? createClient(process.env.SUPABASE_URL, supabaseAnonKey || supabaseKey)
  : null;
const hasOpenAIKey = () => Boolean(process.env.OPENAI_API_KEY?.trim());
const draftBucket = "tattoo-drafts";

const createUserSupabase = (token) =>
  createClient(process.env.SUPABASE_URL, supabaseAnonKey || supabaseKey, {
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
      "Supabase nao esta configurado no backend. Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY no .env.",
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

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
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

app.post("/api/generate-tattoo", async (request, response) => {
  try {
    if (!hasOpenAIKey()) {
      return response.status(503).json({
        error:
          "A IA está conectada, mas falta configurar a chave OPENAI_API_KEY no backend. Crie o arquivo .env com sua chave e reinicie o servidor.",
      });
    }

    const { answers = {}, reading = {} } = request.body ?? {};
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-5";
    const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
    const imageSize = process.env.OPENAI_IMAGE_SIZE || "1024x1536";

    const conceptResponse = await openai.responses.create({
      model: textModel,
      input: [
        {
          role: "developer",
          content:
            "Você é um diretor criativo de tatuagem simbólica. Responda somente JSON válido, sem markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Aprimore a leitura, gere prompts finais para imagem, stencil e mockup corporal. Considere perfil masculino/feminino no fluxo anatômico e na linguagem visual.",
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
              symbolExplanations: ["string"],
            },
          }),
        },
      ],
    });

    const aiReading = jsonFromText(conceptResponse.output_text);
    const imagePrompt = aiReading.imagePrompt || buildTattooPrompt({ answers, reading: aiReading });

    const imageResponse = await openai.images.generate({
      model: imageModel,
      prompt: imagePrompt,
      size: imageSize,
      quality: "high",
      background: "opaque",
      output_format: "png",
    });

    const imageBase64 = imageResponse.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error("A OpenAI não retornou imagem em base64.");
    }

    await fs.mkdir(generatedDir, { recursive: true });
    const fileName = `tattoo-${Date.now()}.png`;
    const filePath = path.join(generatedDir, fileName);
    await fs.writeFile(filePath, Buffer.from(imageBase64, "base64"));
    const imageUrl = `/generated/${fileName}`;

    let history = { saved: false };
    if (supabase) {
      const { data, error } = await supabase
        .from("tattoo_generations")
        .insert({
          user_name: answers.identityName || null,
          profile_gender: answers.profileGender || null,
          answers,
          reading: aiReading,
          prompt: imagePrompt,
          image_url: imageUrl,
          assets: {
            imageModel,
            textModel,
            size: imageSize,
            stencilPrompt: aiReading.stencilPrompt,
            mockupPrompt: aiReading.mockupPrompt,
          },
        })
        .select("id")
        .single();

      history = error ? { saved: false, error: error.message } : { saved: true, id: data.id };
    }

    response.json({
      reading: aiReading,
      imagePrompt,
      imageUrl,
      history,
      models: { text: textModel, image: imageModel },
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Erro desconhecido ao gerar tattoo.",
    });
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
