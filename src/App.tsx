import { useEffect, useState, useSyncExternalStore } from "react";
import { checksFor } from "./checks";
import { normAngle } from "./geometry/vec";
import { activeLayout, duplicateItem, redo, removeItem, select, setPanel, undo, updateItem, useStore, type Panel } from "./state/store";
import { useT, type TKey } from "./i18n";
import { Header } from "./ui/Header";
import { LayoutTabs } from "./ui/LayoutTabs";
import { ChecksPanel } from "./ui/ChecksPanel";
import { RoomPanel } from "./ui/RoomPanel";
import { CatalogPanel } from "./ui/CatalogPanel";
import { Inspector } from "./ui/Inspector";
import { CompareModal } from "./ui/CompareModal";
import { Icon } from "./ui/Icon";
import { PlanView } from "./plan/PlanView";
import { Scene3D } from "./three/Scene3D";

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
  );
}

const PANEL_ICON: Record<Panel, string> = { checks: "check", room: "wall", furniture: "plus", item: "box" };

export function App() {
  const t = useT();
  const mobile = useMedia("(max-width: 820px)");
  const wide = useMedia("(min-width: 1360px)");
  const panel = useStore((s) => s.panel);
  const [sheetOpen, setSheetOpen] = useState(false);
  useShortcuts();

  // With a dedicated checks column, the side panel doesn't need a Checks tab.
  const tabs: Panel[] = wide && !mobile ? ["room", "furniture", "item"] : ["checks", "room", "furniture", "item"];
  const current = tabs.includes(panel) ? panel : tabs[0];

  return (
    <div className={`app ${mobile ? "is-mobile" : ""}`}>
      <Header />
      <LayoutTabs />
      <main className="main">
        {!mobile && (
          <aside className="side">
            <PanelTabs tabs={tabs} current={current} onPick={setPanel} />
            <div className="side-body">
              <PanelBody panel={current} />
            </div>
          </aside>
        )}
        <section className="views">
          <div className="pane pane-plan">
            <div className="pane-label">{t("plan.title")}</div>
            <PlanView />
            {!mobile && <div className="pane-hint">{t("plan.hint")}</div>}
          </div>
          <div className="pane pane-3d">
            <Scene3D />
          </div>
        </section>
        {wide && !mobile && (
          <aside className="side side-right">
            <div className="side-title">{t("checks.title")}</div>
            <div className="side-body">
              <ChecksPanel />
            </div>
          </aside>
        )}
      </main>
      {mobile && (
        <>
          {sheetOpen && (
            <div className="sheet">
              <div className="sheet-head">
                <strong>{t(`tab.${current}` as TKey)}</strong>
                <button className="icon-btn" onClick={() => setSheetOpen(false)} aria-label={t("common.close")}>
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="sheet-body">
                <PanelBody panel={current} />
              </div>
            </div>
          )}
          <nav className="bottom-nav">
            {tabs.map((p) => (
              <button
                key={p}
                className={sheetOpen && current === p ? "on" : ""}
                onClick={() => {
                  if (sheetOpen && current === p) setSheetOpen(false);
                  else {
                    setPanel(p);
                    setSheetOpen(true);
                  }
                }}
              >
                <Icon name={PANEL_ICON[p]} size={18} />
                <span>{t(`tab.${p}` as TKey)}</span>
                {p === "checks" && <IssueBadge />}
              </button>
            ))}
          </nav>
        </>
      )}
      <CompareModal />
      <Toast />
    </div>
  );
}

function PanelTabs({ tabs, current, onPick }: { tabs: Panel[]; current: Panel; onPick: (p: Panel) => void }) {
  const t = useT();
  return (
    <div className="panel-tabs" role="tablist">
      {tabs.map((p) => (
        <button key={p} role="tab" aria-selected={p === current} className={p === current ? "on" : ""} onClick={() => onPick(p)}>
          {t(`tab.${p}` as TKey)}
          {p === "checks" && <IssueBadge />}
        </button>
      ))}
    </div>
  );
}

function IssueBadge() {
  const project = useStore((s) => s.project);
  const issues = checksFor(project.room, activeLayout(project).items);
  const errors = issues.filter((i) => i.severity === "error").length;
  if (!issues.length) return null;
  return <span className={`badge ${errors ? "error" : "warning"}`}>{issues.length}</span>;
}

function PanelBody({ panel }: { panel: Panel }) {
  if (panel === "checks") return <ChecksPanel />;
  if (panel === "room") return <RoomPanel />;
  if (panel === "furniture") return <CatalogPanel />;
  return <Inspector />;
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id} role="status">
      {toast.text}
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const s = useStore.getState();
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      // Walk mode uses WASD / arrows to move, so leave those alone there.
      if (s.view.camera === "walk") return;
      const item = activeLayout(s.project).items.find((i) => i.id === s.selectedId);
      if (!item) return;
      if (e.key === "Escape") select(null);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeItem(item.id);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateItem(item.id);
      } else if (!mod && e.key.toLowerCase() === "r" && !item.staged) {
        updateItem(item.id, { rotation: normAngle(item.rotation + (e.shiftKey ? -90 : 90)) });
      } else if (e.key.startsWith("Arrow") && !item.staged) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateItem(item.id, { x: item.x + dx, y: item.y + dy });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
