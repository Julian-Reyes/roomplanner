import { memo } from "react";
import type { Opening, Room, Vec2 } from "../model/types";
import { doorGeometry, getWalls, openingSpan, wallLabelPoint, type Wall } from "../geometry/room";
import { add, scale } from "../geometry/vec";

const pts = (p: Vec2[]) => p.map((q) => `${q.x},${q.y}`).join(" ");

/** The wall as a solid band outside the floor outline, extended at outer corners so corners close. */
export function wallBand(w: Wall, t: number): Vec2[] {
  const out = scale(w.inward, -t);
  const a = w.convexA ? add(w.a, scale(w.dir, -t)) : w.a;
  const b = w.convexB ? add(w.b, scale(w.dir, t)) : w.b;
  return [a, b, add(b, out), add(a, out)];
}

interface Props {
  room: Room;
  /** Pixels per cm, for sizing text. */
  k: number;
  selectedOpeningId?: string | null;
  highlightOpeningIds?: string[];
  showLabels?: boolean;
  onOpeningDown?: (e: React.PointerEvent, op: Opening) => void;
}

export const PlanRoom = memo(function PlanRoom({ room, k, selectedOpeningId, highlightOpeningIds, showLabels = true, onOpeningDown }: Props) {
  const walls = getWalls(room);
  const t = room.wallThickness;
  const fs = 11 / k;

  return (
    <g>
      <polygon points={pts(room.outline)} className="plan-floor" />
      {walls.map((w) => (
        <polygon key={w.index} points={pts(wallBand(w, t))} className="plan-wall" />
      ))}
      {room.openings.map((op) => (
        <PlanOpening
          key={op.id}
          room={room}
          op={op}
          t={t}
          state={highlightOpeningIds?.includes(op.id) ? "issue" : selectedOpeningId === op.id ? "selected" : undefined}
          onDown={onOpeningDown}
        />
      ))}
      {showLabels &&
        walls.map((w) => {
          const p = wallLabelPoint(w, t + 16 / k);
          const badge = wallLabelPoint(w, t + 40 / k);
          return (
            <g key={w.index} className="plan-wall-label">
              <text x={p.x} y={p.y} fontSize={fs} textAnchor="middle" dominantBaseline="central">
                {Math.round(w.length)}
              </text>
              <circle cx={badge.x} cy={badge.y} r={9 / k} className="plan-wall-badge" />
              <text x={badge.x} y={badge.y} fontSize={10 / k} textAnchor="middle" dominantBaseline="central" className="plan-wall-badge-text">
                {w.index + 1}
              </text>
            </g>
          );
        })}
    </g>
  );
});

function PlanOpening({
  room, op, t, state, onDown,
}: { room: Room; op: Opening; t: number; state?: "selected" | "issue"; onDown?: Props["onOpeningDown"] }) {
  const span = openingSpan(room, op);
  if (!span) return null;
  const { wall, a, b } = span;
  const out = scale(wall.inward, -t);
  const cls = `plan-opening ${state ?? ""}`;
  const handlers = onDown ? { onPointerDown: (e: React.PointerEvent) => onDown(e, op), style: { cursor: "grab" } } : {};

  if (op.kind === "door") {
    const g = doorGeometry(room, op)!;
    const openEnd = add(g.hinge, scale(g.openDir, g.radius));
    const sweep = g.sign > 0 ? 1 : 0;
    return (
      <g className={cls} {...handlers}>
        <polygon points={pts([a, b, add(b, out), add(a, out)])} className="plan-door-gap" />
        <path d={`M ${g.latch.x} ${g.latch.y} A ${g.radius} ${g.radius} 0 0 ${sweep} ${openEnd.x} ${openEnd.y} L ${g.hinge.x} ${g.hinge.y} Z`} className="plan-door-swing" />
        <line x1={g.hinge.x} y1={g.hinge.y} x2={openEnd.x} y2={openEnd.y} className="plan-door-leaf" />
      </g>
    );
  }
  if (op.kind === "window") {
    const m1 = scale(wall.inward, -t * 0.4);
    const m2 = scale(wall.inward, -t * 0.6);
    return (
      <g className={cls} {...handlers}>
        <polygon points={pts([a, b, add(b, out), add(a, out)])} className="plan-window" />
        <line x1={a.x + m1.x} y1={a.y + m1.y} x2={b.x + m1.x} y2={b.y + m1.y} className="plan-window-glass" />
        <line x1={a.x + m2.x} y1={a.y + m2.y} x2={b.x + m2.x} y2={b.y + m2.y} className="plan-window-glass" />
      </g>
    );
  }
  if (op.kind === "radiator") {
    const inn = scale(wall.inward, 10);
    const fins = [];
    const n = Math.max(2, Math.floor((span.to - span.from) / 8));
    for (let i = 1; i < n; i++) {
      const p = add(a, scale(wall.dir, ((span.to - span.from) * i) / n));
      fins.push(<line key={i} x1={p.x} y1={p.y} x2={p.x + inn.x} y2={p.y + inn.y} className="plan-radiator-fin" />);
    }
    return (
      <g className={cls} {...handlers}>
        <polygon points={pts([a, b, add(b, inn), add(a, inn)])} className="plan-radiator" />
        {fins}
      </g>
    );
  }
  // outlet: a small socket symbol on the inside face of the wall
  const c = add(scale(add(a, b), 0.5), scale(wall.inward, 4));
  return (
    <g className={cls} {...handlers}>
      <circle cx={c.x} cy={c.y} r={5} className="plan-outlet" />
      <circle cx={c.x - wall.dir.x * 2} cy={c.y - wall.dir.y * 2} r={0.9} className="plan-outlet-pin" />
      <circle cx={c.x + wall.dir.x * 2} cy={c.y + wall.dir.y * 2} r={0.9} className="plan-outlet-pin" />
    </g>
  );
}
