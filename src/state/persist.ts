import LZString from "lz-string";
import { SCHEMA_VERSION, type Project } from "../model/types";
import { makeDemoProject } from "../model/demo";
import { makeT } from "../i18n";
import { replaceProject, showToast, useStore, type Lang } from "./store";

const KEY = "cabe.project";
const LANG_KEY = "cabe.lang";
const HASH_PREFIX = "#p=";

/**
 * Checks that parsed JSON looks like a project and upgrades older versions.
 * Every future schema change adds a step here (v1 → v2 ...), so saved files
 * and old share links keep working.
 */
export function migrate(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Project>;
  if (typeof p.schemaVersion !== "number" || p.schemaVersion > SCHEMA_VERSION) return null;
  if (!p.room || !Array.isArray(p.room.outline) || p.room.outline.length < 3) return null;
  if (!Array.isArray(p.layouts) || p.layouts.length === 0) return null;
  const project = p as Project;
  if (!project.layouts.some((l) => l.id === project.activeLayoutId)) project.activeLayoutId = project.layouts[0].id;
  project.room.openings ??= [];
  for (const l of project.layouts) {
    l.notes ??= "";
    for (const i of l.items) {
      i.clearance ??= { front: 0 };
      i.staged ??= false;
    }
  }
  return project;
}

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "pt") return saved;
  } catch {
    /* storage blocked */
  }
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

function demoProject(lang: Lang): Project {
  const p = makeDemoProject();
  if (lang === "pt") {
    p.name = "Quarto de demonstração";
    p.layouts[0].name = "Atual";
  }
  return p;
}

/** Reads a shared project from the URL hash (and clears the hash so reloads don't re-import it). */
function projectFromHash(): Project | null {
  if (!location.hash.startsWith(HASH_PREFIX)) return null;
  let project: Project | null = null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(location.hash.slice(HASH_PREFIX.length));
    project = json ? migrate(JSON.parse(json)) : null;
  } catch {
    project = null;
  }
  history.replaceState(null, "", location.pathname + location.search);
  return project;
}

/** Loads (in order): a shared link in the URL, the last autosave, or the demo. */
export function initStore() {
  const lang = detectLang();
  let project = projectFromHash();
  const fromLink = !!project;
  if (!project) {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) project = migrate(JSON.parse(saved));
    } catch {
      project = null;
    }
  }
  useStore.setState({ project: project ?? demoProject(lang), lang });
  if (fromLink) setTimeout(() => showToast(makeT(lang)("toast.sharedLoaded")), 300);

  // A share link pasted into a tab that already has the app open only changes
  // the hash (no page load), so listen for that too. Undo brings back your project.
  window.addEventListener("hashchange", () => {
    const shared = projectFromHash();
    if (!shared) return;
    replaceProject(shared);
    showToast(makeT(useStore.getState().lang)("toast.sharedLoaded"));
  });

  // Autosave, debounced so dragging doesn't write on every frame.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  useStore.subscribe((s, prev) => {
    if (s.lang !== prev.lang) {
      try { localStorage.setItem(LANG_KEY, s.lang); } catch { /* ignore */ }
    }
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(useStore.getState().project));
      } catch {
        if (!warned) showToast(makeT(useStore.getState().lang)("toast.saveFailed"));
        warned = true;
      }
    }, 400);
  });
}

export function loadDemo() {
  replaceProject(demoProject(useStore.getState().lang));
}

export function shareLink(): string {
  const json = JSON.stringify(useStore.getState().project);
  return `${location.origin}${location.pathname}${HASH_PREFIX}${LZString.compressToEncodedURIComponent(json)}`;
}

export function exportJson() {
  const p = useStore.getState().project;
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(p.name || "room").replace(/[^\w-]+/g, "-").toLowerCase()}.cabe.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importJson(file: File): Promise<boolean> {
  try {
    const project = migrate(JSON.parse(await file.text()));
    if (!project) return false;
    replaceProject(project);
    return true;
  } catch {
    return false;
  }
}
