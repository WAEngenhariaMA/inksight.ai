import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Coins,
  FolderOpen,
  History,
  HelpCircle,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  PlusCircle,
  RefreshCw,
  Save,
  UserPlus,
} from "lucide-react";
import { FormModule } from "./components/FormModule";
import { ModuleRail } from "./components/ModuleRail";
import { BrandSigil } from "./components/Ornaments";
import { PreviewPanel } from "./components/PreviewPanel";
import { FormValue, formModules } from "./data/formSchema";
import { ApiError, apiFetch } from "./lib/api";
import {
  AiGenerationResult,
  createPremiumDeliverables,
  createSymbolicReading,
  DeliverableKey,
  FormState,
  mergeAiReading,
  SymbolicReading,
} from "./lib/symbolicEngine";

type AppView = "auth" | "start" | "form";
type AuthMode = "login" | "register" | "recover";

interface AuthSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

interface DraftSummary {
  id: string;
  title: string;
  userName?: string | null;
  profileGender?: string | null;
  answers: FormState;
  activeIndex: number;
  completion: number;
  updatedAt: string;
}

type GenerationAction = "concept" | "image" | "mockup" | "stencil" | "fullPackage";

interface CreditCosts {
  concept: number;
  tattooImage: number;
  mockup: number;
  stencil: number;
  report: number;
  fullPackage: number;
}

interface GenerationSummary {
  id: string;
  status: string;
  generationType: string;
  tattooName?: string;
  archetype?: string | null;
  style?: string | null;
  imageUrl?: string | null;
  mockupUrl?: string | null;
  stencilUrl?: string | null;
  provider?: string | null;
  model?: string | null;
  creditsUsed?: number;
  createdAt: string;
}

const AUTH_SESSION_KEY = "tattoo-ai-auth-session";
const CURRENT_DRAFT_ID_KEY = "tattoo-ai-current-draft-id";
const LOCAL_DRAFT_KEY = "tattoo-ai-draft";
const DEFAULT_CREDIT_COSTS: CreditCosts = {
  concept: 1,
  tattooImage: 5,
  mockup: 5,
  stencil: 4,
  report: 2,
  fullPackage: 12,
};

const generationActionConfig: Record<
  GenerationAction,
  {
    endpoint: string;
    deliverable: DeliverableKey;
    loading: string;
    success: string;
    promptKind?: "image" | "mockup" | "stencil";
  }
> = {
  concept: {
    endpoint: "/api/generate-concept",
    deliverable: "report",
    loading: "Gerando conceito premium com IA",
    success: "Conceito premium gerado e salvo no histórico",
  },
  image: {
    endpoint: "/api/generate-tattoo-image",
    deliverable: "image",
    loading: "Gerando sua tattoo simbólica com IA. Isso pode levar alguns segundos.",
    success: "Imagem principal gerada e salva no histórico",
    promptKind: "image",
  },
  mockup: {
    endpoint: "/api/generate-mockup",
    deliverable: "mockup",
    loading: "Gerando mockup corporal realista",
    success: "Mockup corporal gerado e salvo no histórico",
    promptKind: "mockup",
  },
  stencil: {
    endpoint: "/api/generate-stencil",
    deliverable: "stencil",
    loading: "Gerando stencil tattoo-ready",
    success: "Stencil gerado e salvo no histórico",
    promptKind: "stencil",
  },
  fullPackage: {
    endpoint: "/api/generate-tattoo",
    deliverable: "image",
    loading: "Gerando pacote completo premium",
    success: "Pacote completo gerado e salvo no histórico",
  },
};

