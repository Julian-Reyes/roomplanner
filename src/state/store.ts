import { create } from "zustand";
import type { FurnitureItem, Issue, Layout, Project, Room } from "../model/types";
import { uid } from "../model/factory";

export type Lang = "en" | "pt";
export type Panel = "checks" | "room" | "furniture" | "item";
/** "wall-2" = looking straight at wall index 2. */
export type CameraMode = "orbit" | "top" | "walk" | `wall-${number}`;

export interface Highlight {
  issueId: string | null;
  itemIds: string[];
  openingIds: string[];
  marker?: Issue["marker"];
}

export interface ViewSettings {
  camera: CameraMode;
  evening: boolean;
  /** Door opening angle, 0–90°. */
  door: number;
  /** 0 = blinds up, 1 = fully down. */
  blinds: number;
  child: boolean;
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  /** Project as it was when the current drag started (one undo step per drag). */
  gestureStart: Project | null;
  selectedId: string | null;
  selectedOpeningId: string | null;
  highlight: Highlight;
  lang: Lang;
  panel: Panel;
  view: ViewSettings;
  compareOpen: boolean;
  toast: { id: number; text: string } | null;
}

const NO_HIGHLIGHT: Highlight = { issueId: null, itemIds: [], openingIds: [] };
const HISTORY_LIMIT = 100;

export const activeLayout = (p: Project): Layout => p.layouts.find((l) => l.id === p.activeLayoutId) ?? p.layouts[0];

export const useStore = create<State>(() => ({
  project: null as unknown as Project, // set by initStore() before first render
  past: [],
  future: [],
  gestureStart: null,
  selectedId: null,
  selectedOpeningId: null,
  highlight: NO_HIGHLIGHT,
  lang: "en",
  panel: "checks",
  view: { camera: "orbit", evening: false, door: 35, blinds: 0.15, child: false },
  compareOpen: false,
  toast: null,
}));

const set = useStore.setState;
const get = useStore.getState;

/** Replace the project. Records an undo step unless we're mid-drag or told not to. */
export function apply(fn: (p: Project) => Project, history = true) {
  const s = get();
  const next = fn(s.project);
  if (next === s.project) return;
  if (history && !s.gestureStart) {
    set({ project: next, past: [...s.past, s.project].slice(-HISTORY_LIMIT), future: [] });
  } else {
    set({ project: next });
  }
}

export function beginGesture() {
  set({ gestureStart: get().project });
}

export function endGesture() {
  const s = get();
  if (!s.gestureStart) return;
  if (s.gestureStart !== s.project) {
    set({ past: [...s.past, s.gestureStart].slice(-HISTORY_LIMIT), future: [], gestureStart: null });
  } else {
    set({ gestureStart: null });
  }
}

export function undo() {
  const s = get();
  const prev = s.past[s.past.length - 1];
  if (!prev) return;
  set({ project: prev, past: s.past.slice(0, -1), future: [s.project, ...s.future], highlight: NO_HIGHLIGHT });
  dropStaleSelection();
}

export function redo() {
  const s = get();
  const next = s.future[0];
  if (!next) return;
  set({ project: next, future: s.future.slice(1), past: [...s.past, s.project], highlight: NO_HIGHLIGHT });
  dropStaleSelection();
}

function dropStaleSelection() {
  const s = get();
  if (s.selectedId && !activeLayout(s.project).items.some((i) => i.id === s.selectedId)) set({ selectedId: null });
}

export function replaceProject(p: Project, keepHistory = true) {
  const s = get();
  set({
    project: p,
    past: keepHistory ? [...s.past, s.project].slice(-HISTORY_LIMIT) : [],
    future: [],
    selectedId: null,
    selectedOpeningId: null,
    highlight: NO_HIGHLIGHT,
  });
}

// ---------- items (always in the active layout) ----------

function mapActiveItems(p: Project, fn: (items: FurnitureItem[]) => FurnitureItem[]): Project {
  return {
    ...p,
    layouts: p.layouts.map((l) => (l.id === p.activeLayoutId ? { ...l, items: fn(l.items) } : l)),
  };
}

export function updateItem(id: string, patch: Partial<FurnitureItem>, history = true) {
  apply((p) => mapActiveItems(p, (items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i))), history);
}

