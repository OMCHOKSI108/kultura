/**
 * Kultura K — pixel mosaic mark.
 * Faithfully reproduced from the official Kultura.png reference.
 *
 * Structure (on a 10×10 grid, each unit = 1):
 *   Left bar  : x=0..2, y=0..10  (full height)
 *   Upper arm : stair-steps right-upward  (3 blocks)
 *   Lower arm : stair-steps right-downward (3 blocks)
 *
 * Color palette (top → bottom, light pink → deep crimson):
 *   row 0-1  #F4A7B9  light pink
 *   row 2-3  #E8697A  salmon-pink
 *   row 4-5  #E91E8C  hot pink  (waist / widest)
 *   row 6-7  #C2185B  magenta
 *   row 8-9  #8B0A3D  deep crimson
 */

function KGlyph({ size }: { size: number }) {
  // viewBox 10 wide × 10 tall
  const v = 10;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${v} ${v}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Left vertical bar (full height, 5 color bands) ── */}
      <rect x="0" y="0" width="2" height="2" fill="#F4A7B9" />
      <rect x="0" y="2" width="2" height="2" fill="#E8697A" />
      <rect x="0" y="4" width="2" height="2" fill="#E91E8C" />
      <rect x="0" y="6" width="2" height="2" fill="#C2185B" />
      <rect x="0" y="8" width="2" height="2" fill="#8B0A3D" />

      {/* ── Upper arm — stair-steps up-right ── */}
      {/* Step 1 (attaches to bar, upper-mid) */}
      <rect x="2" y="2" width="2" height="2" fill="#E8697A" />
      {/* Step 2 */}
      <rect x="4" y="1" width="2" height="2" fill="#E8697A" />
      {/* Step 3 — top-right block */}
      <rect x="6" y="0" width="3" height="2" fill="#F4A7B9" />

      {/* ── Waist connector ── */}
      <rect x="2" y="4" width="2" height="2" fill="#E91E8C" />

      {/* ── Lower arm — stair-steps down-right ── */}
      {/* Step 1 (attaches to bar, lower-mid) */}
      <rect x="2" y="6" width="2" height="2" fill="#C2185B" />
      {/* Step 2 */}
      <rect x="4" y="7" width="2" height="2" fill="#C2185B" />
      {/* Step 3 — bottom-right block */}
      <rect x="6" y="8" width="3" height="2" fill="#8B0A3D" />
    </svg>
  );
}

/**
 * Mistral "M" — official mark, reproduced on a 7×5 pixel grid.
 * Colour bands (top → bottom): yellow, orange, orange-red, red, crimson.
 */
const M_ROWS: { y: number; color: string; cols: number[] }[] = [
  { y: 0, color: "#FFAF01", cols: [1, 5] },
  { y: 1, color: "#FF8204", cols: [1, 2, 4, 5] },
  { y: 2, color: "#FA500F", cols: [1, 2, 3, 4, 5] },
  { y: 3, color: "#E10500", cols: [1, 3, 5] },
  { y: 4, color: "#C4001D", cols: [0, 1, 2, 4, 5, 6] },
];

function MGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {M_ROWS.map((row) =>
        row.cols.map((col) => (
          <rect key={`${row.y}-${col}`} x={col} y={row.y + 1} width="1" height="1" fill={row.color} />
        ))
      )}
    </svg>
  );
}

/** Sidebar rail logo — no background */
export function PixelMLogoBox({ size = 34 }: { size?: number }) {
  return <KGlyph size={size} />;
}

/** Welcome screen heading mark */
export function PixelMBare({ width = 44 }: { width?: number }) {
  return <KGlyph size={width} />;
}

/** Inline model badge icon — Mistral M */
export function MistralInline({ size = 16 }: { size?: number }) {
  return <MGlyph size={size} />;
}

/** Full wordmark: K mark + "Kultura" — for future use */
export function KulturaWordmark({ height = 28 }: { height?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <KGlyph size={height} />
      <span
        style={{
          fontSize: height * 0.75,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#F0F0F0",
          fontFamily: "var(--font-geist-sans)",
        }}
      >
        Kultura
      </span>
    </div>
  );
}
