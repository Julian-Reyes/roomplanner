import { useEffect, useState } from "react";
import { checksFor, scoreFor } from "../checks";
import { setCompareOpen, toggleRecommended, useStore } from "../state/store";
import { useT } from "../i18n";
import { PlanView } from "../plan/PlanView";
import { Icon } from "./Icon";
import { ScoreRing } from "./fields";
import { IssueList } from "./ChecksPanel";

export function CompareModal() {
  const t = useT();
  const open = useStore((s) => s.compareOpen);
  const project = useStore((s) => s.project);
  const layouts = project.layouts;
  const [left, setLeft] = useState(project.activeLayoutId);
  const [right, setRight] = useState(() => layouts.find((l) => l.id !== project.activeLayoutId)?.id ?? layouts[0].id);

  useEffect(() => {
    if (!open) return;
    // Default: the layout you're on vs. the recommended one (or the next one).
    const a = project.activeLayoutId;
    const b = project.recommendedLayoutId && project.recommendedLayoutId !== a ? project.recommendedLayoutId : layouts.find((l) => l.id !== a)?.id ?? a;
    setLeft(a);
    setRight(b);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setCompareOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const scores = Object.fromEntries(layouts.map((l) => [l.id, scoreFor(checksFor(project.room, l.items))]));

  return (
    <div className="modal-back" onClick={() => setCompareOpen(false)}>
      <div className="modal compare" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label={t("compare.title")}>
        <div className="modal-head">
          <h2>{t("compare.title")}</h2>
          <button className="icon-btn" onClick={() => setCompareOpen(false)} aria-label={t("compare.close")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="compare-cols">
          {[
            [left, setLeft],
            [right, setRight],
          ].map(([id, setId], col) => {
            const layout = layouts.find((l) => l.id === id) ?? layouts[0];
            const issues = checksFor(project.room, layout.items);
            const other = col === 0 ? right : left;
            const better = scores[layout.id] > (scores[other as string] ?? -1);
            return (
              <div className="compare-col" key={col}>
                <div className="compare-head">
                  <ScoreRing score={scores[layout.id]} size={52} />
                  <div className="compare-title">
                    <select value={layout.id} onChange={(e) => (setId as (v: string) => void)(e.target.value)}>
                      {layouts.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <div className="muted small">
                      {t("compare.issues", { n: issues.length })}
                      {better && <span className="better"> · {t("compare.better")}</span>}
                    </div>
                  </div>
                  <button
                    className={`icon-btn star ${project.recommendedLayoutId === layout.id ? "on" : ""}`}
                    onClick={() => toggleRecommended(layout.id)}
                    title={t("layouts.recommend")}
                    aria-label={t("layouts.recommend")}
                  >
                    <Icon name="star" size={18} />
                  </button>
                </div>
                <div className="compare-plan">
                  <PlanView layoutId={layout.id} />
                </div>
                <IssueList issues={issues} layout={layout} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
