// Small inline icon set (stroke icons, 24×24 grid) so the single-file build needs no icon font.
const PATHS: Record<string, string> = {
  undo: "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  share: "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7 M16 6l-4-4-4 4 M12 2v13",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  fit: "M3 8V5a2 2 0 0 1 2-2h3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M8 21H5a2 2 0 0 1-2-2v-3",
  copy: "M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z M4 16V5a2 2 0 0 1 2-2h9",
  trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z",
  compare: "M3 4h7v16H3z M14 4h7v16h-7z",
  rotate: "M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5",
  box: "M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z M3.3 7 12 12l8.7-5 M12 22V12",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  in: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M6.3 17.7l-1.4 1.4 M19.1 4.9l-1.4 1.4",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
  orbit: "M12 2a10 4 0 1 0 0 .01 M2 12a10 4 0 0 0 20 0 M12 2v20",
  top: "M3 3h18v18H3z M3 9h18 M9 21V9",
  wall: "M3 5h18v14H3z M3 12h18 M9 5v7 M15 12v7",
  walk: "M13 4a1.5 1.5 0 1 0 0 .01 M7 21l3-7 M13 21v-5l-3-3 1-6 M8 11l3-4 3 3 3 1",
  door: "M13 4h3a2 2 0 0 1 2 2v14 M2 20h20 M13 20V3.5a1 1 0 0 0-1.3-1L5 4.2V20 M10 12v.01",
  blinds: "M3 3h18 M4 3v10 M20 3v10 M4 7h16 M4 11h16 M12 13v5 M11 20a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  check: "M20 6 9 17l-5-5",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z M12 9v4 M12 17h.01",
  error: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M15 9l-6 6 M9 9l6 6",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 16v-4 M12 8h.01",
  close: "M18 6 6 18 M6 6l12 12",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  more: "M12 12h.01 M19 12h.01 M5 12h.01",
  child: "M12 6a2 2 0 1 0 0-.01 M9 22v-6H7l2-6h6l2 6h-2v6",
  adult: "M12 5a2 2 0 1 0 0-.01 M9 22V13H7V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4h-2v9",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5",
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
