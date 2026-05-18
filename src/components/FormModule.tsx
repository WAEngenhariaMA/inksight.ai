import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Orbit,
  MapPin,
  MessageCircle,
  UserRound,
  UsersRound,
} from "lucide-react";
import { ChoiceGroup } from "./ChoiceGroup";
import { AstroWheel } from "./Ornaments";
import { FormModule as FormModuleType, FormValue } from "../data/formSchema";
import { FormState } from "../lib/symbolicEngine";

interface FormModuleProps {
  activeIndex: number;
  module: FormModuleType;
  totalModules: number;
  values: FormState;
  onBack: () => void;
  onNext: () => void;
  onUpdate: (fieldId: string, value: FormValue) => void;
}

const fieldIcons = {
  identityName: UserRound,
  profileGender: UsersRound,
  birthDate: Calendar,
  birthTime: Clock3,
  birthCity: MapPin,
  birthCountry: MapPin,
  ascendant: Compass,
  element: Orbit,
  essencePhrase: MessageCircle,
};

const fieldClassName = (fieldId: string, layout?: "full" | "half") =>
  ["field-block", layout === "half" ? "field-block--half" : "", `field-block--${fieldId}`]
    .filter(Boolean)
    .join(" ");

export function FormModule({
  activeIndex,
  module,
  totalModules,
  values,
  onBack,
  onNext,
  onUpdate,
}: FormModuleProps) {
  return (
    <main className="form-surface">
      <div className="module-heading">
        <div>
          <span className="module-counter">Módulo {activeIndex + 1} de {totalModules}</span>
          <h1>{module.title}</h1>
          <p>{module.subtitle}</p>
        </div>
        <div className="module-watermark" aria-hidden="true">
          <AstroWheel />
        </div>
      </div>

      <div className="field-stack">
        {module.fields.map((field) => {
          const fieldValue = values[field.id];
          const Icon = fieldIcons[field.id as keyof typeof fieldIcons] ?? module.icon;
          const textValue = typeof fieldValue === "string" ? fieldValue : "";

          return (
            <section className={fieldClassName(field.id, field.layout)} key={field.id}>
              <div className="field-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.7} />
              </div>
              <div className="field-body">
                <div className="field-copy">
                  <label htmlFor={field.id}>{field.label}</label>
                  {field.optional ? <span>Opcional</span> : null}
                </div>
                {field.helper ? <p className="field-helper">{field.helper}</p> : null}

                {field.type === "single" || field.type === "multi" ? (
                  <ChoiceGroup
                    field={field}
                    onChange={(value) => onUpdate(field.id, value)}
                    value={fieldValue}
                  />
                ) : null}

                {field.type === "select" ? (
                  <select
                    id={field.id}
                    onChange={(event) => onUpdate(field.id, event.target.value)}
                    value={textValue}
                  >
                    <option value="">{field.placeholder || "Selecione"}</option>
                    {field.options?.map((option) => (
                      <option key={option.label} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                {["text", "date", "time"].includes(field.type) ? (
                  <input
                    id={field.id}
                    maxLength={field.maxLength}
                    onChange={(event) => onUpdate(field.id, event.target.value)}
                    placeholder={field.placeholder}
                    type={field.type}
                    value={textValue}
                  />
                ) : null}

                {field.type === "textarea" ? (
                  <div className="textarea-wrap">
                    <textarea
                      id={field.id}
                      maxLength={field.maxLength}
                      onChange={(event) => onUpdate(field.id, event.target.value)}
                      placeholder={field.placeholder}
                      rows={4}
                      value={textValue}
                    />
                    {field.maxLength ? (
                      <span className="char-count">
                        {textValue.length} / {field.maxLength}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {field.id === "ascendant" ? (
                  <div className="ascendant-note" aria-hidden="true">
                    <AstroWheel />
                    <p>O ascendente revela a forma como você se apresenta ao mundo e sua energia inicial.</p>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <div className="module-actions">
        <button className="button button--ghost" disabled={activeIndex === 0} onClick={onBack} type="button">
          <ChevronLeft size={18} />
          Voltar
        </button>
        <button className="button button--primary" onClick={onNext} type="button">
          {activeIndex === totalModules - 1 ? "Gerar leitura" : "Próximo passo"}
          <ChevronRight size={18} />
        </button>
      </div>
    </main>
  );
}
