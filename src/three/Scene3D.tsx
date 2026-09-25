import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import type { Room } from "../model/types";
import { bounds } from "../geometry/polygon";
import { getWalls, openingSpan } from "../geometry/room";
import { checksFor } from "../checks";
import { activeLayout, select, setView, useStore, type CameraMode } from "../state/store";
import { useT } from "../i18n";
import { Icon } from "../ui/Icon";
import { RoomMesh } from "./RoomMesh";
import { Furniture3D } from "./Furniture3D";
import { CameraRig, walkInput } from "./CameraRig";

export function Scene3D() {
  const t = useT();
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.view);
  const selectedId = useStore((s) => s.selectedId);
  const highlight = useStore((s) => s.highlight);
  const room = project.room;
  const items = activeLayout(project).items;
  const placed = useMemo(() => items.filter((i) => !i.staged), [items]);
  const issues = checksFor(room, items);
  // The 3D door stops where it would hit furniture, matching the plan's check.
  const doorLimits = useMemo(
    () => Object.fromEntries(issues.filter((i) => i.code === "doorBlocked").map((i) => [i.openingIds[0], Number(i.params.deg)])),
    [issues],
  );
  const walls = getWalls(room);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const coarse = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches, []);
  const hasDoor = room.openings.some((o) => o.kind === "door");
  const hasWindow = room.openings.some((o) => o.kind === "window");
  const cam = view.camera;
  const setCam = (camera: CameraMode) => setView({ camera });

  return (
    <div className={`view3d ${view.evening ? "evening" : ""}`} onPointerDown={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ fov: 50, near: 0.05, far: 80, position: [6, 6, 8] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={(e) => {
          // Only a real click on empty space deselects, not the end of an orbit drag.
          const d = downAt.current;
          if (e.type === "click" && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) select(null);
        }}
      >
        <color attach="background" args={[view.evening ? "#161c2b" : "#dfe7ee"]} />
        <Lights room={room} evening={view.evening} />
        <RoomMesh
          room={room}
          doorAngle={view.door}
          doorLimits={doorLimits}
          blinds={view.blinds}
          evening={view.evening}
          cutaway={cam !== "walk"}
          highlightOpeningIds={highlight.openingIds}
        />
        {placed.map((it) => (
          <Furniture3D key={it.id} item={it} selected={it.id === selectedId} issue={highlight.itemIds.includes(it.id)} onSelect={select} />
        ))}
        <CameraRig mode={cam} room={room} items={placed} child={view.child} />
      </Canvas>

      <div className="v3-top">
        <div className="seg" role="group" aria-label="Camera">
          <button className={cam === "orbit" ? "on" : ""} onClick={() => setCam("orbit")} title={t("view.orbit")}>
            <Icon name="orbit" /> <span>{t("view.orbit")}</span>
          </button>
          <button className={cam === "top" ? "on" : ""} onClick={() => setCam("top")} title={t("view.top")}>
            <Icon name="top" /> <span>{t("view.top")}</span>
          </button>
          <button className={cam === "walk" ? "on" : ""} onClick={() => setCam("walk")} title={t("view.walk")}>
            <Icon name="walk" /> <span>{t("view.walk")}</span>
          </button>
        </div>
        <div className="seg seg-walls" role="group" aria-label={t("view.walls")}>
          <span className="seg-label">
            <Icon name="wall" />
          </span>
          {walls.map((w) => (
            <button
              key={w.index}
              className={cam === `wall-${w.index}` ? "on" : ""}
              onClick={() => setCam(`wall-${w.index}`)}
              title={t("view.wallN", { n: w.index + 1 })}
            >
              {w.index + 1}
            </button>
          ))}
        </div>
        <div className="v3-spacer" />
        <div className="seg" role="group">
          <button className={!view.evening ? "on" : ""} onClick={() => setView({ evening: false })} title={t("view.day")}>
            <Icon name="sun" />
          </button>
          <button className={view.evening ? "on" : ""} onClick={() => setView({ evening: true })} title={t("view.evening")}>
            <Icon name="moon" />
          </button>
        </div>
      </div>

      <div className="v3-bottom">
        {hasDoor && (
          <label className="v3-slider" title={t("view.door")}>
            <Icon name="door" />
            <input type="range" min={0} max={90} value={view.door} onChange={(e) => setView({ door: Number(e.target.value) })} aria-label={t("view.door")} />
          </label>
        )}
        {hasWindow && (
          <label className="v3-slider" title={t("view.blinds")}>
            <Icon name="blinds" />
            <input type="range" min={0} max={100} value={Math.round(view.blinds * 100)} onChange={(e) => setView({ blinds: Number(e.target.value) / 100 })} aria-label={t("view.blinds")} />
          </label>
        )}
        {cam === "walk" && (
          <div className="seg">
            <button className={!view.child ? "on" : ""} onClick={() => setView({ child: false })} title={t("view.adult")}>
              <Icon name="adult" />
            </button>
            <button className={view.child ? "on" : ""} onClick={() => setView({ child: true })} title={t("view.child")}>
              <Icon name="child" />
            </button>
          </div>
        )}
      </div>

      {cam === "walk" && <div className="v3-hint">{coarse ? t("view.walkHintTouch") : t("view.walkHint")}</div>}
      {cam === "walk" && <Joystick />}
    </div>
  );
}

