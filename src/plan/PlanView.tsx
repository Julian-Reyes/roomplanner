import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FurnitureItem, Opening, Vec2 } from "../model/types";
import { bounds } from "../geometry/polygon";
import { footprint } from "../geometry/items";
import { distancesToWalls, snapItem, type Guide, type WallDistance } from "../geometry/snap";
import { getWalls } from "../geometry/room";
import { dot, normAngle, sub } from "../geometry/vec";
import {
  activeLayout, beginGesture, clearHighlight, endGesture, select, selectOpening, setPanel, updateItem, updateRoom, useStore,
} from "../state/store";
import { itemName, useT } from "../i18n";
import { PlanRoom } from "./PlanRoom";
import { PlanItem } from "./PlanItem";
import { inRect, stagingLayout, type Rect } from "./staging";
import { Icon } from "../ui/Icon";
import { walkInput } from "../three/CameraRig";

interface Props {
  /** Show a specific layout read-only (compare view). Defaults to the active layout, editable. */
  layoutId?: string;
}

type Drag =
  | { mode: "move"; id: string; offset: Vec2; moved: boolean }
  | { mode: "rotate"; id: string }
  | { mode: "opening"; id: string; grab: number }
  | { mode: "pan"; start: Vec2; view: Rect; moved: boolean }
  | { mode: "pinch"; dist: number; mid: Vec2; view: Rect };

