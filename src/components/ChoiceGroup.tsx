import { Droplets, Flame, Mountain, Sparkles, Wind } from "lucide-react";
import { FieldOption, FormField, FormValue } from "../data/formSchema";

interface ChoiceGroupProps {
  field: FormField;
  value: FormValue | undefined;
  onChange: (value: FormValue) => void;
}

const toArray = (value: FormValue | undefined) => (Array.isArray(value) ? value : []);

const optionClassName = (option: FieldOption, selected: boolean) => {
  const classes = ["choice"];
  if (selected) classes.push("choice--selected");
  if (option.tone) classes.push(`choice--${option.tone}`);
  return classes.join(" ");
};

const elementIcons = {
  Fogo: Flame,
  Terra: Mountain,
  Ar: Wind,
  "Água": Droplets,
  "Ãgua": Droplets,
  Éter: Sparkles,
  "Ã‰ter": Sparkles,
};

const renderOptionLabel = (field: FormField, option: FieldOption) => {
  const Icon =
    field.id === "element" ? elementIcons[option.label as keyof typeof elementIcons] : undefined;

  return (
    <>
      {Icon ? <Icon className="choice-icon" size={17} strokeWidth={1.8} /> : null}
      <span>{option.label}</span>
    </>
  );
};

const fallbackTooltip = (label: string) => {
  const meanings: Record<string, string> = {
    Poder: "Busca presença, domínio interno e uma composição mais imponente.",
    Amor: "Conecta proteção emocional, vínculo e símbolos de afeto profundo.",
    Evolução: "Representa crescimento, virada de ciclo e avanço pessoal.",
    Liberdade: "Pede movimento, ar, asas, caminhos abertos ou composição mais solta.",
    Proteção: "Tende a símbolos de guardião, escudo, animais protetores ou energia familiar.",
    Conhecimento: "Evoca olhos, livros, mapas, astros, geometria e sabedoria oculta.",
    Ambição: "Indica ascensão, coroa, montanha, liderança e força de conquista.",
    Paz: "Suaviza a composição, com equilíbrio, respiro e símbolos de cura.",
    Fênix: "Renascimento, queda e retorno mais forte.",
    Corvo: "Mistério, inteligência, presságio, sombra e visão espiritual.",
    Dragão: "Poder bruto, proteção, fogo interno e presença lendária.",
    Lobo: "Instinto, lealdade, solidão consciente e proteção de território.",
    Serpente: "Cura, troca de pele, tentação, sabedoria e transformação.",
    Dark: "Direção sombria, contrastada e emocionalmente intensa.",
    Blackwork: "Preto dominante, leitura forte e impacto gráfico.",
    "Fine line": "Linhas finas, delicadeza e detalhes mais sutis.",
    Realista: "Volume, sombra e aparência mais próxima de ilustração real.",
    Geométrico: "Simetria, matemática visual, mandalas, padrões e ordem.",
    Minimalista: "Poucos elementos, mais respiro e leitura limpa.",
  };

  return meanings[label] || `Exemplo de uso: a IA interpreta "${label}" como pista de símbolo, estilo, emoção ou composição.`;
};

export function ChoiceGroup({ field, value, onChange }: ChoiceGroupProps) {
  if (!field.options?.length) return null;

  if (field.type === "multi") {
    const selectedValues = toArray(value);

    return (
      <div className="choice-grid choice-grid--multi" role="group" aria-label={field.label}>
        {field.options.map((option) => {
          const selected = selectedValues.includes(option.label);
          const tooltip = option.description || fallbackTooltip(option.label);

          return (
            <button
              aria-pressed={selected}
              className={optionClassName(option, selected)}
              data-tooltip={tooltip}
              key={option.label}
              onClick={() => {
                const next = selected
                  ? selectedValues.filter((item) => item !== option.label)
                  : [...selectedValues, option.label];
                onChange(next);
              }}
              title={tooltip}
              type="button"
            >
              {renderOptionLabel(field, option)}
            </button>
          );
        })}
      </div>
    );
  }

  const selectedValue = typeof value === "string" ? value : "";

  return (
    <div className="choice-grid" role="radiogroup" aria-label={field.label}>
      {field.options.map((option) => {
        const selected = selectedValue === option.label;
        const tooltip = option.description || fallbackTooltip(option.label);

        return (
          <button
            aria-checked={selected}
            className={optionClassName(option, selected)}
            data-tooltip={tooltip}
            key={option.label}
            onClick={() => onChange(option.label)}
            role="radio"
            title={tooltip}
            type="button"
          >
            {renderOptionLabel(field, option)}
          </button>
        );
      })}
    </div>
  );
}
