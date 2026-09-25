import { useEffect, useState } from "react";
import type { Issue, Layout, Room, Severity } from "../model/types";
import { checksFor, scoreFor } from "../checks";
import { activeLayout, setLayoutNotes, toggleIssue, useStore } from "../state/store";
import { issueText, useT } from "../i18n";
import { Icon } from "./Icon";
import { ScoreRing } from "./fields";

const SEV_ICON: Record<Severity, string> = { error: "error", warning: "alert", info: "info" };

export function ChecksPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const activeIssue = useStore((s) => s.highlight.issueId);
  const layout = activeLayout(project);
  const issues = checksFor(project.room, layout.items);
  const score = scoreFor(issues);
  const unplaced = layout.items.filter((i) => i.staged).length;
  const count = (s: Severity) => issues.filter((i) => i.severity === s).length;

  return (
    <div className="panel checks">
      <div className="score-card">
        <ScoreRing score={score} />
        <div>
          <div className="score-title">{t("checks.score")}</div>
          <div className="score-counts">
            <span className="sev error">
              <Icon name="error" size={13} /> {count("error")}
            </span>
            <span className="sev warning">
              <Icon name="alert" size={13} /> {count("warning")}
            </span>
            <span className="sev info">
              <Icon name="info" size={13} /> {count("info")}
            </span>
          </div>
          <div className="muted small">{t("checks.scoreHint")}</div>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="all-clear">
          <Icon name="check" size={18} /> {t("checks.allClear")}
        </div>
      ) : (
        <>
          <p className="muted small">{t("checks.clickHint")}</p>
          <IssueList issues={issues} layout={layout} activeId={activeIssue} onClick={toggleIssue} />
        </>
      )}
      {unplaced > 0 && <p className="muted small">{t("checks.unplaced", { n: unplaced })}</p>}

      <Notes layout={layout} />
    </div>
  );
}

export function IssueList({ issues, layout, activeId, onClick }: { issues: Issue[]; layout: Layout; activeId?: string | null; onClick?: (i: Issue) => void }) {
  const t = useT();
  return (
    <ul className="issues">
      {issues.map((i) => (
        <li key={i.id}>
          <button
            className={`issue ${i.severity} ${i.id === activeId ? "active" : ""}`}
            onClick={onClick ? () => onClick(i) : undefined}
            disabled={!onClick}
          >
            <Icon name={SEV_ICON[i.severity]} size={15} />
            <span>{issueText(i, layout.items, t)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Notes({ layout }: { layout: Layout }) {
  const t = useT();
  const [draft, setDraft] = useState(layout.notes);
  useEffect(() => setDraft(layout.notes), [layout.id, layout.notes]);
  return (
    <label className="field notes">
      <span className="field-label">
        {t("layouts.notes")} · {layout.name}
      </span>
      <textarea
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== layout.notes && setLayoutNotes(layout.id, draft)}
      />
    </label>
  );
}

export function useLayoutScore(room: Room, layout: Layout) {
  return scoreFor(checksFor(room, layout.items));
}
