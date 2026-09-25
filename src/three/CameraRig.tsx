import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FurnitureItem, Room, Vec2 } from "../model/types";
import { bounds } from "../geometry/polygon";
import { canStandAt } from "../geometry/snap";
import { getWalls, openingSpan } from "../geometry/room";
import type { CameraMode } from "../state/store";

const FOV = 50;
const WALK_FOV = 70;
const EYE_ADULT = 160;
const EYE_CHILD = 105;
const BODY_RADIUS = 22; // cm, how close you can get to walls and furniture
const SPEED = 140; // cm per second

/**
 * Shared walk-mode state outside React (it changes every frame): joystick
 * input written by the HTML overlay, and the walker's plan position that the
 * 2D plan draws as a "you are here" marker.
 */
export const walkInput = { x: 0, y: 0, kick: () => {}, pos: null as Vec2 | null, yaw: 0 };

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

function poseFor(mode: CameraMode, room: Room, aspect: number): Pose | null {
  const b = bounds(room.outline);
  const cx = (b.minX + b.maxX) / 200, cz = (b.minY + b.maxY) / 200;
  const H = room.ceilingHeight / 100;
  if (mode === "orbit") {
    // Fit the room's bounding sphere into the narrower of the two fields of
    // view, so a tall, narrow pane (phone, stacked layout) still shows it all.
    // The extra 15% is headroom: under perspective, the near corners look
    // bigger than the sphere suggests.
    const R = (Math.hypot(b.w / 100, b.h / 100, H * 0.6) / 2) * 1.15;
    const vfov = (FOV * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = R / Math.sin(Math.min(vfov, hfov) / 2);
    const az = (28 * Math.PI) / 180, el = (46 * Math.PI) / 180;
    const target = new THREE.Vector3(cx, 0.6, cz);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    return { pos: target.clone().addScaledVector(dir, dist), target };
  }
  if (mode === "top") {
    const vfov = (FOV * Math.PI) / 180;
    const fitH = b.h / 100 / 2 / Math.tan(vfov / 2);
    const fitW = b.w / 100 / 2 / Math.tan(vfov / 2) / aspect;
    // Tiny z offset: looking exactly straight down confuses the orbit controls' "up".
    return { pos: new THREE.Vector3(cx, Math.max(fitH, fitW) * 1.12 + H, cz + 0.001), target: new THREE.Vector3(cx, 0, cz) };
  }
  if (mode.startsWith("wall-")) {
    const w = getWalls(room)[Number(mode.slice(5))];
    if (!w) return null;
    const mid = { x: (w.a.x + w.b.x) / 200, z: (w.a.y + w.b.y) / 200 };
    const vfov = (FOV * Math.PI) / 180;
    const dist = Math.max(H / 2 / Math.tan(vfov / 2), w.length / 100 / 2 / Math.tan(vfov / 2) / aspect) * 1.12;
    return {
      pos: new THREE.Vector3(mid.x + w.inward.x * dist, H * 0.5, mid.z + w.inward.y * dist),
      target: new THREE.Vector3(mid.x, H * 0.5, mid.z),
    };
  }
  return null;
}

export function CameraRig({ mode, room, items, child }: { mode: CameraMode; room: Room; items: FurnitureItem[]; child: boolean }) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const anim = useRef<{ from: Pose; to: Pose; t: number } | null>(null);
  const firstRun = useRef(true);
  const prevMode = useRef<CameraMode>(mode);
  /** Once the user orbits/zooms, pane resizes stop re-framing the camera. */
  const userMoved = useRef(false);
  const aspect = size.width / Math.max(1, size.height);
  const aspectKey = Math.round(aspect * 10);
  const lastKey = useRef({ mode, outline: room.outline, ceiling: room.ceilingHeight });

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (mode === "walk") {
      prevMode.current = mode;
      return;
    }
    cam.fov = FOV;
    cam.updateProjectionMatrix();
    // A pure resize (same mode, same room) only re-frames until the user takes over.
    const k = lastKey.current;
    const onlyResized = k.mode === mode && k.outline === room.outline && k.ceiling === room.ceilingHeight;
    lastKey.current = { mode, outline: room.outline, ceiling: room.ceilingHeight };
    if (onlyResized && !firstRun.current && userMoved.current) return;
    if (!onlyResized) userMoved.current = false;
    const to = poseFor(mode, room, aspect);
    if (!to) return;
    const ctl = controls.current;
    // Coming back from walk mode the controls are brand new (target at the
    // origin), so start the transition from a point just in front of the eye.
    const fromWalk = prevMode.current === "walk";
    prevMode.current = mode;
    const ahead = cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
    const from: Pose = { pos: cam.position.clone(), target: fromWalk || !ctl ? ahead : ctl.target.clone() };
    if (firstRun.current || onlyResized) {
      firstRun.current = false;
      cam.position.copy(to.pos);
      ctl?.target.copy(to.target);
      ctl?.update();
      invalidate();
      return;
    }
    anim.current = { from, to, t: 0 };
    invalidate();
    // Re-aim when the mode, the room's size or the pane's shape changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, room.outline, room.ceilingHeight, aspectKey]);

  useFrame((_, dt) => {
    const a = anim.current;
    const ctl = controls.current;
    if (!a || !ctl) return;
    a.t = Math.min(1, a.t + dt / 0.7);
    const e = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.from.pos, a.to.pos, e);
    ctl.target.lerpVectors(a.from.target, a.to.target, e);
    ctl.update();
    if (a.t >= 1) anim.current = null;
    invalidate();
  });

  if (mode === "walk") return <WalkControls room={room} items={items} child={child} />;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={0.8}
      maxDistance={25}
      maxPolarAngle={Math.PI * 0.495}
      onStart={() => {
        anim.current = null;
        userMoved.current = true;
      }}
    />
  );
}

