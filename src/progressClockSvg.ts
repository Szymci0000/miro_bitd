export const CLOCK_SIZE = 160;

export const DEFAULT_FILL_COLOR = '#4262ff';
export const DEFAULT_EMPTY_COLOR = '#e8edff';
export const DEFAULT_STROKE_COLOR = '#050038';

export type ProgressClockStyle = {
  fillColor: string;
  emptyColor: string;
  strokeColor: string;
};

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function segmentPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

/**
 * Progress clock: a circle divided into equal segments.
 * `filled` segments (from 12 o'clock, clockwise) use `fillColor`.
 */
export function buildProgressClockDataUrl(
  segments: number,
  filled: number,
  style: Partial<ProgressClockStyle> = {},
): string {
  const fillColor = style.fillColor ?? DEFAULT_FILL_COLOR;
  const emptyColor = style.emptyColor ?? DEFAULT_EMPTY_COLOR;
  const strokeColor = style.strokeColor ?? DEFAULT_STROKE_COLOR;

  const size = CLOCK_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const safeSegments = Math.max(2, Math.floor(segments));
  const step = 360 / safeSegments;
  const clamped = Math.max(0, Math.min(safeSegments, Math.floor(filled)));

  const wedges = Array.from({length: safeSegments}, (_, index) => {
    const start = index * step;
    const end = start + step;
    const isFilled = index < clamped;
    return `<path d="${segmentPath(cx, cy, radius, start, end)}" fill="${
      isFilled ? fillColor : emptyColor
    }" stroke="${strokeColor}" stroke-width="2"/>`;
  }).join('');

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="2"/>
  ${wedges}
  <circle cx="${cx}" cy="${cy}" r="10" fill="#ffffff" stroke="${strokeColor}" stroke-width="2"/>
</svg>`.trim();

  return toDataUrl(svg);
}
