/**
 * How big a node actually draws.
 *
 * Both sides need this and they must agree. The server uses it to place an imported
 * document so nothing overlaps before the canvas has laid anything out, and the canvas
 * feeds the same numbers to ELK. When the two disagreed, imports arrived with long
 * statements stacked on a fixed pitch and overlapping each other.
 *
 * The constants mirror `.node` in styles.css: max-width 300px, 0.5rem/0.7rem padding,
 * 0.75rem text on a 1.4 line-height, plus the small modality and condition badges.
 * It is an estimate — a glyph-accurate measurement needs the DOM — but it errs on the
 * generous side, because leaving a gap too wide is a far cheaper mistake than an overlap.
 */

export const NODE_MAX_W = 300;
export const NODE_MIN_W = 120;

/** Vertical breathing room between stacked nodes. */
export const NODE_GAP_Y = 26;
/** Horizontal pitch between columns: max node width plus a gutter for edges. */
export const COL_PITCH = 380;
/** Space between one lead-in group and the next. */
export const GROUP_GAP_Y = 64;

const CHAR_W = 6.2; // 0.75rem system sans, measured average
const LINE_H = 17; // 12px * 1.4, rounded up
const PAD_Y = 18; // 0.5rem top and bottom, plus the border
const PAD_X = 24; // 0.7rem each side, plus the border
const BADGE_H = 15; // modality chip / condition flag
const MIN_H = 48;

export interface NodeMetricsInput {
  label?: string;
  kind?: string;
  modality?: unknown;
  condition?: unknown;
}

export interface NodeSize {
  w: number;
  h: number;
}

/** Gates are a fixed diamond-ish chip; their label is always "ALL of" / "ANY of". */
const FIXED: Record<string, NodeSize> = {
  gate: { w: 112, h: 56 },
};

export function estimateNodeSize(node: NodeMetricsInput): NodeSize {
  const fixed = node.kind ? FIXED[node.kind] : undefined;
  if (fixed) return { ...fixed };

  const label = (node.label ?? "").trim();
  const len = Math.max(label.length, 1);

  const w = Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, Math.round(PAD_X + len * CHAR_W)));
  const perLine = Math.max(12, Math.floor((w - PAD_X) / CHAR_W));
  const lines = Math.max(1, Math.ceil(len / perLine));

  const badges = (node.modality ? BADGE_H : 0) + (node.condition ? BADGE_H : 0);
  const h = Math.max(MIN_H, PAD_Y + lines * LINE_H + badges);

  return { w, h: Math.round(h) };
}

/** Where the next node in a stack starts. */
export function advance(y: number, node: NodeMetricsInput): number {
  return y + estimateNodeSize(node).h + NODE_GAP_Y;
}