export function addItem(item: FurnitureItem) {
  apply((p) => mapActiveItems(p, (items) => [...items, item]));
  set({ selectedId: item.id, panel: "item" });
}

export function removeItem(id: string) {
  apply((p) => mapActiveItems(p, (items) => items.filter((i) => i.id !== id)));
  if (get().selectedId === id) set({ selectedId: null });
  set({ highlight: NO_HIGHLIGHT });
}

export function duplicateItem(id: string) {
  const it = activeLayout(get().project).items.find((i) => i.id === id);
  if (!it) return;
  addItem({ ...it, id: uid("item"), x: it.x + 20, y: it.y + 20 });
}

export function select(id: string | null, openPanel = true) {
  const s = get();
  if (id === s.selectedId) return;
  set({ selectedId: id, selectedOpeningId: null, ...(id && openPanel ? { panel: "item" as Panel } : {}) });
}

export function selectOpening(id: string | null) {
  set({ selectedOpeningId: id, selectedId: null });
}

export function toggleIssue(issue: Issue | null) {
  const s = get();
  if (!issue || s.highlight.issueId === issue.id) return set({ highlight: NO_HIGHLIGHT });
  set({ highlight: { issueId: issue.id, itemIds: issue.itemIds, openingIds: issue.openingIds, marker: issue.marker } });
}

export function clearHighlight() {
  set({ highlight: NO_HIGHLIGHT });
}

// ---------- room ----------

export function updateRoom(fn: (r: Room) => Room, history = true) {
  apply((p) => ({ ...p, room: fn(p.room) }), history);
}

// ---------- layouts ----------

export function setActiveLayout(id: string) {
  apply((p) => (p.activeLayoutId === id ? p : { ...p, activeLayoutId: id }), false);
  set({ selectedId: null, highlight: NO_HIGHLIGHT });
}

export function addLayout(name: string) {
  const l: Layout = { id: uid("layout"), name, notes: "", items: [] };
  apply((p) => ({ ...p, layouts: [...p.layouts, l], activeLayoutId: l.id }));
  set({ selectedId: null, highlight: NO_HIGHLIGHT, panel: "furniture" });
}

export function duplicateLayout(id: string, name: string) {
  const src = get().project.layouts.find((l) => l.id === id);
  if (!src) return;
  // Items keep their ids (they live in a different layout), so issue
  // highlighting and 3D objects stay stable when you flip between copies.
  const l: Layout = { ...src, id: uid("layout"), name, items: src.items.map((i) => ({ ...i })) };
  apply((p) => {
    const at = p.layouts.findIndex((x) => x.id === id);
    const layouts = [...p.layouts];
    layouts.splice(at + 1, 0, l);
    return { ...p, layouts, activeLayoutId: l.id };
  });
  set({ selectedId: null, highlight: NO_HIGHLIGHT });
}

export function renameLayout(id: string, name: string) {
  apply((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === id ? { ...l, name } : l)) }));
}

export function setLayoutNotes(id: string, notes: string) {
  apply((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === id ? { ...l, notes } : l)) }));
}

export function deleteLayout(id: string) {
  apply((p) => {
    if (p.layouts.length <= 1) return p;
    const layouts = p.layouts.filter((l) => l.id !== id);
    return {
      ...p,
      layouts,
      activeLayoutId: p.activeLayoutId === id ? layouts[0].id : p.activeLayoutId,
      recommendedLayoutId: p.recommendedLayoutId === id ? null : p.recommendedLayoutId,
    };
  });
  set({ selectedId: null, highlight: NO_HIGHLIGHT });
}

export function toggleRecommended(id: string) {
  apply((p) => ({ ...p, recommendedLayoutId: p.recommendedLayoutId === id ? null : id }));
}

// ---------- UI ----------

export function setLang(lang: Lang) {
  set({ lang });
}
export function setPanel(panel: Panel) {
  set({ panel });
}
export function setView(patch: Partial<ViewSettings>) {
  set({ view: { ...get().view, ...patch } });
}
export function setCompareOpen(compareOpen: boolean) {
  set({ compareOpen });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(text: string) {
  const id = Date.now();
  set({ toast: { id, text } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (get().toast?.id === id) set({ toast: null });
  }, 2600);
}
