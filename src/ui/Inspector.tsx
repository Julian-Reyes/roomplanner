import { useEffect, useState } from "react";
import type { Category, FurnitureItem } from "../model/types";
import { CATEGORIES } from "../model/catalog";
import { findFreeSpot } from "../geometry/snap";
import { normAngle } from "../geometry/vec";
import { activeLayout, duplicateItem, removeItem, updateItem, useStore } from "../state/store";
import { itemName, useT, type TKey } from "../i18n";
import { Icon } from "./Icon";
import { NumberField } from "./fields";

export function Inspector() {
  const t = useT();
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedId);
  const item = activeLayout(project).items.find((i) => i.id === selectedId);
  if (!item) return <div className="panel"><p className="muted empty">{t("item.none")}</p></div>;
  return <ItemEditor key={item.id} item={item} />;
}

function ItemEditor({ item }: { item: FurnitureItem }) {
  const t = useT();
  const set = (patch: Partial<FurnitureItem>) => updateItem(item.id, patch);
  const [name, setName] = useState(itemName(item, t));
  useEffect(() => setName(itemName(item, t)), [item, t]);

  const toggleStaged = () => {
    if (item.staged) {
      const s = useStore.getState();
      const spot = findFreeSpot(s.project.room, activeLayout(s.project).items, item.width, item.depth, item.category === "rug");
      set({ staged: false, ...(spot ?? {}) });
    } else set({ staged: true });
  };

  return (
    <div className="panel">
      <section className="card">
        <label className="field">
          <span className="field-label">{t("item.name")}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim();
              if (n && n !== itemName(item, t)) set({ name: n });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <div className="grid2">
          <label className="field">
            <span className="field-label">{t("item.category")}</span>
            <select value={item.category} onChange={(e) => set({ category: e.target.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cat.${c}` as TKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t("item.color")}</span>
            <input type="color" value={item.color} onChange={(e) => set({ color: e.target.value })} />
          </label>
        </div>
        <div className="grid3">
          <NumberField label={t("item.width")} value={item.width} min={5} max={1000} onChange={(width) => set({ width })} />
          <NumberField label={t("item.depth")} value={item.depth} min={5} max={1000} onChange={(depth) => set({ depth })} />
          <NumberField label={t("item.height")} value={item.height} min={0.5} max={400} onChange={(height) => set({ height })} />
        </div>
        {!item.staged && (
          <div className="grid3">
            <NumberField label={t("item.x")} value={item.x} onChange={(x) => set({ x })} />
            <NumberField label={t("item.y")} value={item.y} onChange={(y) => set({ y })} />
            <NumberField label={t("item.rotation")} value={item.rotation} suffix="°" step={15} onChange={(r) => set({ rotation: normAngle(r) })} />
          </div>
        )}
        <NumberField label={t("item.front")} title={t("item.frontHint")} value={item.clearance.front} min={0} max={300} onChange={(front) => set({ clearance: { ...item.clearance, front } })} />
        <p className="muted small">{t("item.frontHint")}</p>
        {item.staged && <p className="note">{t("item.stagedNote")}</p>}
      </section>
      <div className="btn-row">
        {!item.staged && (
          <button className="btn btn-soft" onClick={() => set({ rotation: normAngle(item.rotation + 90) })}>
            <Icon name="rotate" /> {t("item.rotate90")}
          </button>
        )}
        <button className="btn btn-soft" onClick={() => duplicateItem(item.id)}>
          <Icon name="copy" /> {t("item.duplicate")}
        </button>
        <button className="btn btn-soft" onClick={toggleStaged}>
          <Icon name={item.staged ? "in" : "out"} /> {item.staged ? t("item.place") : t("item.stage")}
        </button>
        <button className="btn btn-danger" onClick={() => removeItem(item.id)}>
          <Icon name="trash" /> {t("item.delete")}
        </button>
      </div>
      <p className="muted small keys-hint">{t("item.keys")}</p>
    </div>
  );
}
