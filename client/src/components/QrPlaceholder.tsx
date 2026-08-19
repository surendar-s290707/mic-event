/**
 * CURRENT MOCK FUNCTIONALITY — this is a drawing, not a real QR code.
 *
 * It renders a deterministic module grid from the ticket code so every ticket
 * looks distinct and stable. Nothing can scan it.
 *
 * FUTURE: the `qrcode` package renders a real code whose payload is a signed,
 * short-lived token issued by the server (hard requirement #2). The component
 * boundary stays the same — only the inside of this file changes.
 */

const MODULES = 21;

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Fixed corner squares, like a real QR's finder patterns. */
function isFinder(row: number, col: number): boolean {
  const inBox = (r0: number, c0: number) =>
    row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
  return inBox(0, 0) || inBox(0, MODULES - 7) || inBox(MODULES - 7, 0);
}

function finderFilled(row: number, col: number): boolean {
  const r = row < 7 ? row : row - (MODULES - 7);
  const c = col < 7 ? col : col - (MODULES - 7);
  const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
  return ring !== 2;
}

export function QrPlaceholder({ value, size = 200 }: { value: string; size?: number }) {
  const seed = hash(value);
  const cells: { x: number; y: number }[] = [];

  for (let row = 0; row < MODULES; row += 1) {
    for (let col = 0; col < MODULES; col += 1) {
      const filled = isFinder(row, col)
        ? finderFilled(row, col)
        : ((seed >> (row % 16)) ^ (seed >> (col % 13)) ^ (row * 31 + col * 17)) % 3 === 0;
      if (filled) cells.push({ x: col, y: row });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MODULES} ${MODULES}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Placeholder QR code for ticket ${value}`}
    >
      <rect width={MODULES} height={MODULES} fill="var(--surface)" />
      {cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={1} height={1} fill="var(--ink)" />
      ))}
    </svg>
  );
}
