type Border = "top" | "right" | "bottom" | "left";
type Direction = "forward" | "backward";

export interface Step {
  x: number; // row index (0..rows-1)
  y: number; // col index (0..cols-1)
  border: Border;
  direction: Direction;
}

interface GeneratePathOptions {
  rows: number;
  cols: number;
  start: Step; // must be an internal edge
  maxSteps?: number; // default 200
  avoidPerimeter?: boolean; // default true
  forwardBias?: number; // 0..1, default 0.5
  seed?: number | string; // NEW: deterministic seed (number or string)
}

/* ------------------------------------------------------------------ */
/*                             RNG (seeded)                           */
/* ------------------------------------------------------------------ */

// String -> 32-bit hash (FNV-1a)
function hashStr32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32 PRNG
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rng(): number {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed: number | string | undefined) {
  if (typeof seed === "number") return mulberry32(seed >>> 0);
  if (typeof seed === "string") return mulberry32(hashStr32(seed));
  // fallback: deterministic default seed so SSR/CSR match if you forget to pass one
  return mulberry32(0xdecafbad);
}

/* ------------------------------------------------------------------ */
/*                           Path generation                          */
/* ------------------------------------------------------------------ */

export function generateRandomPath({
  rows,
  cols,
  start,
  maxSteps = 200,
  avoidPerimeter = true,
  forwardBias = 0.5,
  seed,
}: GeneratePathOptions): Step[] {
  const rng = createRng(seed);

  if (!isInnerEdge(start, rows, cols)) {
    throw new Error(
      `Start edge (${start.border} @ ${start.x},${start.y}) is on the perimeter; choose an internal edge.`,
    );
  }

  const path: Step[] = [start];
  let current = start;

  for (let i = 1; i < maxSteps; i++) {
    const nextCandidates = candidatesFrom(current, rows, cols, avoidPerimeter);

    // Remove immediate reverse (including shared physical edge reverse)
    const filtered = nextCandidates.filter((c) => !isReverse(current, c));

    if (filtered.length === 0) break;

    const straight = filtered.filter((c) => headingEquals(current, c));
    const turns = filtered.filter((c) => !headingEquals(current, c));

    let next: Step | undefined;

    if (straight.length && rng() < forwardBias) {
      next = pickRandom(rng, straight);
    } else if (turns.length) {
      next = pickRandom(rng, turns);
    } else if (straight.length) {
      next = pickRandom(rng, straight);
    }

    if (!next) break;

    if (avoidPerimeter && !isInnerEdge(next, rows, cols)) {
      const alt = filtered.find((c) => isInnerEdge(c, rows, cols));
      if (!alt) break;
      next = alt;
    }

    path.push(next);
    current = next;
  }

  return path;
}

/* -------------------------- Helpers & Geometry -------------------------- */

function pickRandom<T>(rng: () => number, arr: T[]): T {
  return arr[(rng() * arr.length) | 0];
}

function isInnerEdge(step: Step, rows: number, cols: number): boolean {
  const { x, y, border } = step;
  switch (border) {
    case "top":
      return x > 0;
    case "bottom":
      return x < rows - 1;
    case "left":
      return y > 0;
    case "right":
      return y < cols - 1;
  }
}

function endCornerOf(step: Step): { i: number; j: number } {
  const { x, y, border, direction } = step;
  switch (border) {
    case "top":
      return direction === "forward" ? { i: x, j: y + 1 } : { i: x, j: y };
    case "bottom":
      return direction === "forward"
        ? { i: x + 1, j: y + 1 }
        : { i: x + 1, j: y };
    case "right":
      return direction === "forward"
        ? { i: x, j: y + 1 }
        : { i: x + 1, j: y + 1 };
    case "left":
      return direction === "forward" ? { i: x, j: y } : { i: x + 1, j: y };
  }
}

function heading(step: Step): { di: number; dj: number } {
  const { border, direction } = step;
  if (border === "top" || border === "bottom") {
    return direction === "forward" ? { di: 0, dj: 1 } : { di: 0, dj: -1 };
  } else {
    return direction === "forward" ? { di: -1, dj: 0 } : { di: 1, dj: 0 };
  }
}

function headingEquals(a: Step, b: Step) {
  const ha = heading(a);
  const hb = heading(b);
  return ha.di === hb.di && ha.dj === hb.dj;
}

function isReverse(a: Step, b: Step): boolean {
  if (a.x === b.x && a.y === b.y && a.border === b.border) {
    return a.direction !== b.direction;
  }
  const samePhysical =
    (a.border === "top" &&
      b.border === "bottom" &&
      b.x === a.x - 1 &&
      b.y === a.y) ||
    (a.border === "bottom" &&
      b.border === "top" &&
      b.x === a.x + 1 &&
      b.y === a.y) ||
    (a.border === "left" &&
      b.border === "right" &&
      b.x === a.x &&
      b.y === a.y - 1) ||
    (a.border === "right" &&
      b.border === "left" &&
      b.x === a.x &&
      b.y === a.y + 1);

  if (!samePhysical) return false;

  const ha = heading(a);
  const hb = heading(b);
  return ha.di === -hb.di && ha.dj === -hb.dj;
}

function candidatesFrom(
  current: Step,
  rows: number,
  cols: number,
  avoidPerimeter: boolean,
): Step[] {
  const { i, j } = endCornerOf(current);
  const out: Step[] = [];

  // → (to the right)
  if (j < cols && i > 0)
    out.push({ x: i, y: j, border: "top", direction: "forward" });
  // ← (to the left)
  if (j > 0 && i > 0)
    out.push({ x: i, y: j - 1, border: "top", direction: "backward" });
  // ↓ (down)
  if (i < rows && j > 0)
    out.push({ x: i, y: j, border: "left", direction: "backward" });
  // ↑ (up)
  if (i > 0 && j > 0)
    out.push({ x: i - 1, y: j, border: "left", direction: "forward" });

  return out.filter((s) =>
    avoidPerimeter ? isInnerEdge(s, rows, cols) : isInside(s, rows, cols),
  );
}

function isInside(step: Step, rows: number, cols: number): boolean {
  const { x, y } = step;
  return x >= 0 && y >= 0 && x < rows && y < cols;
}

export function createBorderNode(
  step: Step,
  doc: Document = document,
): HTMLDivElement {
  const sanitize = (s: string) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(s)) {
      throw new Error(`Invalid token: "${s}"`);
    }
    return s;
  };

  const border = sanitize(step.border);
  const direction = sanitize(step.direction);

  const outer = doc.createElement("div");
  const axis = border === "top" || border === "bottom" ? "y" : "x";
  outer.className = `bw-segment bw-${axis} bw-${border}`;

  const inner = doc.createElement("div");
  inner.className = `animate-bw-${border}-${direction}`;
  inner.addEventListener("animationend", () => outer.remove(), { once: true });

  outer.appendChild(inner);
  return outer;
}
