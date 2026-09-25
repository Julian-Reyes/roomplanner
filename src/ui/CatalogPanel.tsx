import { useState } from "react";
import type { Category, FurnitureItem } from "../model/types";
import { CATEGORIES, PRESETS, type Preset } from "../model/catalog";
import { itemFromPreset, uid } from "../model/factory";
import { findFreeSpot } from "../geometry/snap";
import { activeLayout, addItem, showToast, useStore } from "../state/store";
import { useT, type TKey } from "../i18n";
import { Icon } from "./Icon";
import { NumberField } from "./fields";

const GROUPS: Preset["group"][] = ["bedsBR", "bedsUS", "storage", "work", "living"];

/** Adds an item at the most central free spot, or to the staging area if the room is full. */
function place(item: FurnitureItem, stagedMsg: string) {
  const s = useStore.getState();
  const spot = findFreeSpot(s.project.room, activeLayout(s.project).items, item.width, item.depth, item.category === "rug");
  if (spot) addItem({ ...item, x: spot.x, y: spot.y, staged: false });
  else {
    addItem({ ...item, staged: true });
    showToast(stagedMsg);
  }
}

export function CatalogPanel() {
  const t = useT();
  return (
    <div className="panel">
      <p className="muted small">{t("catalog.hint")}</p>
      {GROUPS.map((g) => (
        <section key={g} className="card">
          <div className="card-title">{t(`group.${g}` as TKey)}</div>
          <div className="catalog-grid">
            {PRESETS.filter((p) => p.group === g).map((p) => (
              <button key={p.id} className="catalog-item" onClick={() => place(itemFromPreset(p), t("catalog.staged"))}>
                <span className="swatch" style={{ background: p.color }} />
                <span className="catalog-name">{t(`preset.${p.id}` as TKey)}</span>
                <span className="catalog-dims">
                  {p.width}×{p.depth}
                  {p.category !== "rug" && <> · h{p.height}</>}
                  {p.front > 0 && <span className="catalog-front"> · ↧{p.front}</span>}
                </span>
                <Icon name="plus" size={14} />
              </button>
            ))}
          </div>
        </section>
      ))}
      <CustomItem />
    </div>
  );
}

function CustomItem() {
  const t = useT();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [w, setW] = useState(60);
  const [d, setD] = useState(60);
  const [h, setH] = useState(80);
  const [front, setFront] = useState(0);
  return (
    <section className="card">
      <div className="card-title">{t("catalog.custom")}</div>
      <label className="field">
        <span className="field-label">{t("catalog.customName")}</span>
        <input type="text" value={name} placeholder={t("catalog.customDefault")} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">{t("item.category")}</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`cat.${c}` as TKey)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid2">
        <NumberField label={t("item.width")} value={w} min={5} max={1000} onChange={setW} />
        <NumberField label={t("item.depth")} value={d} min={5} max={1000} onChange={setD} />
        <NumberField label={t("item.height")} value={h} min={0.5} max={400} onChange={setH} />
        <NumberField label={t("catalog.front")} value={front} min={0} max={300} onChange={setFront} />
      </div>
      <button
        className="btn btn-primary"
        onClick={() =>
          place(
            {
              id: uid("item"),
              category,
              name: name.trim() || t("catalog.customDefault"),
              x: 0,
              y: 0,
              width: w,
              depth: d,
              height: h,
              rotation: 0,
              clearance: { front },
              color: "#b9b3a9",
              staged: false,
            },
            t("catalog.staged"),
          )
        }
      >
        <Icon name="plus" /> {t("catalog.addCustom")}
      </button>
    </section>
  );
}
