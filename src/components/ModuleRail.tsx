import { Check } from "lucide-react";
import { AstroWheel, DecorativeRule } from "./Ornaments";
import { formModules } from "../data/formSchema";
import { FormState } from "../lib/symbolicEngine";

interface ModuleRailProps {
  activeIndex: number;
  values: FormState;
  onSelect: (index: number) => void;
}

const moduleProgress = (moduleId: string, values: FormState) => {
  const module = formModules.find((item) => item.id === moduleId);
  if (!module) return 0;
  const requiredFields = module.fields.filter((field) => !field.optional);
  const answered = requiredFields.filter((field) => {
    const value = values[field.id];
    return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim();
  }).length;

  return Math.round((answered / requiredFields.length) * 100);
};

export function ModuleRail({ activeIndex, values, onSelect }: ModuleRailProps) {
  const progress = Math.round(
    formModules.reduce((total, module) => total + moduleProgress(module.id, values), 0) /
      formModules.length,
  );

  return (
    <aside className="module-rail" aria-label="Módulos do formulário">
      <div className="rail-heading">
        <span>Sua jornada</span>
        <strong>7 módulos</strong>
      </div>
      <DecorativeRule />

      <nav className="module-list">
        {formModules.map((module, index) => {
          const Icon = module.icon;
          const itemProgress = moduleProgress(module.id, values);
          const isActive = index === activeIndex;
          const isComplete = itemProgress === 100;

          return (
            <button
              className={`module-link ${isActive ? "module-link--active" : ""}`}
              key={module.id}
              onClick={() => onSelect(index)}
              type="button"
            >
              <span className="module-step">
                <span>{index + 1}</span>
              </span>
              <span className="module-link__icon">
                {isComplete ? <Check size={21} /> : <Icon size={22} strokeWidth={1.4} />}
              </span>
              <span className="module-link__text">
                <strong>{module.shortTitle}</strong>
                <span>{module.railSubtitle}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="rail-progress">
        <span>Progresso geral</span>
        <strong>{progress}% concluído</strong>
        <div className="rail-progress__bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="rail-sigil" aria-hidden="true">
        <AstroWheel />
      </div>
    </aside>
  );
}
