import { useEffect, useLayoutEffect, useRef, useState } from "react";

const STAGES = [
  { value: "", label: "All stages" },
  { value: "Localized", label: "Localized" },
  { value: "Regional", label: "Regional" },
  { value: "Distant", label: "Distant" },
];
const SEXES = [
  { value: "", label: "All" },
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
];
const AGES = [
  { value: "0-85", label: "All ages" },
  { value: "0-49", label: "Under 50" },
  { value: "50-64", label: "50–64" },
  { value: "65-74", label: "65–74" },
  { value: "75-85", label: "75+" },
];

const stageLabel = (g) => (g.stage ? g.stage : "All stages");
const sexLabel = (g) => (g.sex ? g.sex : "All");
const ageLabel = (g) => {
  const preset = AGES.find((a) => a.value === `${g.age_min}-${g.age_max}`);
  return preset ? preset.label : `${g.age_min}–${g.age_max}`;
};

// Row of pill options with a highlight that slides to the selected one
function Options({ options, value, onSelect, accent }) {
  const listRef = useRef(null);
  const indRef = useRef(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const ind = indRef.current;
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (!el) {
      ind.style.opacity = 0;
      placed.current = false;
      return;
    }
    ind.style.transition = placed.current ? "" : "none";
    ind.style.opacity = 1;
    ind.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
    ind.style.width = `${el.offsetWidth}px`;
    ind.style.height = `${el.offsetHeight}px`;
    placed.current = true;
  }, [value, options]);

  return (
    <div className="notch-options" ref={listRef} role="radiogroup">
      <span className="notch-indicator" ref={indRef} style={{ background: accent }} aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          data-active={o.value === value} onClick={() => onSelect(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Notch({
  groups, active, errors, palette, visible, canAdd,
  onSelectGroup, onChange, onAdd, onRemove,
}) {
  const [open, setOpen] = useState(null); // "stage" | "sex" | "age" | "group" | null
  const wrapRef = useRef(null);

  // Close the panel on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(null); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (key) => setOpen((o) => (o === key ? null : key));
  const set = (changes, close = true) => {
    onChange(active.id, changes);
    if (close) setOpen(null);
  };
  const setAge = (key, text) => {
    const n = parseInt(text, 10);
    set({ [key]: Number.isNaN(n) ? 0 : Math.min(85, Math.max(0, n)) }, false);
  };

  const trigger = (key, label, value) => (
    <button type="button" className="notch-trigger" aria-expanded={open === key}
      data-open={open === key} onClick={() => toggle(key)}>
      <span className="notch-trigger-label">{label}</span>
      <span className="notch-trigger-value">{value}</span>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 7.5 6 4.5 9 7.5" /></svg>
    </button>
  );

  const panelTitle = { stage: "Stage", sex: "Sex", age: "Age at diagnosis", group: "Edit group" }[open];

  return (
    <div className="notch-wrap" ref={wrapRef} data-visible={visible} inert={!visible}>
      {open && (
        <div className="notch-panel" key={open + active.id}>
          <div className="notch-panel-head">
            <span className="notch-dot" style={{ background: active.color }} />
            <span>{active.name}</span>
            <span className="notch-panel-sep">·</span>
            <span className="notch-panel-title">{panelTitle}</span>
          </div>

          {open === "stage" && (
            <Options options={STAGES} value={active.stage} accent={active.color}
              onSelect={(v) => set({ stage: v })} />
          )}
          {open === "sex" && (
            <Options options={SEXES} value={active.sex} accent={active.color}
              onSelect={(v) => set({ sex: v })} />
          )}
          {open === "age" && (
            <>
              <Options options={AGES} value={`${active.age_min}-${active.age_max}`} accent={active.color}
                onSelect={(v) => {
                  const [age_min, age_max] = v.split("-").map(Number);
                  set({ age_min, age_max });
                }} />
              <div className="notch-custom">
                <span>Custom</span>
                <input type="number" min="0" max="85" value={active.age_min} aria-label="Minimum age"
                  onChange={(e) => setAge("age_min", e.target.value)} />
                <span>to</span>
                <input type="number" min="0" max="85" value={active.age_max} aria-label="Maximum age"
                  onChange={(e) => setAge("age_max", e.target.value)} />
              </div>
            </>
          )}
          {open === "group" && (
            <div className="notch-edit">
              <input type="text" value={active.name} maxLength={30} aria-label="Group name"
                onChange={(e) => set({ name: e.target.value }, false)} />
              <div className="notch-swatches">
                {palette.map((c) => (
                  <button key={c} type="button" className="notch-swatch" style={{ background: c }}
                    data-active={c === active.color} aria-label={`Color ${c}`}
                    onClick={() => set({ color: c }, false)} />
                ))}
                <label className="notch-swatch notch-swatch-custom" title="Custom color">
                  <input type="color" value={active.color}
                    onChange={(e) => set({ color: e.target.value }, false)} />
                </label>
              </div>
              {groups.length > 1 && (
                <button type="button" className="notch-remove"
                  onClick={() => { onRemove(active.id); setOpen(null); }}>
                  Remove group
                </button>
              )}
            </div>
          )}
          {errors[active.id] && <p className="notch-error">{errors[active.id]}</p>}
        </div>
      )}

      <div className="notch">
        <div className="notch-groups">
          {groups.map((g) => {
            const isActive = g.id === active.id;
            return (
              <button key={g.id} type="button" className="notch-chip" data-active={isActive}
                title={isActive ? "Edit name, color, or remove" : `Edit ${g.name}`}
                onClick={() => (isActive ? toggle("group") : onSelectGroup(g.id))}>
                <span className="notch-dot" style={{ background: g.color }} />
                <span className="notch-chip-name">{g.name}</span>
                {errors[g.id] && <span className="notch-chip-warn" aria-label="Has an error">!</span>}
              </button>
            );
          })}
          {canAdd && (
            <button type="button" className="notch-add" onClick={onAdd} aria-label="Add group" title="Add group">
              +
            </button>
          )}
        </div>
        <span className="notch-divider" aria-hidden="true" />
        {trigger("stage", "Stage", stageLabel(active))}
        <span className="notch-divider" aria-hidden="true" />
        {trigger("sex", "Sex", sexLabel(active))}
        <span className="notch-divider" aria-hidden="true" />
        {trigger("age", "Age", ageLabel(active))}
      </div>
    </div>
  );
}
