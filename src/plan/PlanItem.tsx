import { memo, type ReactNode } from "react";
import type { FurnitureItem } from "../model/types";

interface Props {
  item: FurnitureItem;
  /** Draw position (differs from item.x/y while staged). */
  x: number;
  y: number;
  rotation: number;
  /** Pixels per cm. */
  k: number;
  label: string;
  state?: "selected" | "issue" | "selected issue";
  showClearance: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

/** Plan symbol for one item: drawn in the item's own frame (centre at 0,0, front toward +y). */
export const PlanItem = memo(function PlanItem({ item, x, y, rotation, k, label, state, showClearance, onPointerDown }: Props) {
  const w = item.width, d = item.depth;
  const hw = w / 2, hd = d / 2;
  const flat = item.category === "rug";
  const fs = Math.min(11 / k, Math.max(w, d) / 7);
  const showText = w * k > 34 && d * k > 16;
  const showDims = w * k > 70 && d * k > 32;
  // Counter-rotate labels so they're always upright; swap the box if the item is sideways.
  const sideways = Math.abs(Math.sin((rotation * Math.PI) / 180)) > 0.7;
  const textW = sideways ? d : w;

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`} className={`plan-item ${state ?? ""} cat-${item.category}`}>
      {showClearance && item.clearance.front > 0 && (
        <rect x={-hw} y={hd} width={w} height={item.clearance.front} className="plan-clearance" />
      )}
      <g onPointerDown={onPointerDown} style={onPointerDown ? { cursor: "grab" } : undefined}>
        <rect
          x={-hw}
          y={-hd}
          width={w}
          height={d}
          rx={flat ? 4 : Math.min(3, w / 10)}
          className={flat ? "plan-item-body rug" : "plan-item-body"}
          style={{ fill: item.color }}
        />
        {symbol(item)}
        {!flat && <path d={`M ${-4} ${hd - 5} L 0 ${hd - 1.5} L 4 ${hd - 5}`} className="plan-item-front" />}
      </g>
      {showText && (
        <g transform={`rotate(${-rotation})`} className="plan-item-text" pointerEvents="none">
          <text y={showDims ? -fs * 0.15 : fs * 0.35} fontSize={fs} textAnchor="middle">
            {truncate(label, Math.floor((textW * k) / (fs * k * 0.56)))}
          </text>
          {showDims && (
            <text y={fs * 1.05} fontSize={fs * 0.82} textAnchor="middle" className="plan-item-dims">
              {Math.round(w)}×{Math.round(d)}
            </text>
          )}
        </g>
      )}
    </g>
  );
});

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s;
}

function symbol(item: FurnitureItem): ReactNode {
  const w = item.width, d = item.depth, hw = w / 2, hd = d / 2;
  switch (item.category) {
    case "bed": {
      const pillows = w >= 120 ? 2 : 1;
      const pw = (w - 12 - (pillows - 1) * 6) / pillows;
      return (
        <g className="plan-sym">
          <rect x={-hw} y={-hd} width={w} height={6} className="plan-sym-solid" />
          {Array.from({ length: pillows }, (_, i) => (
            <rect key={i} x={-hw + 6 + i * (pw + 6)} y={-hd + 10} width={pw} height={Math.min(30, d * 0.16)} rx={5} className="plan-sym-soft" />
          ))}
          <path d={`M ${-hw} ${-hd + d * 0.33} L ${hw} ${-hd + d * 0.33}`} />
          <path d={`M ${-hw} ${-hd + d * 0.33} L ${-hw + w * 0.3} ${-hd + d * 0.42} L ${hw} ${-hd + d * 0.36}`} className="plan-sym-fold" />
        </g>
      );
    }
    case "wardrobe": {
      const doors = Math.max(2, Math.round(w / 50));
      return (
        <g className="plan-sym">
          <path d={`M ${-hw} ${hd - 4} L ${hw} ${hd - 4}`} />
          {Array.from({ length: doors - 1 }, (_, i) => {
            const x = -hw + (w * (i + 1)) / doors;
            return <path key={i} d={`M ${x} ${hd - 4} L ${x} ${hd}`} />;
          })}
          <path d={`M ${-hw + 4} ${-hd + 4} L ${hw - 4} ${hd - 8}`} className="plan-sym-fold" />
        </g>
      );
    }
    case "dresser":
    case "nightstand":
      return (
        <g className="plan-sym">
          <path d={`M ${-hw} ${hd - 4} L ${hw} ${hd - 4}`} />
          <path d={`M ${-hw * 0.3} ${hd - 2} L ${hw * 0.3} ${hd - 2}`} />
        </g>
      );
    case "desk":
      return (
        <g className="plan-sym">
          <rect x={-hw + 4} y={-hd + 4} width={Math.min(35, w * 0.3)} height={Math.min(24, d * 0.4)} rx={2} className="plan-sym-soft" />
        </g>
      );
    case "chair":
      return (
        <g className="plan-sym">
          <rect x={-hw + 3} y={-hd} width={w - 6} height={Math.min(9, d * 0.2)} rx={3} className="plan-sym-solid" />
          <rect x={-hw + 4} y={-hd + 12} width={w - 8} height={d - 16} rx={6} className="plan-sym-soft" />
        </g>
      );
    case "sofa": {
      const arm = Math.min(18, w * 0.1);
      const seats = Math.max(1, Math.round((w - 2 * arm) / 65));
      const sw = (w - 2 * arm) / seats;
      return (
        <g className="plan-sym">
          <rect x={-hw} y={-hd} width={w} height={Math.min(20, d * 0.24)} className="plan-sym-solid" />
          <rect x={-hw} y={-hd} width={arm} height={d} className="plan-sym-solid" />
          <rect x={hw - arm} y={-hd} width={arm} height={d} className="plan-sym-solid" />
          {Array.from({ length: seats - 1 }, (_, i) => {
            const x = -hw + arm + sw * (i + 1);
            return <path key={i} d={`M ${x} ${-hd + Math.min(20, d * 0.24)} L ${x} ${hd}`} />;
          })}
        </g>
      );
    }
    case "shelf": {
      const n = Math.max(1, Math.round(w / 40));
      return (
        <g className="plan-sym">
          {Array.from({ length: n - 1 }, (_, i) => {
            const x = -hw + (w * (i + 1)) / n;
            return <path key={i} d={`M ${x} ${-hd} L ${x} ${hd}`} />;
          })}
          <path d={`M ${-hw} ${-hd + 2} L ${hw} ${-hd + 2}`} />
        </g>
      );
    }
    case "rug":
      return <rect x={-hw + 6} y={-hd + 6} width={Math.max(0, w - 12)} height={Math.max(0, d - 12)} rx={3} className="plan-sym-rug" />;
    default:
      return <path d={`M ${-hw} ${-hd} L ${hw} ${hd} M ${hw} ${-hd} L ${-hw} ${hd}`} className="plan-sym plan-sym-fold" />;
  }
}
