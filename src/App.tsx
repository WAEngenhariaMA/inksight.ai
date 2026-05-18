import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FolderOpen,
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

const AUTH_SESSION_KEY = "tattoo-ai-auth-session";
const CURRENT_DRAFT_ID_KEY = "tattoo-ai-current-draft-id";
const LOCAL_DRAFT_KEY = "tattoo-ai-draft";

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

const authHeaders = (session: AuthSession | null): Record<string, string> =>
  session ? { Authorization: `Bearer ${session.accessToken}` } : {};

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
  const [generationError, setGenerationError] = useState("");
  const [aiResult, setAiResult] = useState<AiGenerationResult | null>(null);

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
      const response = await fetch("/api/drafts", {
        headers: authHeaders(session),
      });
      const payload = (await response.json()) as { drafts?: DraftSummary[]; error?: string; setupRequired?: boolean };
      if (response.status === 401) {
        logout();
        throw new Error(payload.error || "Sessão expirada. Entre novamente.");
      }
      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar os rascunhos.");
      }
      if (payload.setupRequired && payload.error) {
        setDraftError(payload.error);
      }
      setDrafts(payload.drafts ?? []);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Erro ao carregar rascunhos.");
    } finally {
      setDraftLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session && view === "start") {
      void refreshDrafts();
    }
  }, [refreshDrafts, session, view]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const endpoint =
        authMode === "register" ? "/api/auth/register" : authMode === "recover" ? "/api/auth/recover" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail,
          name: authName,
          password: authPassword,
        }),
      });
      const payload = (await response.json()) as {
        accessToken?: string;
        error?: string;
        message?: string;
        needsConfirmation?: boolean;
        user?: AuthSession["user"];
      };

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível concluir o acesso.");
      }

      if (payload.accessToken && payload.user) {
        applySession({ accessToken: payload.accessToken, user: payload.user });
        return;
      }

      setAuthMessage(
        payload.message ||
          (payload.needsConfirmation
            ? "Cadastro criado. Confirme seu e-mail antes de entrar."
            : "Solicitação enviada."),
      );
      if (authMode === "register") {
        setAuthMode("login");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Erro de autenticação.");
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
      const response = await fetch(`/api/drafts/${draft.id}`, {
        headers: authHeaders(session),
      });
      const payload = (await response.json()) as { draft?: DraftSummary; error?: string };
      if (!response.ok || !payload.draft) {
        setDraftError(payload.error || "Não foi possível abrir o rascunho.");
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
      const response = await fetch("/api/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(session),
        },
        body: JSON.stringify({
          activeIndex,
          answers: values,
          completion: reading.completion,
          draftId: currentDraftId,
          reading,
          title: buildDraftTitle(values, reading),
        }),
      });
      const payload = (await response.json()) as { draft?: DraftSummary; error?: string };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Não foi possível salvar o rascunho.");
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

  const generateConcept = async () => {
    setGenerating(true);
    setGenerationError("");
    setStatus("Gerando conceito e imagem com OpenAI");

    try {
      const healthResponse = await fetch("/api/health");
      const health = (await healthResponse.json()) as { openai?: boolean };
      if (!health.openai) {
        throw new Error(
          "A IA está conectada, mas falta configurar a chave OPENAI_API_KEY no backend. Crie o arquivo .env com sua chave e reinicie o servidor.",
        );
      }

      const response = await fetch("/api/generate-tattoo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: values, reading: localReading }),
      });
      const payload = (await response.json()) as AiGenerationResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível gerar a tattoo.");
      }

      setAiResult(payload);
      setActiveDeliverable("image");
      setPackageGenerated(true);
      setStatus(payload.history?.saved ? "Imagem IA gerada e histórico salvo" : "Imagem IA gerada");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao gerar imagem.";
      setGenerationError(message);
      setStatus("Geração pausada");
    } finally {
      setGenerating(false);
    }
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
          deliverable={selectedDeliverable}
          generationError={generationError || draftError}
          generating={generating}
          onCopyDeliverable={copyDeliverable}
          onCopyPrompt={copyPrompt}
          onDownloadDeliverable={downloadDeliverable}
          onGenerate={generateConcept}
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
