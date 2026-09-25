import { useEffect, useRef, useState } from "react";
import type { Layout } from "../model/types";
import {
  addLayout, deleteLayout, duplicateLayout, renameLayout, setActiveLayout, setCompareOpen, toggleRecommended, useStore,
} from "../state/store";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import { scoreClass } from "./fields";
import { useLayoutScore } from "./ChecksPanel";

export function LayoutTabs() {
  const t = useT();
  const project = useStore((s) => s.project);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuFor = menu?.id ?? null;
  const setMenuFor = (v: null) => setMenu(v);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuFor]);

  return (
    <nav className="tabs" aria-label="Layouts">
      <div className="tabs-scroll">
        {project.layouts.map((l) => (
          <Tab
            key={l.id}
            layout={l}
            active={l.id === project.activeLayoutId}
            recommended={l.id === project.recommendedLayoutId}
            editing={editing === l.id}
            onStopEditing={() => setEditing(null)}
            onMenu={(r) => setMenu(menuFor === l.id ? null : { id: l.id, x: Math.min(r.left, window.innerWidth - 240), y: r.bottom + 4 })}
          />
        ))}
        <button className="tab tab-add" onClick={() => addLayout(t("layouts.untitled", { n: project.layouts.length + 1 }))} title={t("layouts.new")}>
          <Icon name="plus" size={15} />
          <span className="hide-xs">{t("layouts.new")}</span>
        </button>
      </div>
      {menu && (() => {
        const l = project.layouts.find((x) => x.id === menu.id);
        if (!l) return null;
        return (
          <div className="menu-pop tab-menu" role="menu" ref={menuRef} style={{ left: menu.x, top: menu.y }} onClick={() => setMenuFor(null)}>
            <button role="menuitem" onClick={() => setEditing(l.id)}>
              <Icon name="edit" /> {t("layouts.rename")}
            </button>
            <button role="menuitem" onClick={() => duplicateLayout(l.id, t("layouts.copyOf", { name: l.name }))}>
              <Icon name="copy" /> {t("layouts.duplicate")}
            </button>
            <button role="menuitem" onClick={() => toggleRecommended(l.id)}>
              <Icon name="star" /> {l.id === project.recommendedLayoutId ? `✓ ${t("layouts.recommended")}` : t("layouts.recommend")}
            </button>
            <button
              role="menuitem"
              className="danger"
              disabled={project.layouts.length <= 1}
              onClick={() => confirm(t("layouts.deleteConfirm", { name: l.name })) && deleteLayout(l.id)}
            >
              <Icon name="trash" /> {t("layouts.delete")}
            </button>
          </div>
        );
      })()}
      <button className="btn btn-soft btn-sm" onClick={() => setCompareOpen(true)} disabled={project.layouts.length < 2}>
        <Icon name="compare" /> <span className="hide-xs">{t("layouts.compare")}</span>
      </button>
    </nav>
  );
}

function Tab({
  layout, active, recommended, editing, onStopEditing, onMenu,
}: {
  layout: Layout;
  active: boolean;
  recommended: boolean;
  editing: boolean;
  onStopEditing: () => void;
  onMenu: (anchor: DOMRect) => void;
}) {
  const t = useT();
  const room = useStore((s) => s.project.room);
  const score = useLayoutScore(room, layout);
  const [name, setName] = useState(layout.name);
  useEffect(() => setName(layout.name), [layout.name, editing]);

  return (
    <div className={`tab ${active ? "active" : ""}`}>
      {editing ? (
        <input
          className="tab-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            if (name.trim() && name.trim() !== layout.name) renameLayout(layout.id, name.trim());
            onStopEditing();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setName(layout.name);
              onStopEditing();
            }
          }}
        />
      ) : (
        <button className="tab-main" onClick={() => setActiveLayout(layout.id)} onDoubleClick={(e) => active && onMenu(e.currentTarget.getBoundingClientRect())} title={layout.notes || layout.name}>
          {recommended && (
            <span className="tab-star" title={t("layouts.recommended")}>
              <Icon name="star" size={13} />
            </span>
          )}
          <span className="tab-name">{layout.name}</span>
          <span className={`score-pill ${scoreClass(score)}`} title={t("layouts.score")}>{score}</span>
        </button>
      )}
      {active && !editing && (
        <button className="tab-more" onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())} aria-label={t("app.more")} title={t("app.more")}>
          <Icon name="more" size={15} />
        </button>
      )}
    </div>
  );
}