/** First-person walking. Position is tracked in plan centimetres so collisions reuse the 2D geometry. */
function WalkControls({ room, items, child }: { room: Room; items: FurnitureItem[]; child: boolean }) {
  const { camera, gl, invalidate } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(-0.05);
  const eye = useRef(child ? EYE_CHILD : EYE_ADULT);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const spawn = useMemo<{ p: Vec2; yaw: number }>(() => {
    const b = bounds(room.outline);
    const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const door = room.openings.find((o) => o.kind === "door");
    let start = centre;
    let face = { x: 0, y: -1 };
    const span = door && openingSpan(room, door);
    if (span) {
      start = { x: (span.a.x + span.b.x) / 2 + span.wall.inward.x * 55, y: (span.a.y + span.b.y) / 2 + span.wall.inward.y * 55 };
      face = span.wall.inward;
    }
    // Spiral outward until we find a free spot.
    let p = start;
    outer: for (let r = 0; r < 400; r += 10) {
      for (let a = 0; a < 360; a += r ? Math.max(8, 600 / r) : 360) {
        const q = { x: start.x + Math.cos((a * Math.PI) / 180) * r, y: start.y + Math.sin((a * Math.PI) / 180) * r };
        if (canStandAt(room, items, q, BODY_RADIUS)) {
          p = q;
          break outer;
        }
      }
    }
    // three's camera looks down -z at yaw 0; yaw turns it counter-clockwise from above.
    return { p, yaw: Math.atan2(-face.x, -face.y) };
    // Only re-spawn when entering walk mode or the room changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  const pos = useRef<Vec2>(spawn.p);

  useEffect(() => {
    pos.current = spawn.p;
    yaw.current = spawn.yaw;
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = WALK_FOV;
    cam.updateProjectionMatrix();
    cam.rotation.order = "YXZ";
    walkInput.kick = invalidate;
    invalidate();
  }, [spawn, camera, invalidate]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        keys.current.add(k);
        invalidate();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);

    // Drag anywhere on the canvas to look around (mouse or touch).
    const el = gl.domElement;
    let last: { x: number; y: number; id: number } | null = null;
    const pd = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const pm = (e: PointerEvent) => {
      if (!last || e.pointerId !== last.id) return;
      yaw.current -= (e.clientX - last.x) * 0.005;
      pitch.current = Math.max(-1.3, Math.min(1.3, pitch.current - (e.clientY - last.y) * 0.004));
      last = { x: e.clientX, y: e.clientY, id: e.pointerId };
      invalidate();
    };
    const pu = (e: PointerEvent) => {
      if (last?.id === e.pointerId) last = null;
    };
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      keys.current.clear();
      walkInput.pos = null;
    };
  }, [gl, invalidate]);

  useEffect(() => {
    invalidate();
  }, [child, invalidate]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    let fwd = walkInput.y, strafe = walkInput.x;
    if (k.has("w") || k.has("arrowup")) fwd += 1;
    if (k.has("s") || k.has("arrowdown")) fwd -= 1;
    if (k.has("d")) strafe += 1;
    if (k.has("a")) strafe -= 1;
    // Arrow left/right turn instead of strafing: easier for people new to games.
    if (k.has("arrowleft")) yaw.current += 1.8 * dt;
    if (k.has("arrowright")) yaw.current -= 1.8 * dt;
    let active = k.size > 0 || walkInput.x !== 0 || walkInput.y !== 0;

    if (fwd || strafe) {
      const len = Math.min(1, Math.hypot(fwd, strafe));
      const n = Math.hypot(fwd, strafe) || 1;
      const f = { x: -Math.sin(yaw.current), y: -Math.cos(yaw.current) };
      const r = { x: Math.cos(yaw.current), y: -Math.sin(yaw.current) };
      const step = SPEED * dt * len;
      const dx = ((f.x * fwd + r.x * strafe) / n) * step;
      const dy = ((f.y * fwd + r.y * strafe) / n) * step;
      const p = pos.current;
      const ok = (q: Vec2) => canStandAt(room, itemsRef.current, q, BODY_RADIUS);
      const stuck = !ok(p); // e.g. furniture was moved onto you: let you walk out
      const tries = [{ x: p.x + dx, y: p.y + dy }, { x: p.x + dx, y: p.y }, { x: p.x, y: p.y + dy }];
      // Slide along walls: if the full step is blocked, try each axis alone.
      const next = tries.find(ok) ?? (stuck ? tries[0] : undefined);
      if (next) pos.current = next;
    }

    const targetEye = child ? EYE_CHILD : EYE_ADULT;
    if (Math.abs(eye.current - targetEye) > 0.5) {
      eye.current += (targetEye - eye.current) * Math.min(1, dt * 8);
      active = true;
    } else eye.current = targetEye;

    walkInput.pos = pos.current;
    walkInput.yaw = yaw.current;
    camera.position.set(pos.current.x / 100, eye.current / 100, pos.current.y / 100);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    if (active) invalidate();
  });

  return null;
}
