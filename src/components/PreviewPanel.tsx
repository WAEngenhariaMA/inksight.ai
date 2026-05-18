import {
  Clipboard,
  Download,
  FileText,
  Image,
  Layers3,
  PenTool,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  AiGenerationResult,
  DeliverableKey,
  FormState,
  PremiumDeliverable,
  SymbolicReading,
} from "../lib/symbolicEngine";
import { DecorativeRule, OracleEye } from "./Ornaments";
import { ORACLE_ARTWORK_URL } from "../config/visualAssets";

interface PreviewPanelProps {
  answers: FormState;
  activeDeliverable: DeliverableKey;
  reading: SymbolicReading;
  deliverable: PremiumDeliverable;
  packageGenerated: boolean;
  copied: boolean;
  generating: boolean;
  generationError: string;
  aiResult: AiGenerationResult | null;
  onCopyPrompt: () => void;
  onCopyDeliverable: () => void;
  onDownloadDeliverable: () => void;
  onGenerate: () => void;
  onSelectDeliverable: (key: DeliverableKey) => void;
}

export function PreviewPanel({
  answers,
  activeDeliverable,
  reading,
  deliverable,
  packageGenerated,
  copied,
  generating,
  generationError,
  aiResult,
  onCopyPrompt,
  onCopyDeliverable,
  onDownloadDeliverable,
  onGenerate,
  onSelectDeliverable,
}: PreviewPanelProps) {
  const deliveryItems = [
    { key: "image" as const, label: "Prompt detalhado", short: "Imagem IA", icon: Image },
    { key: "stencil" as const, label: "Stencil line art", short: "Stencil", icon: PenTool },
    { key: "mockup" as const, label: "Mockup no corpo", short: "Mockup", icon: Layers3 },
    { key: "report" as const, label: "Relatório em PDF", short: "PDF", icon: FileText },
  ];

  const synthesis = [
    ["Nome da tatuagem", reading.tattooName],
    ["Conceito cinematográfico", reading.cinematicConcept],
    ["Arquétipo central", reading.dominantArchetype],
    ["Estilo visual", reading.idealStyle],
    ["Composição no corpo", reading.bodyComposition],
  ];

  const liveAspects = buildLiveAspects(answers, reading);

  return (
    <aside className="preview-panel">
      <header className="preview-intro">
        <h2>Leitura simbólica ao vivo</h2>
        <p>Sua prévia simbólica será construída à medida que você responde.</p>
      </header>

      <div className="oracle-stage">
        {aiResult?.imageUrl ? (
          <img src={aiResult.imageUrl} alt={`Imagem gerada para ${reading.tattooName}`} />
        ) : ORACLE_ARTWORK_URL ? (
          <img src={ORACLE_ARTWORK_URL} alt="Arte simbólica do oráculo" />
        ) : (
          <OracleEye />
        )}
      </div>

      <DecorativeRule />

      <section className="synthesis">
        <h3>Síntese atual</h3>
        <p>{liveAspects.intro}</p>
        <div className="live-summary">
          <strong>Resumo da pessoa</strong>
          <p>{liveAspects.summary}</p>
          <div>
            {liveAspects.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <div className="synthesis-list">
          {synthesis.map(([label, value]) => (
            <article key={label}>
              <Sparkles size={18} />
              <span>{label}</span>
              <strong>{value && value !== "Em leitura" ? value : "—"}</strong>
            </article>
          ))}
        </div>
      </section>

      <DecorativeRule />

      <section className="future-generations">
        <h3>Gerações futuras</h3>
        <p>Após concluir todos os módulos, vamos gerar para você:</p>
        <div className="delivery-grid">
          {deliveryItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`delivery-item ${activeDeliverable === item.key ? "delivery-item--active" : ""}`}
                key={item.key}
                onClick={() => onSelectDeliverable(item.key)}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="preview-footer">
        <div className="completion-ring" aria-label={`${reading.completion}% preenchido`}>
          {reading.completion}%
        </div>
        <p>
          {aiResult?.imageUrl
            ? "Imagem gerada e pacote premium pronto."
            : "Complete os módulos para liberar todas as gerações."}
        </p>
      </div>

      <button className="button button--primary button--wide" disabled={generating} onClick={onGenerate} type="button">
        <Wand2 size={18} />
        {generating ? "Gerando com OpenAI..." : "Gerar imagem com IA"}
      </button>

      {generationError ? <div className="generation-error">{generationError}</div> : null}

      {packageGenerated ? (
        <section className="deliverable-output deliverable-output--ready">
          <div className="deliverable-output__head">
            <div>
              <span>Pacote gerado</span>
              <h3>{deliverable.title}</h3>
              <p>{deliverable.subtitle}</p>
            </div>
            <div className="deliverable-output__actions">
              <button className="icon-button" onClick={onCopyPrompt} title="Copiar prompt de imagem" type="button">
                <Clipboard size={17} />
              </button>
              <button className="icon-button" onClick={onCopyDeliverable} title="Copiar entregável" type="button">
                <Clipboard size={17} />
              </button>
              <button className="icon-button" onClick={onDownloadDeliverable} title="Baixar arquivo" type="button">
                <Download size={17} />
              </button>
            </div>
          </div>
          <pre>{deliverable.content}</pre>
          {copied ? <span className="copy-status">Copiado</span> : null}
        </section>
      ) : null}
    </aside>
  );
}

const asText = (value: FormState[string]) => (typeof value === "string" ? value : "");
const asList = (value: FormState[string]) => (Array.isArray(value) ? value : []);

function buildLiveAspects(answers: FormState, reading: SymbolicReading) {
  const profile = asText(answers.profileGender);
  const element = asText(answers.element);
  const phrase = asText(answers.essencePhrase);
  const traits = asList(answers.traits);
  const perceived = asList(answers.perceivedEnergy);
  const animals = asList(answers.animals);
  const styles = asList(answers.visualStyle);
  const placement = asText(answers.bodyPlacement);
  const size = asText(answers.tattooSize);
  const sacred = asList(answers.sacredSymbols);
  const shadows = asList(answers.shadowToTransform);
  const phase = asText(answers.lifePhase);
  const drive = asText(answers.drive);
  const fear = asText(answers.fear);
  const archetype = reading.dominantArchetype !== "Em leitura" ? reading.dominantArchetype : "";
  const tattooName = reading.tattooName !== "Em leitura" ? reading.tattooName : "";

  const elementMeaning: Record<string, string> = {
    Fogo: "O fogo coloca movimento, coragem e presença de transformação na composição.",
    Terra: "A terra puxa a leitura para estabilidade, proteção, raiz e força construída.",
    Ar: "O ar abre uma assinatura mental, estratégica e livre, com linhas mais leves e direcionais.",
    Água: "A água traz profundidade emocional, memória, cura e fluxo mais intuitivo.",
    Éter: "O éter eleva a leitura para mistério, espiritualidade e símbolos cósmicos.",
  };

  const profileMeaning: Record<string, string> = {
    Masculino: "O perfil visual masculino pede linhas mais estruturadas, peso e presença corporal.",
    Feminino: "O perfil visual feminino pede fluidez, elegância, curvas naturais e contraste delicado com poder.",
    "Neutro / andrógino": "O perfil neutro/andrógino equilibra simetria, versatilidade e força sem marcação rígida.",
  };

  const sentences = [
    profile && profileMeaning[profile],
    element && elementMeaning[element],
    traits.length &&
      `A personalidade aparece como ${traits.slice(0, 4).join(", ").toLowerCase()}, criando uma energia interna que mistura postura, sombra e intenção.`,
    perceived.length &&
      `A presença que os outros sentem tende a ser ${perceived.slice(0, 3).join(", ").toLowerCase()}, então a tattoo precisa comunicar isso antes mesmo de explicar.`,
    animals.length &&
      `O totem principal em leitura é ${animals[0].toLowerCase()}, usado como instinto, proteção e símbolo central.`,
    sacred.length &&
      `Os símbolos sagrados escolhidos, como ${sacred.slice(0, 2).join(" e ").toLowerCase()}, entram como camada mística e assinatura visual.`,
    styles.length &&
      `A estética caminha para ${styles.slice(0, 3).join(", ").toLowerCase()}, com leitura mais fiel ao gosto visual escolhido.`,
    placement &&
      `No corpo, a composição começa a se orientar para ${placement.toLowerCase()}${size ? ` em tamanho ${size.toLowerCase()}` : ""}.`,
    phase &&
      `A fase atual indica ${phase.toLowerCase()}, então o conceito deve parecer uma marca de ciclo, não apenas decoração.`,
    drive && `O que move essa pessoa é ${drive.toLowerCase()}, força que guia o significado oculto da peça.`,
    fear &&
      `A sombra emocional passa pelo medo de ${fear.toLowerCase()}, que vira matéria-prima simbólica da composição.`,
    shadows.length &&
      `O ponto a transformar é ${shadows[0].toLowerCase()}, trazendo tensão narrativa para a arte.`,
    phrase && `A frase da essência adiciona uma voz íntima: "${phrase}".`,
  ].filter(Boolean) as string[];

  const intro = sentences.length
    ? "Prévia simbólica atual, recalculada com as escolhas marcadas até agora."
    : "Complete os campos ao lado para ver sua síntese simbólica nascer em tempo real.";

  const summary = sentences.length
    ? [
        tattooName && `Nome provisório: ${tattooName}.`,
        archetype && `Arquétipo central: ${archetype}.`,
        ...sentences.slice(0, 6),
      ]
        .filter(Boolean)
        .join(" ")
    : "Aguardando suas primeiras respostas para formar personalidade, energia, estética e composição corporal.";

  const tags = Array.from(new Set([
    profile || "perfil em aberto",
    element || "elemento em aberto",
    archetype || "arquétipo em leitura",
    traits[0] || "traço em leitura",
    animals[0] || "totem em leitura",
    sacred[0] || "símbolo em leitura",
    styles[0] || "estilo em leitura",
    phrase ? "essência escrita" : "essência em aberto",
  ]));

  return { intro, summary, tags };
}