const MARGIN_PX = 54;

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function PlanView({ layoutId }: Props) {
  const t = useT();
  const interactive = !layoutId;
  const project = useStore((s) => s.project);
  const room = project.room;
  const layout = layoutId ? project.layouts.find((l) => l.id === layoutId) ?? activeLayout(project) : activeLayout(project);
  const items = layout.items;
  const selectedId = useStore((s) => (interactive ? s.selectedId : null));
  const selectedOpeningId = useStore((s) => (interactive ? s.selectedOpeningId : null));
  const highlight = useStore((s) => s.highlight);
  const walking = useStore((s) => interactive && s.view.camera === "walk");
  const walkerRef = useRef<SVGGElement>(null);
  // The walker moves every frame; update the marker directly instead of re-rendering the plan.
  useEffect(() => {
    if (!walking) return;
    let raf = 0;
    const tick = () => {
      const g = walkerRef.current, p = walkInput.pos;
      if (g) {
        g.style.display = p ? "" : "none";
        if (p) {
          const deg = (Math.atan2(-Math.cos(walkInput.yaw), -Math.sin(walkInput.yaw)) * 180) / Math.PI;
          g.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${deg})`);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [walking]);
  const hl = interactive ? highlight : null;

  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Vec2>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [live, setLive] = useState<{ guides: Guide[]; dists: WallDistance[] } | null>(null);

  const placement = size.h > size.w * 1.05 ? "below" : "right";
  const staging = useMemo(() => stagingLayout(room, items, dragId, placement), [room, items, dragId, placement]);

  // Default view: room + staging area, with a margin measured in screen
  // pixels (the wall labels are drawn at a fixed pixel size, so a margin in
  // cm would clip them when zoomed out). Once the user zooms or pans we keep
  // their view.
  const fitView = useMemo<Rect>(() => {
    const b = bounds(room.outline);
    const x0 = b.minX, y0 = b.minY;
    const x1 = interactive ? Math.max(b.maxX, staging.zone.x + staging.zone.w) : b.maxX;
    const y1 = interactive ? Math.max(b.maxY, staging.zone.y + staging.zone.h) : b.maxY;
    const kFit = Math.min((size.w - 2 * MARGIN_PX) / (x1 - x0), (size.h - 2 * MARGIN_PX) / (y1 - y0));
    const m = MARGIN_PX / Math.max(kFit, 0.05) + room.wallThickness;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }, [room.outline, room.wallThickness, interactive, staging.zone, size.w, size.h]);
  const [userView, setUserView] = useState<Rect | null>(null);
  useEffect(() => setUserView(null), [room.outline]);
  const view = userView ?? fitView;
  const k = Math.min(size.w / view.w, size.h / view.h) || 1; // px per cm

  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(toWorld(e.clientX, e.clientY), f);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  const viewRef = useRef(view);
  viewRef.current = view;
  function zoomAt(p: Vec2, f: number) {
    const v = viewRef.current;
    const w = Math.min(Math.max(v.w * f, 60), 5000);
    const g = w / v.w;
    setUserView({ x: p.x - (p.x - v.x) * g, y: p.y - (p.y - v.y) * g, w, h: v.h * g });
  }

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const roomRef = useRef(room);
  roomRef.current = room;
  const kRef = useRef(k);
  kRef.current = k;
  const stagingRef = useRef(staging);
  stagingRef.current = staging;

  // ---------- pointer handling (window listeners so drags survive leaving the SVG) ----------
  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const room = roomRef.current;
    const k = kRef.current;

    if (d.mode === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const f = d.dist / Math.max(dist, 1);
      const midW = d.mid;
      const w = Math.min(Math.max(d.view.w * f, 60), 5000);
      const g = w / d.view.w;
      setUserView({ x: midW.x - (midW.x - d.view.x) * g, y: midW.y - (midW.y - d.view.y) * g, w, h: d.view.h * g });
      return;
    }
    if (d.mode === "pan") {
      const dx = (e.clientX - d.start.x) / k, dy = (e.clientY - d.start.y) / k;
      if (Math.abs(dx) + Math.abs(dy) > 3 / k) d.moved = true;
      if (d.moved) setUserView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
      return;
    }

    const p = toWorld(e.clientX, e.clientY);
    if (d.mode === "opening") {
      const op = room.openings.find((o) => o.id === d.id);
      const wall = op && getWalls(room)[op.wall];
      if (!op || !wall) return;
      const along = dot(sub(p, wall.a), wall.dir) - d.grab;
      const offset = Math.round(Math.max(0, Math.min(wall.length - op.width, along)));
      if (offset !== op.offset) {
        updateRoom((r) => ({ ...r, openings: r.openings.map((o) => (o.id === op.id ? { ...o, offset } : o)) }), false);
      }
      return;
    }

    const item = itemsRef.current.find((i) => i.id === d.id);
    if (!item) return;
    if (d.mode === "rotate") {
      let deg = (Math.atan2(p.y - item.y, p.x - item.x) * 180) / Math.PI + 90;
      if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
      updateItem(item.id, { rotation: normAngle(Math.round(deg * 10) / 10) }, false);
      return;
    }

    // move
    d.moved = true;
    const raw = { x: p.x + d.offset.x, y: p.y + d.offset.y };
    const staged = inRect(raw, stagingRef.current.zone);
    let x = raw.x, y = raw.y;
    let guides: Guide[] = [];
    if (!staged && !e.altKey) {
      const others = itemsRef.current.filter((o) => o.id !== item.id && !o.staged);
      const s = snapItem({ ...item, x, y }, others, room, Math.min(15, Math.max(3, 10 / k)));
      x = s.x;
      y = s.y;
      guides = s.guides;
    }
    x = Math.round(x * 10) / 10;
    y = Math.round(y * 10) / 10;
    updateItem(item.id, { x, y, staged }, false);
    setLive({ guides, dists: staged ? [] : distancesToWalls({ ...item, x, y }, room) });
  }, [toWorld]);

  const onUp = useCallback((e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    // Lifting one finger of a pinch keeps the gesture alive until the last one lifts.
    if (d?.mode === "pinch" && pointers.current.size > 0) return;
    if (d?.mode === "pan" && !d.moved) {
      select(null);
      selectOpening(null);
      clearHighlight();
    }
    drag.current = null;
    setDragId(null);
    setLive(null);
    endGesture();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }, [onMove]);

  const startDrag = (d: Drag, e: React.PointerEvent) => {
    drag.current = d;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  useEffect(() => () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }, [onMove, onUp]);

  const onItemDown = (e: React.PointerEvent, item: FurnitureItem, drawAt: Vec2) => {
    if (!interactive || e.button > 0) return;
    e.stopPropagation();
    select(item.id);
    beginGesture();
    if (item.staged) updateItem(item.id, { x: drawAt.x, y: drawAt.y, rotation: 0 }, false);
    const p = toWorld(e.clientX, e.clientY);
    setDragId(item.id);
    startDrag({ mode: "move", id: item.id, offset: { x: drawAt.x - p.x, y: drawAt.y - p.y }, moved: false }, e);
  };

  const onRotateDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    beginGesture();
    startDrag({ mode: "rotate", id }, e);
  };

  const onOpeningDown = (e: React.PointerEvent, op: Opening) => {
    if (e.button > 0) return;
    e.stopPropagation();
    selectOpening(op.id);
    setPanel("room");
    const wall = getWalls(room)[op.wall];
    if (!wall) return;
    beginGesture();
    const along = dot(sub(toWorld(e.clientX, e.clientY), wall.a), wall.dir);
    startDrag({ mode: "opening", id: op.id, grab: along - op.offset }, e);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && drag.current?.mode !== "move") {
      const [a, b] = [...pointers.current.values()];
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      drag.current = { mode: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid, view: viewRef.current };
      return;
    }
    startDrag({ mode: "pan", start: { x: e.clientX, y: e.clientY }, view: viewRef.current, moved: false }, e);
  };

  // ---------- render ----------
  const sorted = useMemo(() => {
    // Rugs first so furniture draws on top; the selected item last so its handle is on top.
    return [...items].sort((a, b) => rank(a) - rank(b) || (a.id === selectedId ? 1 : b.id === selectedId ? -1 : 0));
  }, [items, selectedId]);
  const selected = items.find((i) => i.id === selectedId);
  const hlItems = hl?.itemIds ?? [];

  const scaleBar = useMemo(() => {
    const target = 110 / k;
    const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
    const len = nice.find((n) => n >= target * 0.7) ?? 1000;
    return { len, px: len * k };
  }, [k]);

  return (
    <div className="plan-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="plan-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={interactive ? onBackgroundDown : undefined}
      >
        <defs>
          <pattern id="grid10" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" className="plan-grid-minor" />
          </pattern>
          <pattern id="grid50" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill={k > 1.2 ? "url(#grid10)" : "none"} />
            <path d="M 50 0 L 0 0 0 50" className="plan-grid-major" />
          </pattern>
        </defs>
        <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#grid50)" />

        {interactive && (
          <g className="plan-staging">
            <rect x={staging.zone.x} y={staging.zone.y} width={staging.zone.w} height={staging.zone.h} rx={8} />
            <text x={staging.zone.x + 12} y={staging.zone.y + 20} fontSize={Math.min(11 / k, (staging.zone.w - 24) / (t("plan.staging").length * 0.72))}>
              {t("plan.staging")}
            </text>
            {staging.positions.size === 0 && (
              <text x={staging.zone.x + staging.zone.w / 2} y={staging.zone.y + staging.zone.h / 2} fontSize={10 / k} textAnchor="middle" className="plan-staging-hint">
                {wrapText(t("plan.stagingHint"), Math.floor((staging.zone.w * k) / (10 * 0.55))).map((line, i) => (
                  <tspan key={i} x={staging.zone.x + staging.zone.w / 2} dy={i ? 13 / k : 0}>{line}</tspan>
                ))}
              </text>
            )}
          </g>
        )}

        <PlanRoom
          room={room}
          k={k}
          selectedOpeningId={selectedOpeningId}
          highlightOpeningIds={hl?.openingIds}
          onOpeningDown={interactive ? onOpeningDown : undefined}
        />

        {sorted.map((it) => {
          const packed = it.staged && it.id !== dragId ? staging.positions.get(it.id) : undefined;
          if (it.staged && !packed && it.id !== dragId) return null;
          const at = packed ?? { x: it.x, y: it.y };
          const rot = packed ? 0 : it.rotation;
          const isSel = it.id === selectedId;
          const isHl = hlItems.includes(it.id);
          return (
            <PlanItem
              key={it.id}
              item={it}
              x={at.x}
              y={at.y}
              rotation={rot}
              k={k}
              label={itemName(it, t)}
              state={isSel && isHl ? "selected issue" : isSel ? "selected" : isHl ? "issue" : undefined}
              showClearance={!it.staged}
              onPointerDown={interactive ? (e) => onItemDown(e, it, at) : undefined}
            />
          );
        })}

        {hl?.marker && (
          <g className="plan-marker">
            {hl.marker.kind === "polygon" ? (
              <polygon points={hl.marker.points.map((p) => `${p.x},${p.y}`).join(" ")} />
            ) : (
              <DimLine a={hl.marker.points[0]} b={hl.marker.points[1]} k={k} className="plan-marker-line" />
            )}
          </g>
        )}

        {live?.guides.map((g, i) => (
          <line key={i} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} className="plan-guide" />
        ))}
        {live?.dists.map((d, i) => <DimLine key={i} a={d.from} b={d.to} k={k} className="plan-dim" />)}

        {interactive && selected && !selected.staged && <RotateHandle item={selected} k={k} onDown={onRotateDown} />}

        {walking && (
          <g ref={walkerRef} className="plan-walker" style={{ display: "none" }}>
            <path d="M 0 0 L 90 -42 A 100 100 0 0 1 90 42 Z" className="plan-walker-cone" />
            <circle r={Math.max(14, 7 / k)} />
          </g>
        )}
      </svg>

      <div className="plan-scalebar" aria-hidden>
        <div className="plan-scalebar-bar" style={{ width: scaleBar.px }} />
        <span>{scaleBar.len >= 100 ? `${scaleBar.len / 100} m` : `${scaleBar.len} cm`}</span>
      </div>
      {interactive && (
        <div className="plan-zoom">
          <button className="icon-btn" onClick={() => zoomAt({ x: view.x + view.w / 2, y: view.y + view.h / 2 }, 0.8)} title={t("plan.zoomIn")} aria-label={t("plan.zoomIn")}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" onClick={() => zoomAt({ x: view.x + view.w / 2, y: view.y + view.h / 2 }, 1.25)} title={t("plan.zoomOut")} aria-label={t("plan.zoomOut")}>
            <Icon name="minus" />
          </button>
          <button className="icon-btn" onClick={() => setUserView(null)} title={t("plan.fit")} aria-label={t("plan.fit")}>
            <Icon name="fit" />
          </button>
        </div>
      )}
    </div>
  );
}

function rank(i: FurnitureItem) {
  return i.category === "rug" ? 0 : 1;
}

function wrapText(s: string, max: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function DimLine({ a, b, k, className }: { a: Vec2; b: Vec2; k: number; className: string }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return null;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const label = `${Math.round(len)}`;
  const fs = 10.5 / k;
  const w = (label.length * 6.4 + 10) / k;
  return (
    <g className={className}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <circle cx={a.x} cy={a.y} r={2 / k} />
      <circle cx={b.x} cy={b.y} r={2 / k} />
      <rect x={mx - w / 2} y={my - fs * 0.8} width={w} height={fs * 1.6} rx={fs * 0.4} />
      <text x={mx} y={my} fontSize={fs} textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </g>
  );
}

function RotateHandle({ item, k, onDown }: { item: FurnitureItem; k: number; onDown: (e: React.PointerEvent, id: string) => void }) {
  // Sits just behind the item's back edge, so it never covers the front clearance zone.
  const fp = footprint(item);
  const back = { x: (fp[0].x + fp[1].x) / 2, y: (fp[0].y + fp[1].y) / 2 };
  const rad = ((item.rotation - 90) * Math.PI) / 180;
  const dist = 22 / k;
  const h = { x: back.x + Math.cos(rad) * dist, y: back.y + Math.sin(rad) * dist };
  return (
    <g className="plan-rotate" onPointerDown={(e) => onDown(e, item.id)}>
      <line x1={back.x} y1={back.y} x2={h.x} y2={h.y} />
      <circle cx={h.x} cy={h.y} r={12 / k} className="plan-rotate-hit" />
      <circle cx={h.x} cy={h.y} r={6.5 / k} />
      <path
        transform={`translate(${h.x} ${h.y}) scale(${1 / k})`}
        d="M -3 -1.5 A 3.2 3.2 0 1 1 -2.2 2.4"
        className="plan-rotate-icon"
      />
    </g>
  );
}

