import { useEffect, useRef } from "react";
import type { Opening, OpeningKind, Room, RoomShape } from "../model/types";
import { makeOpening, outlineForShape } from "../model/factory";
import { bounds } from "../geometry/polygon";
import { getWalls, remapOpenings } from "../geometry/room";
import { selectOpening, updateRoom, useStore } from "../state/store";
import { useT, type TKey } from "../i18n";
import { Icon } from "./Icon";
import { NumberField, Seg } from "./fields";

const KINDS: OpeningKind[] = ["door", "window", "radiator", "outlet"];

/** Keeps edited openings inside their wall. */
function fitOpenings(room: Room, openings: Opening[]): Opening[] {
  return remapOpenings({ ...room, openings }, room);
}

function setShape(shape: RoomShape) {
  updateRoom((r) => {
    const next = { ...r, shape, outline: outlineForShape(shape, r.outline) };
    return { ...next, openings: remapOpenings(r, next) };
  });
}

export function RoomPanel() {
  const t = useT();
  const room = useStore((s) => s.project.room);
  const selectedOpeningId = useStore((s) => s.selectedOpeningId);
  const shape = room.shape;
  const b = bounds(room.outline);
  const walls = getWalls(room);

  const updateOpening = (id: string, patch: Partial<Opening>) =>
    updateRoom((r) => ({
      ...r,
      openings: fitOpenings(r, r.openings.map((o) => (o.id === id ? { ...o, ...patch } : o))),
    }));

  const addOpening = (kind: OpeningKind) => {
    // Put it on the longest wall without one of the same kind, centred.
    const used = new Set(room.openings.filter((o) => o.kind === kind).map((o) => o.wall));
    const wall = [...walls].sort((a, b) => b.length - a.length).find((w) => !used.has(w.index)) ?? walls[0];
    const op = makeOpening(kind, wall.index, 0);
    op.offset = Math.max(0, Math.round((wall.length - op.width) / 2));
    updateRoom((r) => ({ ...r, openings: [...r.openings, op] }));
    selectOpening(op.id);
  };

  return (
    <div className="panel">
      <section className="card">
        <div className="card-title">{t("room.shape")}</div>
        {shape.kind === "polygon" ? (
          <p className="muted small">{t("room.custom")}</p>
        ) : (
          <Seg
            value={shape.kind}
            options={[
              { value: "rect", label: t("room.rect") },
              { value: "L", label: t("room.L") },
            ]}
            onChange={(k) =>
              setShape(
                k === "rect"
                  ? { kind: "rect", width: b.w, depth: b.h }
                  : { kind: "L", width: b.w, depth: b.h, cutWidth: Math.round(b.w * 0.4), cutDepth: Math.round(b.h * 0.4) },
              )
            }
          />
        )}
        {shape.kind !== "polygon" && (
          <div className="grid2">
            <NumberField label={t("room.width")} value={shape.width} min={shape.kind === "L" ? shape.cutWidth + 60 : 100} max={2000} onChange={(width) => setShape({ ...shape, width })} />
            <NumberField label={t("room.depth")} value={shape.depth} min={shape.kind === "L" ? shape.cutDepth + 60 : 100} max={2000} onChange={(depth) => setShape({ ...shape, depth })} />
            {shape.kind === "L" && (
              <>
                <NumberField label={t("room.cutWidth")} value={shape.cutWidth} min={30} max={shape.width - 60} onChange={(cutWidth) => setShape({ ...shape, cutWidth })} />
                <NumberField label={t("room.cutDepth")} value={shape.cutDepth} min={30} max={shape.depth - 60} onChange={(cutDepth) => setShape({ ...shape, cutDepth })} />
              </>
            )}
          </div>
        )}
        {shape.kind === "L" && <p className="muted small">{t("room.cutHint")}</p>}
        <div className="grid2">
          <NumberField label={t("room.ceiling")} value={room.ceilingHeight} min={180} max={600} onChange={(ceilingHeight) => updateRoom((r) => ({ ...r, ceilingHeight }))} />
        </div>
      </section>

      <section className="card">
        <div className="card-title">{t("room.openings")}</div>
        <div className="add-row">
          {KINDS.map((k) => (
            <button key={k} className="btn btn-soft btn-sm" onClick={() => addOpening(k)}>
              <Icon name="plus" size={14} /> {t(`opening.${k}` as TKey)}
            </button>
          ))}
        </div>
        <p className="muted small">{t("room.wallsHint")}</p>
        {room.openings.length === 0 && <p className="muted">{t("room.none")}</p>}
        <div className="openings">
          {room.openings.map((o) => (
            <OpeningCard key={o.id} o={o} room={room} selected={o.id === selectedOpeningId} onChange={(p) => updateOpening(o.id, p)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function OpeningCard({ o, room, selected, onChange }: { o: Opening; room: Room; selected: boolean; onChange: (p: Partial<Opening>) => void }) {
  const t = useT();
  const walls = getWalls(room);
  const L = walls[o.wall]?.length ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div ref={ref} className={`opening-card ${selected ? "selected" : ""}`} onClick={() => !selected && selectOpening(o.id)}>
      <div className="opening-head">
        <span className={`opening-dot k-${o.kind}`} />
        <strong>{t(`opening.${o.kind}` as TKey)}</strong>
        <select value={o.wall} onChange={(e) => onChange({ wall: Number(e.target.value) })} aria-label={t("room.wall")}>
          {walls.map((w) => (
            <option key={w.index} value={w.index}>
              {t("room.wallN", { n: w.index + 1 })} · {Math.round(w.length)} cm
            </option>
          ))}
        </select>
        <button
          className="icon-btn"
          title={t("room.remove")}
          aria-label={t("room.remove")}
          onClick={(e) => {
            e.stopPropagation();
            updateRoom((r) => ({ ...r, openings: r.openings.filter((x) => x.id !== o.id) }));
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      <div className="grid2">
        <NumberField label={t("room.offset")} title={t("room.offsetHint")} value={o.offset} min={0} max={Math.max(0, L - o.width)} onChange={(offset) => onChange({ offset })} />
        <NumberField label={t("room.width.op")} value={o.width} min={5} max={L} onChange={(width) => onChange({ width })} />
        {o.kind === "door" && (
          <NumberField label={t("room.height")} value={o.height} min={150} max={room.ceilingHeight} onChange={(height) => onChange({ height })} />
        )}
        {o.kind === "window" && (
          <>
            <NumberField label={t("room.sill")} value={o.sillHeight} min={0} max={room.ceilingHeight - 20} onChange={(sillHeight) => onChange({ sillHeight })} />
            <NumberField label={t("room.height")} value={o.height} min={20} max={room.ceilingHeight - o.sillHeight} onChange={(height) => onChange({ height })} />
          </>
        )}
        {o.kind === "radiator" && (
          <NumberField label={t("room.height")} value={o.height} min={20} max={200} onChange={(height) => onChange({ height })} />
        )}
        {o.kind === "outlet" && (
          <NumberField label={t("room.heightAboveFloor")} value={o.sillHeight} min={0} max={room.ceilingHeight - 10} onChange={(sillHeight) => onChange({ sillHeight })} />
        )}
      </div>
      {o.kind === "door" && (
        <div className="stack">
          <div className="field">
            <span className="field-label" title={t("room.hingeHint")}>{t("room.hinge")}</span>
            <Seg
              value={o.hinge ?? "left"}
              options={[
                { value: "left", label: t("room.hingeLeft") },
                { value: "right", label: t("room.hingeRight") },
              ]}
              onChange={(hinge) => onChange({ hinge })}
            />
          </div>
          <div className="field">
            <span className="field-label">{t("room.swing")}</span>
            <Seg
              value={o.swing ?? "in"}
              options={[
                { value: "in", label: t("room.swingIn") },
                { value: "out", label: t("room.swingOut") },
              ]}
              onChange={(swing) => onChange({ swing })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
