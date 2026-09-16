import {
  DEFAULT_EMPTY_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
} from './progressClockSvg';

export const BAR_WIDTH = 400;
export const BAR_HEIGHT = 48;
export const MIN_BAR_STEPS = 1;
export const MAX_BAR_STEPS = 1000;
export const BAR_TICK_PRESETS = [0, 1, 2, 4, 5, 10] as const;

export type ProgressBarStyle = {
  fillColor: string;
  emptyColor: string;
  strokeColor: string;
  tickColor: string;
};

export type ProgressBarVisual = ProgressBarStyle & {
  steps: number;
  filled: number;
  tickEvery: number;
};

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function clampBarSteps(steps: number): number {
  return Math.max(MIN_BAR_STEPS, Math.min(MAX_BAR_STEPS, Math.floor(steps)));
}

export function clampBarFilled(filled: number, steps: number): number {
  return Math.max(0, Math.min(steps, Math.floor(filled)));
}

export function clampTickEvery(tickEvery: number, steps: number): number {
  const value = Math.floor(tickEvery);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(value, steps);
}

export function buildProgressBarDataUrl(config: ProgressBarVisual): string {
  const steps = clampBarSteps(config.steps);
  const filled = clampBarFilled(config.filled, steps);
  const tickEvery = clampTickEvery(config.tickEvery, steps);
  const fillColor = config.fillColor || DEFAULT_FILL_COLOR;
  const emptyColor = config.emptyColor || DEFAULT_EMPTY_COLOR;
  const strokeColor = config.strokeColor || DEFAULT_STROKE_COLOR;
  const tickColor = config.tickColor || strokeColor;

  const pad = 2;
  const barY = 8;
  const barH = 32;
  const innerW = BAR_WIDTH - pad * 2;
  const radius = 8;
  const fillW = steps === 0 ? 0 : (filled / steps) * innerW;
  const clipId = 'bar-clip';

  const ticks: string[] = [];
  if (tickEvery > 0) {
    for (let mark = tickEvery; mark < steps; mark += tickEvery) {
      const x = (pad + (mark / steps) * innerW).toFixed(2);
      ticks.push(
        `<line x1="${x}" y1="${barY}" x2="${x}" y2="${barY + barH}" stroke="${tickColor}" stroke-width="2"/>`,
      );
    }
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" height="${BAR_HEIGHT}" viewBox="0 0 ${BAR_WIDTH} ${BAR_HEIGHT}">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${pad}" y="${barY}" width="${innerW}" height="${barH}" rx="${radius}"/>
    </clipPath>
  </defs>
  <rect x="${pad}" y="${barY}" width="${innerW}" height="${barH}" rx="${radius}" fill="${emptyColor}"/>
  <rect x="${pad}" y="${barY}" width="${fillW.toFixed(2)}" height="${barH}" fill="${fillColor}" clip-path="url(#${clipId})"/>
  ${ticks.join('')}
  <rect x="${pad}" y="${barY}" width="${innerW}" height="${barH}" rx="${radius}" fill="none" stroke="${strokeColor}" stroke-width="2"/>
</svg>`.trim();

  return toDataUrl(svg);
}
