import { FormValue, formModules, totalRequiredFields } from "../data/formSchema";

export interface SymbolicReading {
  completion: number;
  answeredRequired: number;
  tattooName: string;
  cinematicConcept: string;
  hiddenMeaning: string;
  dominantArchetype: string;
  idealStyle: string;
  bodyComposition: string;
  professionalPrompt: string;
  symbolExplanations: string[];
  alternativeVersions: string[];
  reportHighlights: string[];
  numerology: string;
  zodiac: string;
  chineseZodiac: string;
  profileDirection: string;
}

export type DeliverableKey = "image" | "stencil" | "mockup" | "report";

export interface PremiumDeliverable {
  key: DeliverableKey;
  title: string;
  subtitle: string;
  content: string;
  fileName: string;
}

export type FormState = Record<string, FormValue>;

export interface AiGenerationResult {
  imageUrl?: string;
  imagePrompt?: string;
  models?: {
    text?: string;
    image?: string;
  };
  history?: {
    saved: boolean;
    id?: string;
    error?: string;
  };
  reading?: Partial<SymbolicReading> & {
    imagePrompt?: string;
    stencilPrompt?: string;
    mockupPrompt?: string;
  };
}

const fallback = "Em leitura";

const getString = (state: FormState, key: string) => {
  const value = state[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

const getArray = (state: FormState, key: string) => {
  const value = state[key];
  return Array.isArray(value) ? value : [];
};

const readableList = (items: string[], empty = fallback) => {
  if (!items.length) return empty;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
};

const numerologyFromName = (name: string) => {
  if (!name) return fallback;
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  const sum = normalized.split("").reduce((total, letter) => {
    const value = ((letter.charCodeAt(0) - 64 - 1) % 9) + 1;
    return total + value;
  }, 0);

  if (!sum) return fallback;
  let reduced = sum;
  while (![11, 22, 33].includes(reduced) && reduced > 9) {
    reduced = String(reduced)
      .split("")
      .reduce((total, digit) => total + Number(digit), 0);
  }
  return `${reduced}`;
};

const zodiacFromDate = (birthDate: string) => {
  if (!birthDate) return fallback;
  const [, monthText, dayText] = birthDate.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const limits = [
    ["Capricórnio", 20],
    ["Aquário", 19],
    ["Peixes", 20],
    ["Áries", 20],
    ["Touro", 21],
    ["Gêmeos", 21],
    ["Câncer", 23],
    ["Leão", 23],
    ["Virgem", 23],
    ["Libra", 23],
    ["Escorpião", 22],
    ["Sagitário", 22],
  ] as const;

  return day < limits[month - 1][1] ? limits[(month + 10) % 12][0] : limits[month - 1][0];
};

const chineseZodiacFromDate = (birthDate: string) => {
  if (!birthDate) return fallback;
  const year = Number(birthDate.split("-")[0]);
  if (!year) return fallback;
  const animals = [
    "Rato",
    "Boi",
    "Tigre",
    "Coelho",
    "Dragão",
    "Serpente",
    "Cavalo",
    "Cabra",
    "Macaco",
    "Galo",
    "Cão",
    "Porco",
  ];
  return animals[(year - 4) % 12];
};

const inferDominantArchetype = (state: FormState) => {
  const explicit = getString(state, "archetype");
  if (explicit) return explicit;

  const traits = getArray(state, "traits");
  const animals = getArray(state, "animals");
  const phase = getString(state, "lifePhase");
  const element = getString(state, "element");

  if (traits.includes("Protetor") || getArray(state, "perceivedEnergy").includes("Proteção")) {
    return "Guardião";
  }
  if (traits.includes("Solitário") || animals.includes("Lobo")) return "Lobo solitário";
  if (phase.includes("Renascimento") || animals.includes("Fênix")) return "Fênix";
  if (element === "Fogo" || animals.includes("Dragão")) return "Dragão";
  if (traits.includes("Espiritual") || element === "Éter") return "Feiticeiro";
  return "Espírito ancestral";
};

const profileDirectionFromState = (state: FormState) => {
  const profile = getString(state, "profileGender");
  if (profile === "Masculino") {
    return "perfil masculino: linhas mais estruturais, presença de armadura anatômica, peso visual nos ombros, peito, antebraço ou costas, mantendo elegância e força silenciosa";
  }
  if (profile === "Feminino") {
    return "perfil feminino: fluxo mais orgânico, encaixe elegante em curvas naturais, contraste fino entre delicadeza e poder, com composição mística e presença intensa";
  }
  if (profile) {
    return "perfil neutro/andrógino: composição equilibrada, simétrica quando necessário, com leitura corporal versátil e símbolos sem marcação rígida de gênero";
  }
  return "perfil visual ainda não definido: composição neutra e adaptável";
};

const compactSeed = (state: FormState) => {
  const name = getString(state, "identityName") || "Alma";
  const firstName = name.split(" ")[0];
  const soulWord = getString(state, "soulWord") || getString(state, "essencePhrase").split(" ")[0];
  const archetype = inferDominantArchetype(state);

  if (soulWord) return `${soulWord} de ${archetype}`;
  return `${firstName}: ${archetype}`;
};

const answeredRequiredCount = (state: FormState) =>
  formModules.reduce((total, module) => {
    const answered = module.fields.filter((field) => {
      if (field.optional) return false;
      const value = state[field.id];
      return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim();
    }).length;
    return total + answered;
  }, 0);

export const createSymbolicReading = (state: FormState): SymbolicReading => {
  const answeredRequired = answeredRequiredCount(state);
  const completion = Math.round((answeredRequired / totalRequiredFields) * 100);
  const archetype = inferDominantArchetype(state);
  const tattooName = compactSeed(state);
  const zodiac = zodiacFromDate(getString(state, "birthDate"));
  const numerology = numerologyFromName(getString(state, "identityName"));
  const chineseZodiac = chineseZodiacFromDate(getString(state, "birthDate"));
  const ascendant = getString(state, "ascendant");
  const element = getString(state, "element") || "elemento em aberto";
  const traits = getArray(state, "traits");
  const perceived = getArray(state, "perceivedEnergy");
  const connections = getArray(state, "emotionalConnections");
  const animals = getArray(state, "animals");
  const styles = getArray(state, "visualStyle");
  const feelings = getArray(state, "visualFeeling");
  const eternalize = getArray(state, "eternalize");
  const sacredSymbols = getArray(state, "sacredSymbols");
  const shadows = getArray(state, "shadowToTransform");
  const healing = getArray(state, "emotionToHeal");
  const placement = getString(state, "bodyPlacement") || "área escolhida";
  const tattooSize = getString(state, "tattooSize") || "tamanho em aberto";
  const bodyFlow = getString(state, "bodyFlow") || "fluxo orgânico";
  const color = getString(state, "colorPreference") || "preto e cinza";
  const detail = getString(state, "detailLevel") || "detalhamento médio";
  const environment =
    getString(state, "soulEnvironment") ||
    getString(state, "energyScenario") ||
    "cenário simbólico profundo";
  const phase = getString(state, "lifePhase") || "fase de transformação";
  const drive = getString(state, "drive") || "evolução";
  const fear = getString(state, "fear") || "perda de direção";
  const soulAnimal = getString(state, "soulAnimal");
  const primaryAnimal = soulAnimal || animals[0] || "animal totêmico";
  const mustHaveSymbol = getString(state, "mustHaveSymbol");
  const avoidVisuals = getString(state, "avoidVisuals");
  const finalInstruction = getString(state, "finalInstruction");
  const profileDirection = profileDirectionFromState(state);
  const visualStyle = styles.length ? readableList(styles.slice(0, 3)) : "Blackwork simbólico";
  const symbolicCore = readableList(
    [...connections.slice(0, 3), ...sacredSymbols.slice(0, 2), primaryAnimal, mustHaveSymbol].filter(Boolean),
  );

  return {
    completion,
    answeredRequired,
    tattooName,
    cinematicConcept: `Uma composição de ${visualStyle} onde ${archetype} surge em ${environment}, carregando ${symbolicCore}. A leitura combina ${element}, ${phase}, ${profileDirection} e ${readableList(
      feelings.slice(0, 3),
      "força silenciosa",
    ).toLowerCase()} para criar uma imagem que parece ter sido extraída de uma cena ritualística.`,
    hiddenMeaning: `A tatuagem representa ${readableList(
      eternalize,
      "evolução pessoal",
    ).toLowerCase()} como resposta ao medo de ${fear.toLowerCase()}. O impulso central é ${drive.toLowerCase()}, enquanto a sombra trabalhada é ${readableList(
      shadows,
      "controle interno",
    ).toLowerCase()} e a emoção em cura é ${readableList(healing, "força emocional").toLowerCase()}.`,
    dominantArchetype: archetype,
    idealStyle: `${visualStyle}, ${detail.toLowerCase()}, ${color.toLowerCase()}.`,
    bodyComposition: `Pensada para ${placement.toLowerCase()}, em ${tattooSize.toLowerCase()}, seguindo ${bodyFlow.toLowerCase()}. ${profileDirection}. A composição deve respeitar movimento natural do corpo, eixo principal claro, símbolos secundários em camadas e respiro suficiente para envelhecer bem na pele.`,
    professionalPrompt: `Premium symbolic tattoo design for ${placement}, size: ${tattooSize}. Visual body profile: ${profileDirection}. Style: ${visualStyle}, ${detail}, ${color}. Central archetype: ${archetype}. Symbolic elements: ${symbolicCore}. Emotional meaning: ${readableList(
      eternalize,
      "personal evolution",
    )}. Shadows to transform: ${readableList(shadows, "internal control")}. Atmosphere: ${environment}. Body flow: ${bodyFlow}. Must include: ${mustHaveSymbol || "symbolic focal point"}. Avoid: ${avoidVisuals || "generic clipart, text, watermark"}. Final user instruction: ${finalInstruction || "prioritize premium tattoo-ready composition"}. Create tattoo-ready art with strong silhouette, clean stencil readability, balanced negative space, anatomical flow, cinematic contrast, no text, no watermark.`,
    symbolExplanations: [
      `${archetype}: arquétipo dominante da presença e da narrativa pessoal.`,
      `${primaryAnimal}: instinto, proteção e força simbólica central.`,
      `${readableList(sacredSymbols, "Símbolos em leitura")}: camada sagrada, ornamental e narrativa.`,
      `${environment}: cenário emocional da alma e atmosfera visual da composição.`,
      `${element}: assinatura energética usada na direção de movimento, sombra e textura.`,
      `${zodiac}${ascendant ? ` com ascendente em ${ascendant}` : ""}: camada astral para orientar ritmo, tensão e equilíbrio.`,
    ],
    alternativeVersions: [
      `Versão ritual: mais mística, com ${primaryAnimal.toLowerCase()}, símbolos astrais e sombras profundas.`,
      `Versão armadura: mais corporal, agressiva e anatômica para ${placement.toLowerCase()}.`,
      `Versão sigilo: minimalista, geométrica e focada em ${getString(state, "soulWord") || "energia central"}.`,
    ],
    reportHighlights: [
      `Perfil visual: ${getString(state, "profileGender") || "Em leitura"}`,
      `Numerologia do nome: ${numerology}`,
      `Signo solar: ${zodiac}`,
      `Animal zodiacal: ${chineseZodiac}`,
      `Traços dominantes: ${readableList(traits.slice(0, 4))}`,
      `Presença percebida: ${readableList(perceived.slice(0, 3))}`,
    ],
    numerology,
    zodiac,
    chineseZodiac,
    profileDirection,
  };
};

export const mergeAiReading = (
  reading: SymbolicReading,
  aiResult?: AiGenerationResult | null,
): SymbolicReading => {
  if (!aiResult?.reading) return reading;
  return {
    ...reading,
    tattooName: aiResult.reading.tattooName || reading.tattooName,
    cinematicConcept: aiResult.reading.cinematicConcept || reading.cinematicConcept,
    hiddenMeaning: aiResult.reading.hiddenMeaning || reading.hiddenMeaning,
    dominantArchetype: aiResult.reading.dominantArchetype || reading.dominantArchetype,
    idealStyle: aiResult.reading.idealStyle || reading.idealStyle,
    bodyComposition: aiResult.reading.bodyComposition || reading.bodyComposition,
    professionalPrompt: aiResult.reading.imagePrompt || aiResult.imagePrompt || reading.professionalPrompt,
    symbolExplanations: aiResult.reading.symbolExplanations || reading.symbolExplanations,
  };
};

export const createPremiumDeliverables = (
  reading: SymbolicReading,
  aiResult?: AiGenerationResult | null,
): PremiumDeliverable[] => [
  {
    key: "image",
    title: "Imagem IA",
    subtitle: aiResult?.imageUrl
      ? "Imagem gerada pela OpenAI Images API."
      : "Prompt final para renderização visual da tattoo.",
    fileName: "imagem-ia",
    content: [
      "PROMPT PARA OPENAI IMAGES",
      "",
      aiResult?.imagePrompt || reading.professionalPrompt,
      "",
      aiResult?.imageUrl ? `Imagem gerada: ${aiResult.imageUrl}` : "Imagem ainda não gerada.",
      "",
      "Direção visual:",
      reading.cinematicConcept,
    ].join("\n"),
  },
  {
    key: "stencil",
    title: "Stencil Line Art",
    subtitle: "Brief técnico para converter a composição em line art tatuável.",
    fileName: "stencil-line-art",
    content: [
      "BRIEF DE STENCIL",
      "",
      aiResult?.reading?.stencilPrompt ||
        `Nome da tattoo: ${reading.tattooName}\nArquétipo dominante: ${reading.dominantArchetype}\nEstilo ideal: ${reading.idealStyle}`,
      "",
      "Instruções para o tatuador:",
      reading.bodyComposition,
    ].join("\n"),
  },
  {
    key: "mockup",
    title: "Mockup no corpo",
    subtitle: "Prompt para visualizar aplicação no posicionamento corporal escolhido.",
    fileName: "mockup-corpo",
    content: [
      "PROMPT PARA MOCKUP NO CORPO",
      "",
      aiResult?.reading?.mockupPrompt ||
        `Criar mockup realista da tattoo "${reading.tattooName}" aplicada no corpo.`,
      "",
      reading.bodyComposition,
    ].join("\n"),
  },
  {
    key: "report",
    title: "Relatório em PDF",
    subtitle: "Texto pronto para impressão ou exportação em PDF.",
    fileName: "relatorio-premium",
    content: [
      "RELATÓRIO PREMIUM - TATTOO AI SIMBÓLICA",
      "",
      `Nome da tattoo: ${reading.tattooName}`,
      `Arquétipo dominante: ${reading.dominantArchetype}`,
      `Estilo ideal: ${reading.idealStyle}`,
      "",
      "Conceito cinematográfico:",
      reading.cinematicConcept,
      "",
      "Significado oculto:",
      reading.hiddenMeaning,
      "",
      "Composição corporal:",
      reading.bodyComposition,
      "",
      "Símbolos:",
      ...reading.symbolExplanations.map((symbol) => `- ${symbol}`),
      "",
      "Versões alternativas:",
      ...reading.alternativeVersions.map((version) => `- ${version}`),
      "",
      "Destaques da leitura:",
      ...reading.reportHighlights.map((highlight) => `- ${highlight}`),
    ].join("\n"),
  },
];