const readAuthSession = (): AuthSession | null => {
  try {
    const stored = localStorage.getItem(AUTH_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const readLocalDraft = (): FormState => {
  try {
    const draft = localStorage.getItem(LOCAL_DRAFT_KEY);
    return draft ? JSON.parse(draft) : {};
  } catch {
    return {};
  }
};

const buildDraftTitle = (values: FormState, reading: SymbolicReading) => {
  const identityName = typeof values.identityName === "string" ? values.identityName.trim() : "";
  const base = identityName || (reading.tattooName !== "Em leitura" ? reading.tattooName : "Rascunho simbólico");
  return `${base} - ${new Date().toLocaleDateString("pt-BR")}`;
};

const formatDraftDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

const formatGenerationDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

const authHeaders = (session: AuthSession | null): Record<string, string> =>
  session ? { Authorization: `Bearer ${session.accessToken}` } : {};

const mergeGenerationResult = (
  current: AiGenerationResult | null,
  next: AiGenerationResult,
): AiGenerationResult => ({
  ...current,
  ...next,
  imageUrl: next.imageUrl || current?.imageUrl,
  mockupUrl: next.mockupUrl || current?.mockupUrl,
  stencilUrl: next.stencilUrl || current?.stencilUrl,
  imagePrompt: next.imagePrompt || current?.imagePrompt,
  mockupPrompt: next.mockupPrompt || current?.mockupPrompt,
  stencilPrompt: next.stencilPrompt || current?.stencilPrompt,
  reading: {
    ...(current?.reading || {}),
    ...(next.reading || {}),
  },
  models: {
    ...(current?.models || {}),
    ...(next.models || {}),
  },
});

export function App() {
  const [session, setSession] = useState<AuthSession | null>(readAuthSession);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [view, setView] = useState<AppView>(() => (readAuthSession() ? "start" : "auth"));
  const [activeIndex, setActiveIndex] = useState(0);
  const [values, setValues] = useState<FormState>(readLocalDraft);
  const [currentDraftId, setCurrentDraftId] = useState(() => localStorage.getItem(CURRENT_DRAFT_ID_KEY));
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [copied, setCopied] = useState(false);
  const [packageGenerated, setPackageGenerated] = useState(false);
  const [activeDeliverable, setActiveDeliverable] = useState<DeliverableKey>("image");
  const [status, setStatus] = useState("Sistema pronto");
  const [generating, setGenerating] = useState(false);
  const [generationAction, setGenerationAction] = useState<GenerationAction | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [aiResult, setAiResult] = useState<AiGenerationResult | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditCosts, setCreditCosts] = useState<CreditCosts>(DEFAULT_CREDIT_COSTS);
  const [creditLoading, setCreditLoading] = useState(false);
  const [generations, setGenerations] = useState<GenerationSummary[]>([]);
  const [generationsLoading, setGenerationsLoading] = useState(false);

  const activeModule = formModules[activeIndex];
  const localReading = useMemo(() => createSymbolicReading(values), [values]);
  const reading = useMemo(() => mergeAiReading(localReading, aiResult), [localReading, aiResult]);
  const deliverables = useMemo(() => createPremiumDeliverables(reading, aiResult), [reading, aiResult]);
  const selectedDeliverable =
    deliverables.find((deliverable) => deliverable.key === activeDeliverable) ?? deliverables[0];

  const applySession = (nextSession: AuthSession) => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setView("start");
    setAuthError("");
    setAuthMessage("Acesso liberado.");
  };

  const resetProjectState = () => {
    setValues({});
    setActiveIndex(0);
    setCurrentDraftId(null);
    setAiResult(null);
    setPackageGenerated(false);
    setGenerationError("");
    localStorage.removeItem(CURRENT_DRAFT_ID_KEY);
    localStorage.removeItem(LOCAL_DRAFT_KEY);
  };

  const logout = () => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    resetProjectState();
    setSession(null);
    setDrafts([]);
    setGenerations([]);
    setCreditBalance(null);
    setDraftError("");
    setAuthPassword("");
    setStatus("Sessão encerrada");
    setView("auth");
  };

  const refreshDrafts = useCallback(async () => {
    if (!session) {
      setDrafts([]);
      return;
    }

    setDraftLoading(true);
    setDraftError("");

    try {
      const payload = await apiFetch<{ drafts?: DraftSummary[]; error?: string; setupRequired?: boolean }>("/api/drafts", {
        headers: authHeaders(session),
      });
      if (payload.setupRequired && payload.error) {
        setDraftError(payload.error);
      }
      setDrafts(payload.drafts ?? []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
      setDraftError(error instanceof Error ? error.message : "Erro ao carregar rascunhos.");
    } finally {
      setDraftLoading(false);
    }
  }, [session]);

  const refreshCredits = useCallback(async () => {
    if (!session) {
      setCreditBalance(null);
      return;
    }

    setCreditLoading(true);

    try {
      const payload = await apiFetch<{ balance?: number; costs?: Partial<CreditCosts> }>("/api/credits/balance", {
        headers: authHeaders(session),
      });
      setCreditBalance(typeof payload.balance === "number" ? payload.balance : 0);
      setCreditCosts({ ...DEFAULT_CREDIT_COSTS, ...(payload.costs || {}) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      } else {
        setCreditBalance(null);
      }
    } finally {
      setCreditLoading(false);
    }
  }, [session]);

  const refreshGenerations = useCallback(async () => {
    if (!session) {
      setGenerations([]);
      return;
    }

    setGenerationsLoading(true);

    try {
      const payload = await apiFetch<{ generations?: GenerationSummary[] }>("/api/generations", {
        headers: authHeaders(session),
      });
      setGenerations(payload.generations ?? []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      } else {
        setGenerations([]);
      }
    } finally {
      setGenerationsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session && view === "start") {
      void refreshDrafts();
    }
  }, [refreshDrafts, session, view]);

  useEffect(() => {
    if (session) {
      void refreshCredits();
      void refreshGenerations();
    }
  }, [refreshCredits, refreshGenerations, session]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const endpoint =
        authMode === "register" ? "/api/auth/register" : authMode === "recover" ? "/api/auth/recover" : "/api/auth/login";
      const payload = await apiFetch<{
        accessToken?: string;
        error?: string;
        message?: string;
        needsConfirmation?: boolean;
        user?: AuthSession["user"];
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({
          email: authEmail,
          name: authName,
          password: authPassword,
        }),
      });

      if (payload.accessToken && payload.user) {
        applySession({ accessToken: payload.accessToken, user: payload.user });
        return;
      }

      setAuthMessage(
        payload.message ||
          (payload.needsConfirmation
            ? "Cadastro criado. Confirme seu e-mail antes de entrar."
            : "Solicitacao enviada."),
      );
      if (authMode === "register") {
        setAuthMode("login");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Erro de autenticacao.");
    } finally {
      setAuthLoading(false);
    }
  };

  const startNewDraft = () => {
    resetProjectState();
    setStatus("Novo projeto iniciado");
    setView("form");
  };

  const openDraft = async (draft: DraftSummary) => {
    if (!session) {
      setView("auth");
      return;
    }

    let loadedDraft = draft;

    if (!draft.answers || !Object.keys(draft.answers).length) {
      const payload = await apiFetch<{ draft?: DraftSummary; error?: string }>(`/api/drafts/${draft.id}`, {
        headers: authHeaders(session),
      });
      if (!payload.draft) {
        setDraftError(payload.error || "Nao foi possivel abrir o rascunho.");
        return;
      }
      loadedDraft = payload.draft;
    }

    setValues(loadedDraft.answers || {});
    setActiveIndex(Math.min(formModules.length - 1, loadedDraft.activeIndex || 0));
    setCurrentDraftId(loadedDraft.id);
    setAiResult(null);
    setPackageGenerated(false);
    setGenerationError("");
    localStorage.setItem(CURRENT_DRAFT_ID_KEY, loadedDraft.id);
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(loadedDraft.answers || {}));
    setStatus("Rascunho carregado do Supabase");
    setView("form");
  };

  const updateField = (fieldId: string, value: FormValue) => {
    setValues((current) => {
      const next = { ...current, [fieldId]: value };
      localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(next));
      return next;
    });
    setStatus("Leitura atualizada");
    setGenerationError("");
    setPackageGenerated(false);
  };

  const saveDraft = async () => {
    if (!session) {
      setView("auth");
      return;
    }

    setDraftSaving(true);
    setDraftError("");
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(values));

    try {
      const path = currentDraftId ? `/api/drafts/${currentDraftId}` : "/api/drafts";
      const method = currentDraftId ? "PUT" : "POST";
      const payload = await apiFetch<{ draft?: DraftSummary; error?: string }>(path, {
        method,
        headers: authHeaders(session),
        body: JSON.stringify({
          activeIndex,
          answers: values,
          completion: reading.completion,
          reading,
          title: buildDraftTitle(values, reading),
        }),
      });

      if (!payload.draft) {
        throw new Error(payload.error || "Nao foi possivel salvar o rascunho.");
      }

      setCurrentDraftId(payload.draft.id);
      localStorage.setItem(CURRENT_DRAFT_ID_KEY, payload.draft.id);
      setStatus("Rascunho salvo no Supabase");
      await refreshDrafts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar rascunho.";
      setDraftError(message);
      setStatus("Falha ao salvar rascunho");
    } finally {
      setDraftSaving(false);
    }
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(aiResult?.imagePrompt || reading.professionalPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const promptForAction = (action: GenerationAction) => {
    if (action === "mockup") {
      return aiResult?.mockupPrompt || aiResult?.reading?.mockupPrompt || "";
    }
    if (action === "stencil") {
      return aiResult?.stencilPrompt || aiResult?.reading?.stencilPrompt || "";
    }
    if (action === "image") {
      return aiResult?.imagePrompt || reading.professionalPrompt;
    }
    return "";
  };

  const runGeneration = async (action: GenerationAction) => {
    if (!session) {
      setView("auth");
      return;
    }

    const config = generationActionConfig[action];
    setGenerating(true);
    setGenerationAction(action);
    setGenerationError("");
    setStatus(config.loading);

    try {
      const health = await apiFetch<{
        openai?: boolean;
        openaiConfigured?: boolean;
        supabaseConfigured?: boolean;
      }>("/api/health");
      if ((action === "concept" || action === "fullPackage") && !health.openai && !health.openaiConfigured) {
        throw new Error(
          "A IA esta conectada, mas falta configurar a chave OPENAI_API_KEY no backend.",
        );
      }

      const payload = await apiFetch<AiGenerationResult & { error?: string; ok?: boolean }>(config.endpoint, {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify({
          answers: values,
          reading: action === "concept" || action === "fullPackage" ? localReading : reading,
          prompt: config.promptKind ? promptForAction(action) : undefined,
          userId: session.user.id,
        }),
      });

      setAiResult((current) => mergeGenerationResult(current, payload));
      setActiveDeliverable(config.deliverable);
      setPackageGenerated(true);
      if (typeof payload.credits?.balance === "number") {
        setCreditBalance(payload.credits.balance);
      }
      setStatus(payload.history?.saved || payload.generation?.id ? config.success : "Geração concluída");
      await Promise.all([refreshCredits(), refreshGenerations()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao gerar imagem.";
      setGenerationError(message);
      setStatus("Geracao pausada");
    } finally {
      setGenerating(false);
      setGenerationAction(null);
    }
  };

  const generateConcept = () => runGeneration("concept");
  const generateTattooImage = () => runGeneration("image");
  const generateMockup = () => runGeneration("mockup");
  const generateStencil = () => runGeneration("stencil");
  const generateFullPackage = () => runGeneration("fullPackage");

  const buyCredits = () => {
    setGenerationError(
      "Compra de créditos ainda está em preparação. Nesta fase, o administrador pode adicionar créditos pela rota /api/admin/add-credits ou direto no Supabase.",
    );
    setStatus("Compra de créditos em preparação");
  };

  const selectDeliverable = (key: DeliverableKey) => {
    setActiveDeliverable(key);
    setPackageGenerated(true);
    setStatus(`${deliverables.find((item) => item.key === key)?.title ?? "Entregável"} selecionado`);
  };

  const copyDeliverable = async () => {
    if (!packageGenerated) return;
    await navigator.clipboard.writeText(selectedDeliverable.content);
    setCopied(true);
    setStatus(`${selectedDeliverable.title} copiado`);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadDeliverable = async () => {
    if (!packageGenerated) return;

    if (selectedDeliverable.key === "report") {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ format: "a4", unit: "pt" });
      const margin = 44;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Tattoo AI Simbolica", margin, y);
      y += 24;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      selectedDeliverable.content.split("\n").forEach((line) => {
        const wrapped = doc.splitTextToSize(line || " ", maxWidth) as string[];
        wrapped.forEach((textLine) => {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(textLine, margin, y);
          y += 14;
        });
      });

      doc.save("tattoo-ai-relatorio-premium.pdf");
      setStatus(`${selectedDeliverable.title} baixado`);
      return;
    }

    const blob = new Blob([selectedDeliverable.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tattoo-ai-${selectedDeliverable.fileName}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`${selectedDeliverable.title} baixado`);
  };

  const goNext = () => {
    if (activeIndex === formModules.length - 1) {
      void generateConcept();
      return;
    }
    setActiveIndex((index) => Math.min(formModules.length - 1, index + 1));
  };

  const header = (
    <header className="app-header">
      <div className="brand-lockup">
        <div className="brand-sigil">
          <BrandSigil />
        </div>
        <div>
          <strong>Tattoo AI Simbólica</strong>
          <span>Sua história. Seu símbolo. Sua marca.</span>
        </div>
      </div>

      {session ? (
        <div className="header-actions">
          {view === "form" ? (
            <>
              <button className="header-link" type="button">
                <HelpCircle size={19} />
                Ajuda
              </button>
              <button className="header-link" disabled={draftSaving} onClick={saveDraft} type="button">
                <Save size={19} />
                {draftSaving ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button className="button button--primary header-next" onClick={goNext} type="button">
                Próximo passo
                <ArrowRight size={20} />
              </button>
            </>
          ) : null}
          <span className="credit-chip">
            <Coins size={15} />
            {creditLoading ? "Créditos..." : `${creditBalance ?? 0} créditos`}
          </span>
          <span className="user-chip">{session.user.email}</span>
          <button className="header-link header-link--logout" onClick={logout} type="button">
            <LogOut size={18} />
            Sair
          </button>
        </div>
      ) : null}
    </header>
  );

  if (view === "auth") {
    const isLogin = authMode === "login";
    const isRegister = authMode === "register";
    const isRecover = authMode === "recover";

    return (
      <div className="app-shell app-shell--auth">
        {header}
        <main className="auth-surface">
          <section className="auth-hero">
            <span className="module-counter">Acesso privado</span>
            <h1>Entre para salvar sua jornada simbólica</h1>
            <p>
              Cada conta carrega apenas os próprios projetos, rascunhos e históricos. Antes de criar ou carregar uma
              leitura, faça login ou cadastre um novo acesso.
            </p>
          </section>

          <section className="auth-card">
            <div className="auth-card__head">
              <h2>{isRegister ? "Criar cadastro" : isRecover ? "Recuperar senha" : "Entrar no sistema"}</h2>
              <p>{isRecover ? "Receba um link de redefinição no seu e-mail." : "Use e-mail e senha para continuar."}</p>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Modo de acesso">
              <button className={isLogin ? "auth-tab auth-tab--active" : "auth-tab"} onClick={() => setAuthMode("login")} type="button">
                <LogIn size={16} />
                Entrar
              </button>
              <button
                className={isRegister ? "auth-tab auth-tab--active" : "auth-tab"}
                onClick={() => setAuthMode("register")}
                type="button"
              >
                <UserPlus size={16} />
                Cadastrar
              </button>
            </div>

            <form className="auth-form" onSubmit={submitAuth}>
              {isRegister ? (
                <label>
                  <span>Nome</span>
                  <input
                    autoComplete="name"
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder="Seu nome"
                    type="text"
                    value={authName}
                  />
                </label>
              ) : null}

              <label>
                <span>E-mail de login</span>
                <input
                  autoComplete="email"
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="voce@email.com"
                  required
                  type="email"
                  value={authEmail}
                />
              </label>

              {!isRecover ? (
                <label>
                  <span>Senha</span>
                  <input
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    minLength={6}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    type="password"
                    value={authPassword}
                  />
                </label>
              ) : null}

              {authError ? <div className="generation-error">{authError}</div> : null}
              {authMessage ? <div className="auth-message">{authMessage}</div> : null}

              <button className="button button--primary button--wide" disabled={authLoading} type="submit">
                {isRecover ? <Mail size={18} /> : isRegister ? <UserPlus size={18} /> : <KeyRound size={18} />}
                {authLoading ? "Processando..." : isRecover ? "Enviar recuperação" : isRegister ? "Criar login" : "Entrar"}
              </button>
            </form>

            <div className="auth-switch">
              {!isRecover ? (
                <button onClick={() => setAuthMode("recover")} type="button">
                  Esqueci minha senha
                </button>
              ) : (
                <button onClick={() => setAuthMode("login")} type="button">
                  Voltar para entrar
                </button>
              )}
            </div>
          </section>
        </main>

        <div className="status-toast" aria-live="polite">
          {status}
        </div>
      </div>
    );
  }

  if (view === "start") {
    return (
      <div className="app-shell app-shell--start">
        {header}
        <main className="start-surface">
          <section className="start-hero">
            <span className="module-counter">Entrada do sistema</span>
            <h1>Escolha sua jornada simbólica</h1>
            <p>
              Comece um novo formulário ou carregue um rascunho salvo no Supabase para continuar de onde parou.
            </p>
            <div className="start-actions">
              <button className="button button--primary" onClick={startNewDraft} type="button">
                <PlusCircle size={19} />
                Criar novo projeto
              </button>
              <button className="button button--ghost" disabled={draftLoading} onClick={refreshDrafts} type="button">
                <RefreshCw size={18} />
                Atualizar salvos
              </button>
            </div>
          </section>

          <section className="draft-panel">
            <div className="draft-panel__head">
              <div>
                <h2>Rascunhos salvos</h2>
                <p>Projetos vinculados ao seu login.</p>
              </div>
              <FolderOpen size={28} />
            </div>

            {draftError ? <div className="generation-error">{draftError}</div> : null}
            {draftLoading ? <p className="draft-empty">Buscando seus rascunhos no Supabase...</p> : null}
            {!draftError && !draftLoading && !drafts.length ? (
              <p className="draft-empty">Nenhum rascunho salvo nesta conta. Crie um projeto e use Salvar rascunho.</p>
            ) : null}

            <div className="draft-list">
              {drafts.map((draft) => (
                <button className="draft-card" key={draft.id} onClick={() => void openDraft(draft)} type="button">
                  <span>{draft.completion}% preenchido</span>
                  <strong>{draft.title}</strong>
                  <small>
                    {draft.profileGender || "Perfil em aberto"} · atualizado em {formatDraftDate(draft.updatedAt)}
                  </small>
                </button>
              ))}
            </div>

            <div className="wallet-summary">
              <div>
                <span>Carteira de créditos</span>
                <strong>{creditLoading ? "Carregando..." : `${creditBalance ?? 0} créditos disponíveis`}</strong>
              </div>
              <Coins size={24} />
            </div>

            <div className="generation-history-block">
              <div className="draft-panel__head draft-panel__head--compact">
                <div>
                  <h2>Histórico de gerações</h2>
                  <p>Conceitos, imagens, mockups e stencils gerados nesta conta.</p>
                </div>
                <History size={24} />
              </div>

              {generationsLoading ? <p className="draft-empty">Carregando histórico...</p> : null}
              {!generationsLoading && !generations.length ? (
                <p className="draft-empty">Nenhuma geração premium salva ainda.</p>
              ) : null}

              <div className="generation-history-list">
                {generations.slice(0, 6).map((generation) => {
                  const image = generation.imageUrl || generation.mockupUrl || generation.stencilUrl;
                  return (
                    <article className="generation-history-card" key={generation.id}>
                      {image ? <img src={image} alt={generation.tattooName || "Geração de tattoo"} /> : <Coins size={20} />}
                      <div>
                        <span>
                          {generation.generationType} · {generation.status}
                        </span>
                        <strong>{generation.tattooName || "Tattoo simbólica"}</strong>
                        <small>
                          {generation.provider || "provider"} · {generation.creditsUsed || 0} créditos ·{" "}
                          {formatGenerationDate(generation.createdAt)}
                        </small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </main>

        <div className="status-toast" aria-live="polite">
          {status}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {header}

      <div className="main-grid">
        <ModuleRail activeIndex={activeIndex} onSelect={setActiveIndex} values={values} />

        <FormModule
          activeIndex={activeIndex}
          module={activeModule}
          onBack={() => setActiveIndex((index) => Math.max(0, index - 1))}
          onNext={goNext}
          onUpdate={updateField}
          totalModules={formModules.length}
          values={values}
        />

        <PreviewPanel
          answers={values}
          activeDeliverable={activeDeliverable}
          aiResult={aiResult}
          copied={copied}
          creditBalance={creditBalance}
          creditCosts={creditCosts}
          creditLoading={creditLoading}
          deliverable={selectedDeliverable}
          generationAction={generationAction}
          generationError={generationError || draftError}
          generating={generating}
          onBuyCredits={buyCredits}
          onCopyDeliverable={copyDeliverable}
          onCopyPrompt={copyPrompt}
          onDownloadDeliverable={downloadDeliverable}
          onGenerateConcept={generateConcept}
          onGenerateFullPackage={generateFullPackage}
          onGenerateImage={generateTattooImage}
          onGenerateMockup={generateMockup}
          onGenerateStencil={generateStencil}
          onSelectDeliverable={selectDeliverable}
          packageGenerated={packageGenerated}
          reading={reading}
        />
      </div>

      <div className="status-toast" aria-live="polite">
        {status}
      </div>
    </div>
  );
}
