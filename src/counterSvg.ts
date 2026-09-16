import shapeSvg from './assets/counter-shape.svg?raw';
import numberSvg from './assets/counter-number.svg?raw';

export const COUNTER_SIZE = 140;

function toDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Static shape background — created once, not updated on +/-. */
export function buildShapeDataUrl(): string {
  return toDataUrl(shapeSvg);
}

/** Number-only layer — this is what we re-render on +/-. */
export function buildNumberDataUrl(value: number): string {
  return toDataUrl(numberSvg.replaceAll('{{value}}', String(value)));
}
