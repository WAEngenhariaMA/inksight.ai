import {
  AlertCircle,
  Clipboard,
  Coins,
  Download,
  FileText,
  Image,
  Layers3,
  PenTool,
  ShoppingCart,
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
import { formModules } from "../data/formSchema";
import { DecorativeRule, OracleEye } from "./Ornaments";
import { ORACLE_ARTWORK_URL } from "../config/visualAssets";

type GenerationAction = "concept" | "image" | "mockup" | "stencil" | "fullPackage";

interface CreditCosts {
  concept: number;
  tattooImage: number;
  mockup: number;
  stencil: number;
  report: number;
  fullPackage: number;
}

interface PreviewPanelProps {
  answers: FormState;
  activeDeliverable: DeliverableKey;
  reading: SymbolicReading;
  deliverable: PremiumDeliverable;
  packageGenerated: boolean;
  copied: boolean;
  generating: boolean;
  generationAction: GenerationAction | null;
  generationError: string;
  aiResult: AiGenerationResult | null;
  creditBalance: number | null;
  creditCosts: CreditCosts;
  creditLoading: boolean;
  onBuyCredits: () => void;
  onCopyPrompt: () => void;
  onCopyDeliverable: () => void;
  onDownloadDeliverable: () => void;
  onGenerateConcept: () => void;
  onGenerateFullPackage: () => void;
  onGenerateImage: () => void;
  onGenerateMockup: () => void;
  onGenerateStencil: () => void;
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
  generationAction,
  generationError,
  aiResult,
  creditBalance,
  creditCosts,
  creditLoading,
  onBuyCredits,
  onCopyPrompt,
  onCopyDeliverable,
  onDownloadDeliverable,
  onGenerateConcept,
  onGenerateFullPackage,
  onGenerateImage,
  onGenerateMockup,
  onGenerateStencil,
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
  const previewImageUrl =
    activeDeliverable === "mockup"
      ? aiResult?.mockupUrl || aiResult?.imageUrl
      : activeDeliverable === "stencil"
        ? aiResult?.stencilUrl || aiResult?.imageUrl
        : aiResult?.imageUrl;
  const canSpend = (cost: number) => creditBalance === null || creditBalance >= cost;
  const actionButtons = [
    {
      key: "concept" as const,
      label: "Gerar conceito",
      cost: creditCosts.concept,
      onClick: onGenerateConcept,
    },
    {
      key: "image" as const,
      label: "Gerar imagem com IA",
      cost: creditCosts.tattooImage,
      onClick: onGenerateImage,
    },
    {
      key: "mockup" as const,
      label: "Gerar mockup",
      cost: creditCosts.mockup,
      onClick: onGenerateMockup,
    },
    {
      key: "stencil" as const,
      label: "Gerar stencil",
      cost: creditCosts.stencil,
      onClick: onGenerateStencil,
    },
    {
      key: "fullPackage" as const,
      label: "Gerar pacote completo",
      cost: creditCosts.fullPackage,
      onClick: onGenerateFullPackage,
    },
  ];

  return (
    <aside className="preview-panel">
      <header className="preview-intro">
        <h2>Leitura simbólica ao vivo</h2>
        <p>Sua prévia simbólica será construída à medida que você responde.</p>
      </header>

      <div className="oracle-stage">
        {previewImageUrl ? (
          <img src={previewImageUrl} alt={`Imagem gerada para ${reading.tattooName}`} />
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
          <div className="live-tags">
            {liveAspects.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          {liveAspects.meaningItems.length ? (
            <div className="live-meaning-list">
              {liveAspects.meaningItems.map((item) => (
                <article key={`${item.field}-${item.value}`}>
                  <span>{item.field}</span>
                  <strong>{item.value}</strong>
                  <p>{item.meaning}</p>
                </article>
              ))}
            </div>
          ) : null}
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
          {previewImageUrl
            ? "Imagem gerada e pacote premium em construção."
            : "Complete os módulos para liberar todas as gerações."}
        </p>
      </div>

      <section className="credit-wallet">
        <div>
          <span>Saldo disponível</span>
          <strong>{creditLoading ? "Carregando..." : `${creditBalance ?? 0} créditos`}</strong>
        </div>
        <button className="button button--ghost" onClick={onBuyCredits} type="button">
          <ShoppingCart size={16} />
          Comprar créditos
        </button>
      </section>

      <section className="generation-actions" aria-label="Ações premium com créditos">
        {actionButtons.map((action) => {
          const insufficient = !canSpend(action.cost);
          const running = generationAction === action.key && generating;
          return (
            <button
              className={`generation-action ${insufficient ? "generation-action--locked" : ""}`}
              disabled={generating && !running}
              key={action.key}
              onClick={insufficient ? onBuyCredits : action.onClick}
              type="button"
            >
              <span>
                {running ? <Wand2 size={16} /> : insufficient ? <AlertCircle size={16} /> : <Coins size={16} />}
                {running ? "Gerando..." : action.label}
              </span>
              <strong>{action.cost} cr</strong>
            </button>
          );
        })}
      </section>

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
          {activeDeliverable === "report" || aiResult?.imageUrl ? (
            <PremiumReportCard answers={answers} imageUrl={aiResult?.imageUrl || ORACLE_ARTWORK_URL} reading={reading} />
          ) : (
            <pre>{deliverable.content}</pre>
          )}
          {copied ? <span className="copy-status">Copiado</span> : null}
        </section>
      ) : null}
    </aside>
  );
}

function PremiumReportCard({
  answers,
  imageUrl,
  reading,
}: {
  answers: FormState;
  imageUrl?: string;
  reading: SymbolicReading;
}) {
  const identityName = asText(answers.identityName) || "Sua essência";
  const displayName = identityName.split(" ")[0] || identityName;
  const birthDate = formatDateBR(asText(answers.birthDate));
  const ascendant = asText(answers.ascendant) || "Em leitura";
  const element = asText(answers.element) || "Em leitura";
  const energy = [
    ...asList(answers.traits).slice(0, 3),
    ...asList(answers.perceivedEnergy).slice(0, 2),
  ].slice(0, 4);
  const shadows = [
    ...asList(answers.shadowToTransform).slice(0, 3),
    asText(answers.fear),
    ...asList(answers.emotionToHeal).slice(0, 2),
  ].filter(Boolean);
  const essence = [
    ...asList(answers.eternalize).slice(0, 2),
    asText(answers.lifePhase),
    asText(answers.drive),
  ].filter(Boolean);
  const reportElements = buildReportElements(answers, reading);

  return (
    <article className="premium-report-card">
      <div className="premium-report-card__media">
        {imageUrl ? <img src={imageUrl} alt={`Relatório visual de ${reading.tattooName}`} /> : <OracleEye />}
      </div>
      <div className="premium-report-card__content">
        <header className="premium-report-identity">
          <span>Sua essência</span>
          <h3>{displayName}</h3>
          <strong>{reading.dominantArchetype}</strong>
        </header>
        <dl className="premium-report-meta">
          <div>
            <dt>Data</dt>
            <dd>{birthDate}</dd>
          </div>
          <div>
            <dt>Ascendente</dt>
            <dd>{ascendant}</dd>
          </div>
          <div>
            <dt>Elemento</dt>
            <dd>{element}</dd>
          </div>
          <div>
            <dt>Energia</dt>
            <dd>{energy.length ? joinNatural(energy) : "Em leitura"}</dd>
          </div>
        </dl>

        <section className="premium-report-section">
          <h4>Significado da tattoo</h4>
          <p>{reading.hiddenMeaning}</p>
          <p>{reading.cinematicConcept}</p>
        </section>

        <section className="premium-report-section">
          <h4>Elementos principais</h4>
          <div className="premium-symbol-list">
            {reportElements.map((item) => (
              <article key={`${item.title}-${item.description}`}>
                <span aria-hidden="true">{initials(item.title)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="premium-report-mini-grid">
          <div>
            <h4>Sombras a transformar</h4>
            <p>{shadows.length ? joinNatural(shadows) : "Bloqueios internos, medo e padrões antigos em processo de domínio."}</p>
          </div>
          <div>
            <h4>Essência da tattoo</h4>
            <p>{essence.length ? joinNatural(essence) : "Evolução pessoal, proteção e controle interno."}</p>
          </div>
        </section>
      </div>
    </article>
  );
}

const asText = (value: FormState[string]) => (typeof value === "string" ? value : "");
const asList = (value: FormState[string]) => (Array.isArray(value) ? value : []);

const formatDateBR = (value: string) => {
  if (!value) return "Em leitura";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const sentenceFromSymbol = (value: string) => {
  const [title, description] = value.split(/:\s*/);
  return {
    title: title?.trim() || value,
    description: description?.trim() || meaningFor(value, "Símbolo"),
  };
};

const buildReportElements = (answers: FormState, reading: SymbolicReading) => {
  const candidates = [
    {
      title: reading.dominantArchetype,
      description: meaningFor(reading.dominantArchetype, "Arquétipo"),
    },
    ...valuesForField(answers, "soulEnvironment").slice(0, 1).map((value) => ({
      title: value,
      description: meaningFor(value, "Ambiente"),
    })),
    ...valuesForField(answers, "animals").slice(0, 2).map((value) => ({
      title: value,
      description: meaningFor(value, "Animal"),
    })),
    ...valuesForField(answers, "sacredSymbols").slice(0, 3).map((value) => ({
      title: value,
      description: meaningFor(value, "Símbolo"),
    })),
    ...reading.symbolExplanations.slice(0, 4).map(sentenceFromSymbol),
  ];

  const unique = new Map<string, { title: string; description: string }>();
  candidates.forEach((item) => {
    if (item.title && item.title !== "Em leitura" && !unique.has(item.title)) {
      unique.set(item.title, item);
    }
  });

  return Array.from(unique.values()).slice(0, 7);
};

type MeaningItem = {
  field: string;
  value: string;
  meaning: string;
};

const optionDescriptionByLabel = new Map<string, string>();

formModules.forEach((module) => {
  module.fields.forEach((field) => {
    field.options?.forEach((option) => {
      if (option.description) {
        optionDescriptionByLabel.set(option.label, option.description);
      }
    });
  });
});

const meaningFields: Array<[keyof FormState, string]> = [
  ["profileGender", "Perfil"],
  ["element", "Elemento"],
  ["traits", "Traço"],
  ["shadowToTransform", "Sombra"],
  ["perceivedEnergy", "Presença"],
  ["archetype", "Arquétipo"],
  ["connectionMode", "Eixo interno"],
  ["emotionalConnections", "Conexão"],
  ["animals", "Animal"],
  ["sacredSymbols", "Símbolo"],
  ["soulEnvironment", "Ambiente"],
  ["visualStyle", "Estilo"],
  ["detailLevel", "Detalhe"],
  ["colorPreference", "Cor"],
  ["visualFeeling", "Sensação"],
  ["eternalize", "Memória"],
  ["lifePhase", "Fase"],
  ["tattooRepresents", "Representa"],
  ["emotionToHeal", "Cura"],
  ["bodyPlacement", "Corpo"],
  ["tattooSize", "Tamanho"],
  ["bodyFlow", "Fluxo"],
  ["tattooImpact", "Impacto"],
  ["fear", "Medo"],
  ["drive", "Motor"],
  ["soulWord", "Palavra"],
  ["energyScenario", "Cenário"],
  ["soulAnimal", "Animal da alma"],
  ["mustHaveSymbol", "Obrigatório"],
];

const choiceMeanings: Record<string, string> = {
  Masculino: "Pede estrutura, contraste e peso visual, com encaixe forte em antebraço, braço, peito, costas ou perna.",
  Feminino: "Pede fluidez, elegância e linhas que acompanham curvas naturais, sem perder força simbólica.",
  "Neutro / andrógino": "Equilibra força, delicadeza e simetria, evitando códigos visuais rígidos de gênero.",
  Fogo: "Representa ação, coragem, desejo, liderança e renascimento. Na pele, funciona bem com linhas ascendentes e contraste quente.",
  Terra: "Representa estabilidade, proteção, raiz, disciplina e construção. No desenho, pede base sólida e símbolos bem ancorados.",
  Ar: "Representa mente, liberdade, estratégia e movimento. Visualmente combina com linhas leves, direção e respiro.",
  Água: "Representa emoção, intuição, memória e cura. Como tattoo, pede fluxo orgânico, sombras suaves e profundidade.",
  Éter: "Representa espiritualidade, mistério e energia sutil. Puxa a arte para astros, sigilos, mandalas e composição ritual.",
  Calmo: "Indica controle emocional e força silenciosa; a tattoo pode ter menos agressividade e mais equilíbrio.",
  Estratégico: "Pede composição inteligente, simétrica e bem planejada, com símbolos posicionados como um mapa.",
  Misterioso: "Sugere leitura de sombra, segredo e presença reservada; funciona com contraste, olhos, luas e camadas ocultas.",
  Frio: "Traz contenção, autocontrole e distância emocional; visualmente combina com preto, gelo, metal e precisão.",
  Protetor: "Pede símbolos de guarda, escudo, família, asas ou animais de defesa.",
  Sonhador: "Abre espaço para elementos poéticos, céu, estrelas, flores, fantasia e formas mais suaves.",
  Observador: "Representa visão, silêncio e percepção; olhos, corujas, luas e detalhes discretos funcionam muito bem.",
  Dominante: "Pede composição imponente, eixo central forte e hierarquia clara entre símbolo principal e elementos secundários.",
  Impulsivo: "Traz energia bruta e movimento; linhas diagonais, fogo, ação e assimetria controlada ajudam.",
  Espiritual: "Leva a peça para mandalas, astros, flor de lótus, geometria sagrada e símbolos de proteção.",
  Reservado: "Pede leitura elegante, menos óbvia, com símbolos pessoais escondidos dentro da composição.",
  Intenso: "Pede contraste, profundidade e carga emocional forte, sem deixar a arte confusa.",
  Analítico: "Combina com geometria, simetria, linhas limpas e lógica visual.",
  Aventureiro: "Puxa mapas, montanhas, ondas, bússolas, céu aberto e sensação de jornada.",
  Solitário: "Indica independência e caminho próprio; lobos, montanhas, lua e silhuetas isoladas funcionam.",
  Caótico: "Pode virar composição dinâmica, fragmentada e cinematográfica, desde que tenha um foco legível.",
  Disciplinado: "Pede repetição, simetria, linhas firmes e acabamento muito limpo.",
  Sensível: "Pede sombras mais suaves, flores, água, borboletas, detalhes finos e leitura emocional.",
  Ambicioso: "Traz ascensão, coroa, montanha, sol, fogo e sensação de conquista.",
  Leal: "Representa vínculo, família, pacto e proteção; combina com coração, laço, cachorro, escudo ou raízes.",
  Instintivo: "Traz corpo, animalidade, reflexo e presença; a peça pode ter olhos, movimento orgânico e foco.",
  Criativo: "Permite mistura de estilos, surrealismo, sketch, anime, fantasia e símbolos menos literais.",
  Elegante: "Pede linhas refinadas, ornamental, fine line, composição limpa e proporção premium.",
  Independente: "Representa autonomia e caminho próprio; asas, pássaros, montanhas e céu aberto funcionam.",
  Magnético: "Pede foco visual forte: olho, rosto, brilho, contraste e símbolo central que segura atenção.",
  Rebelde: "Combina com sketch, blackwork, cyber sigilism, assimetria, cortes visuais e atitude.",
  Racional: "Pede geometria, ordem, poucos elementos soltos e leitura visual objetiva.",
  Respeito: "Pede presença séria e bem construída, sem excesso de informação.",
  Segurança: "Indica proteção, estabilidade e confiança; a composição deve parecer firme e ancorada.",
  Medo: "Como sensação visual, cria tensão controlada; como emoção, pode ser transformado em símbolo de domínio interno.",
  Liderança: "Pede eixo central, coroa, sol, leão, montanha ou composição vertical.",
  Serenidade: "Pede espaço negativo, água, luz, flores, céu aberto e pouca agressividade.",
  Intensidade: "Pede preto bem usado, volume, contraste e símbolos emocionalmente fortes.",
  Inteligência: "Combina com olhos, livros, mapas, geometria, coruja e símbolos de percepção.",
  "Presença forte": "Pede desenho legível à distância, centro dominante e contraste bem resolvido.",
  "Energia espiritual": "Pede símbolos sagrados, luz, mandalas, astros e composição com sentido ritual.",
  Proteção: "Representa guarda, cuidado e limite. Em tattoo, funciona com escudos, asas, olhos, animais protetores e símbolos familiares.",
  Guerreiro: "Arquétipo de luta, disciplina e superação; pede armadura visual, espada, fogo ou linhas fortes.",
  "Lobo solitário": "Arquétipo de independência, instinto e lealdade seletiva; pede lua, floresta, olhar e silêncio.",
  Guardião: "Arquétipo de proteção; pede escudo, animal sentinela, asas ou símbolos que cercam o centro.",
  Rei: "Arquétipo de liderança e domínio; pede coroa, sol, leão, simetria e postura imponente.",
  Feiticeiro: "Arquétipo de mistério e transmutação; pede sigilos, astros, alquimia e aura ritual.",
  Samurai: "Arquétipo de honra, disciplina e precisão; pede lâmina, composição vertical e silêncio visual.",
  Fênix: "Representa renascimento e retorno mais forte após queda; funciona com asas, fogo e movimento ascendente.",
  Corvo: "Representa mistério, inteligência, sombra e visão espiritual.",
  Dragão: "Representa poder, proteção, força lendária e fogo interno.",
  Navegador: "Representa jornada, direção, risco e descoberta; combina com bússola, mar, mapa e céu.",
  Caçador: "Representa foco, paciência e instinto; pede linhas de movimento e símbolo animal.",
  Monge: "Representa silêncio, domínio interno e espiritualidade disciplinada.",
  Leão: "Representa coragem, liderança e dignidade; pede presença central forte.",
  Serpente: "Representa cura, troca de pele, sabedoria e transformação.",
  "Entidade cósmica": "Representa identidade além do comum; pede astros, geometria e escala celestial.",
  "Espírito ancestral": "Representa memória, raiz e proteção invisível; pede símbolos antigos e presença ritual.",
  Lua: "Fala de ciclos, intuição, emoção escondida e renascimento silencioso.",
  Sol: "Fala de força vital, clareza, liderança e energia positiva.",
  Estrelas: "Representam guia, esperança, destino e pontos de luz na narrativa.",
  Mar: "Representa liberdade emocional, profundidade e movimento.",
  "Oceano profundo": "Representa inconsciente, mistério, memória e intensidade emocional.",
  Tempestade: "Representa caos, ruptura e energia que limpa o caminho.",
  Chuva: "Representa cura, alívio e renovação.",
  Floresta: "Representa instinto, proteção natural e conexão com raízes.",
  Montanhas: "Representam superação, distância vencida e visão ampla.",
  Gelo: "Representa autocontrole, silêncio e resistência.",
  Cosmos: "Representa grandeza, destino, espiritualidade e mistério.",
  Escuridão: "Representa sombra pessoal, profundidade e partes ocultas da identidade.",
  Noite: "Representa introspecção, segredo, lua e energia reservada.",
  Deserto: "Representa silêncio, resistência e busca interna.",
  "Ruínas antigas": "Representam memória, tempo, legado e beleza sobrevivente.",
  Mitologia: "Representa narrativa épica, arquétipos e símbolos maiores que a vida comum.",
  "Céu estrelado": "Representa esperança, destino e proteção celestial.",
  Flores: "Representam beleza, delicadeza, cura e vida que floresce depois da dor.",
  Jardins: "Representam paz cultivada, cuidado, beleza organizada e refúgio emocional.",
  Borboletas: "Representam transformação leve, liberdade e renascimento delicado.",
  Aurora: "Representa recomeço, luz nova e transição bonita.",
  "Pôr do sol": "Representa encerramento de ciclo, calma e beleza emocional.",
  Música: "Representa ritmo interno, memória afetiva e expressão sensível.",
  Arte: "Representa criatividade, identidade e liberdade de linguagem visual.",
  Anime: "Representa emoção estilizada, narrativa visual e expressividade marcante.",
  Mangá: "Representa contraste, movimento, hachura e energia de página ilustrada.",
  "Paz interior": "Representa cura, silêncio bom e desejo de equilíbrio.",
  Esperança: "Representa luz futura, fé no caminho e continuidade.",
  Gratidão: "Representa memória positiva, amadurecimento e reconhecimento do que foi vivido.",
  Lobo: "Representa instinto, lealdade, território e independência.",
  Águia: "Representa visão, liberdade, foco e superioridade espiritual.",
  Tigre: "Representa força silenciosa, magnetismo e impulso controlado.",
  Coruja: "Representa sabedoria, observação e visão no escuro.",
  Urso: "Representa proteção, resistência e força familiar.",
  Cavalo: "Representa liberdade, movimento e nobreza.",
  Tubarão: "Representa foco, sobrevivência e força implacável.",
  Pantera: "Representa elegância sombria, agilidade e poder silencioso.",
  Raposa: "Representa inteligência, adaptação e astúcia.",
  Escorpião: "Representa defesa, intensidade e transformação.",
  Jaguar: "Representa poder instintivo, sombra elegante e domínio territorial.",
  Baleia: "Representa memória profunda, calma, grandeza e conexão emocional.",
  Cervo: "Representa sensibilidade, nobreza tranquila e proteção espiritual suave.",
  "Olho místico": "Representa visão espiritual, proteção, percepção e vigilância da alma.",
  Mandala: "Representa centro, ordem, equilíbrio e espiritualidade geométrica.",
  Runas: "Representam linguagem ancestral, destino e proteção codificada.",
  Sigilos: "Representam intenção concentrada, identidade oculta e poder simbólico personalizado.",
  "Lua crescente": "Representa início de ciclo, intuição e crescimento emocional.",
  "Sol negro": "Representa poder oculto, sombra dominada e renascimento pela escuridão.",
  Espada: "Representa decisão, corte de ciclo, honra e defesa.",
  Coroa: "Representa domínio, valor próprio, liderança e soberania interna.",
  Chave: "Representa acesso, segredo, cura e abertura de caminhos.",
  Relógio: "Representa tempo, memória, destino e urgência de viver.",
  Rosa: "Representa amor, beleza, dor e delicadeza com proteção.",
  "Círculo alquímico": "Representa transformação, ordem espiritual e união de forças opostas.",
  Poder: "Representa domínio interno, presença e força assumida.",
  Evolução: "Representa crescimento, mudança de fase e avanço pessoal.",
  Liberdade: "Representa movimento, ar, expansão e ruptura de limites.",
  Conhecimento: "Representa sabedoria, estudo, visão e busca por sentido.",
  Ambição: "Representa ascensão, conquista, foco e desejo de deixar marca.",
  Paz: "Representa equilíbrio, silêncio bom e cura emocional.",
  Superação: "Representa vitória sobre dor, queda ou limite.",
  Renascimento: "Representa nova pele, recomeço e retorno mais forte.",
  "Dor vencida": "Representa cicatriz transformada em símbolo de força.",
  "Proteção familiar": "Representa vínculo, raiz e cuidado com quem importa.",
  "Evolução pessoal": "Representa amadurecimento e busca por uma versão mais consciente.",
  "Mudança de vida": "Representa corte de fase e passagem para outro ciclo.",
  Espiritualidade: "Representa ligação com o invisível, fé e proteção energética.",
  Resistência: "Representa firmeza, sobrevivência e capacidade de continuar.",
  "Equilíbrio emocional": "Representa autocontrole, cura e harmonia interna.",
  "Poder pessoal": "Representa autonomia, presença e posse da própria história.",
  "Controle interno": "Representa domínio das emoções e direção consciente.",
  Reconstrução: "Representa refazer a própria base depois de uma ruptura.",
  Ascensão: "Representa subida, conquista e fortalecimento de identidade.",
  Caos: "Representa fase de ruptura que precisa virar forma visual organizada.",
  Cura: "Representa fechamento de ferida e pacificação interna.",
  Descoberta: "Representa busca de identidade, símbolos novos e abertura.",
  "Guerra interna": "Representa conflito emocional que pede contraste e narrativa forte.",
  Expansão: "Representa crescimento, liberdade e abertura de horizonte.",
  "Transformação silenciosa": "Representa mudança profunda sem espetáculo externo.",
  "Quem você é": "Pede uma tattoo de identidade direta, fiel à presença atual.",
  "Quem você foi": "Pede memória, marcas de passado e símbolos de trajetória.",
  "Quem você quer se tornar": "Pede direção, ascensão e imagem de futuro.",
  "Sua alma oculta": "Pede mistério, camadas escondidas e símbolos menos literais.",
  "Sua energia atual": "Pede leitura do momento presente, sem carregar tudo da história.",
  "Sua história completa": "Pede composição mais narrativa, com começo, conflito e renascimento.",
  "Preto e cinza": "Entrega maturidade, sombra e leitura tatuável com bom envelhecimento.",
  "Preto sólido": "Entrega impacto, força gráfica e presença à distância.",
  "Toques de vermelho": "Adiciona vida, sangue simbólico, paixão ou alerta sem colorir tudo.",
  Colorido: "Abre espaço para emoção, fantasia, anime, natureza e leitura mais vibrante.",
  "Somente sombras": "Foca em volume, profundidade e atmosfera sem depender de linhas pesadas.",
  Minimalista: "Pede poucos elementos, leitura limpa e significado concentrado.",
  Médio: "Permite equilíbrio entre detalhe e leitura clara na pele.",
  "Muito detalhado": "Pede área maior e tatuador preparado para textura, profundidade e camadas.",
  "Extremamente cinematográfico": "Pede cena completa, luz dramática e composição de alto impacto.",
  "Força silenciosa": "Representa poder sem gritar; ideal para composição elegante e pesada na medida.",
};

const fallbackMeaning = (value: string, field: string) => {
  if (field === "Corpo") {
    return `Define o encaixe anatômico: ${value.toLowerCase()} muda fluxo, escala e leitura da tatuagem na pele.`;
  }
  if (field === "Tamanho") {
    return `Controla o nível de detalhe possível: ${value.toLowerCase()} orienta quantidade de textura, símbolos e respiro.`;
  }
  if (field === "Fluxo") {
    return `Direciona como a arte deve caminhar pelo corpo: ${value.toLowerCase()} vira regra de composição.`;
  }
  if (field === "Palavra" || field === "Cenário" || field === "Obrigatório" || field === "Animal da alma") {
    return "Escolha pessoal direta; deve entrar como assinatura simbólica, mesmo que apareça de forma escondida no desenho.";
  }
  return `Na leitura simbólica, "${value}" entra como pista de personalidade, emoção, símbolo ou direção estética da tattoo.`;
};

const meaningFor = (value: string, field: string) =>
  optionDescriptionByLabel.get(value) || choiceMeanings[value] || fallbackMeaning(value, field);

const valuesForField = (answers: FormState, fieldId: keyof FormState) => {
  const value = answers[fieldId];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const joinNatural = (items: string[]) => {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
};

const lowerJoin = (items: string[]) => joinNatural(items).toLowerCase();

function buildLiveAspects(answers: FormState, reading: SymbolicReading) {
  const profile = asText(answers.profileGender);
  const element = asText(answers.element);
  const phrase = asText(answers.essencePhrase);
  const traits = asList(answers.traits);
  const perceived = asList(answers.perceivedEnergy);
  const connections = asList(answers.emotionalConnections);
  const animals = asList(answers.animals);
  const styles = asList(answers.visualStyle);
  const placement = asText(answers.bodyPlacement);
  const size = asText(answers.tattooSize);
  const flow = asText(answers.bodyFlow);
  const sacred = asList(answers.sacredSymbols);
  const shadows = asList(answers.shadowToTransform);
  const feeling = asList(answers.visualFeeling);
  const phase = asText(answers.lifePhase);
  const drive = asText(answers.drive);
  const fear = asText(answers.fear);
  const environment = asText(answers.soulEnvironment) || asText(answers.energyScenario);
  const eternalize = asList(answers.eternalize);
  const soulWord = asText(answers.soulWord);
  const customAnimal = asText(answers.soulAnimal);
  const mustHaveSymbol = asText(answers.mustHaveSymbol);
  const archetype = reading.dominantArchetype !== "Em leitura" ? reading.dominantArchetype : "";
  const tattooName = reading.tattooName !== "Em leitura" ? reading.tattooName : "";

  const meaningItems = meaningFields.flatMap(([fieldId, field]) =>
    valuesForField(answers, fieldId).map<MeaningItem>((value) => ({
      field,
      value,
      meaning: meaningFor(value, field),
    })),
  );

  const identityLine = [
    profile && `perfil ${profile.toLowerCase()}`,
    element && `energia de ${element.toLowerCase()}`,
    traits.length && `traços ${lowerJoin(traits.slice(0, 4))}`,
    perceived.length && `presença percebida como ${lowerJoin(perceived.slice(0, 3))}`,
  ].filter(Boolean);

  const symbolLine = [
    animals.length && `animalidade em ${lowerJoin(animals.slice(0, 3))}`,
    customAnimal && `animal da alma: ${customAnimal}`,
    sacred.length && `símbolos ${lowerJoin(sacred.slice(0, 3))}`,
    mustHaveSymbol && `símbolo obrigatório: ${mustHaveSymbol}`,
  ].filter(Boolean);

  const visualLine = [
    styles.length && `estética ${lowerJoin(styles.slice(0, 4))}`,
    feeling.length && `sensação de ${lowerJoin(feeling.slice(0, 3))}`,
    environment && `ambiente emocional: ${environment.toLowerCase()}`,
  ].filter(Boolean);

  const bodyLine = [
    placement && `encaixe em ${placement.toLowerCase()}`,
    size && `escala ${size.toLowerCase()}`,
    flow && `fluxo ${flow.toLowerCase()}`,
  ].filter(Boolean);

  const narrativeLine = [
    phase && `fase de ${phase.toLowerCase()}`,
    eternalize.length && `memória de ${lowerJoin(eternalize.slice(0, 3))}`,
    drive && `movido por ${drive.toLowerCase()}`,
    fear && `transformando o medo de ${fear.toLowerCase()}`,
    shadows.length && `sombra principal: ${shadows[0].toLowerCase()}`,
    soulWord && `palavra da alma: ${soulWord}`,
    connections.length && `conexões emocionais com ${lowerJoin(connections.slice(0, 3))}`,
  ].filter(Boolean);

  const sentences = [
    identityLine.length &&
      `A pessoa se apresenta com ${identityLine.join("; ")}. Isso pede uma tattoo com identidade clara, sem símbolos aleatórios.`,
    symbolLine.length &&
      `A camada simbólica nasce de ${symbolLine.join("; ")}. Para um tatuador, esses elementos precisam virar hierarquia visual: um símbolo principal, apoios menores e respiro.`,
    visualLine.length &&
      `A direção estética aponta para ${visualLine.join("; ")}. O resultado deve equilibrar beleza, leitura à distância e detalhe que envelheça bem na pele.`,
    bodyLine.length &&
      `Na aplicação corporal, a peça pede ${bodyLine.join("; ")}. A composição deve acompanhar anatomia, movimento e área escolhida.`,
    narrativeLine.length &&
      `A narrativa emocional traz ${narrativeLine.join("; ")}. Isso transforma a tattoo em marca de fase, não apenas decoração.`,
    phrase && `A frase da essência adiciona uma voz íntima: "${phrase}".`,
  ].filter(Boolean) as string[];

  const intro = sentences.length
    ? "Leitura profissional ao vivo: cada escolha abaixo está sendo traduzida em linguagem simbólica e tatuável."
    : "Complete os campos ao lado para ver sua síntese simbólica nascer em tempo real.";

  const summary = sentences.length
    ? [
        tattooName && `Nome provisório: ${tattooName}.`,
        archetype && `Arquétipo central: ${archetype}.`,
        ...sentences,
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

  return { intro, summary, tags, meaningItems };
}