function Lights({ room, evening }: { room: Room; evening: boolean }) {
  const b = bounds(room.outline);
  const cx = (b.minX + b.maxX) / 200, cz = (b.minY + b.maxY) / 200;
  const H = room.ceilingHeight / 100;
  const r = Math.hypot(b.w, b.h) / 200 + 1;
  // Put the sun outside the first window so light falls in through it.
  const win = room.openings.find((o) => o.kind === "window");
  const span = win && openingSpan(room, win);
  const out = span ? { x: -span.wall.inward.x, y: -span.wall.inward.y } : { x: -0.6, y: -0.8 };
  const along = span ? span.wall.dir : { x: 1, y: 0 };
  const sun: [number, number, number] = [cx + out.x * 6 + along.x * 2.2, 5.2, cz + out.y * 6 + along.y * 2.2];
  const target = useMemo(() => new THREE.Object3D(), []);
  target.position.set(cx, 0, cz);

  return (
    <>
      <hemisphereLight args={evening ? ["#5d6c94", "#2a2019", 0.35] : ["#f1f5ff", "#c9ad8a", 1.05]} />
      <ambientLight intensity={evening ? 0.08 : 0.2} />
      <primitive object={target} />
      {/* The only shadow-casting light, with a small 1024² shadow map. */}
      <directionalLight
        castShadow
        position={sun}
        target={target}
        intensity={evening ? 0.5 : 2.6}
        color={evening ? "#9fb2ff" : "#fff0d8"}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      >
        <orthographicCamera attach="shadow-camera" args={[-r, r, r, -r, 0.5, 30]} />
      </directionalLight>
      {evening && (
        <>
          <pointLight position={[cx, H - 0.45, cz]} intensity={4.5} distance={0} decay={2} color="#ffc98a" />
          <mesh position={[cx, H - 0.2, cz]}>
            <cylinderGeometry args={[0.2, 0.26, 0.22, 20, 1, true]} />
            <meshStandardMaterial color="#fff2da" emissive="#ffcf8f" emissiveIntensity={1.4} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </>
  );
}

function Joystick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const base = useRef<HTMLDivElement>(null);
  const R = 42;
  const move = (e: React.PointerEvent) => {
    const el = base.current;
    if (!el || !el.hasPointerCapture(e.pointerId)) return;
    const rect = el.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    setKnob({ x: dx, y: dy });
    walkInput.x = dx / R;
    walkInput.y = -dy / R;
    walkInput.kick();
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    walkInput.x = walkInput.y = 0;
  };
  return (
    <div
      ref={base}
      className="joystick"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
