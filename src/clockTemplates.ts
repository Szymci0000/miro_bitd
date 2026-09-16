import exampleTrackSvg from './assets/example-track.svg?raw';

import {
  CLOCK_SIZE,
  DEFAULT_EMPTY_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
  buildProgressClockDataUrl,
  type ProgressClockStyle,
} from './progressClockSvg';

const MIN_SLOTS = 2;
const MAX_SLOTS = 24;

export const PIE_TEMPLATE_ID = 'pie';
export const EXAMPLE_TRACK_SVG = exampleTrackSvg;

const COLLECTION_NAME = 'bitd-templates';
const INDEX_KEY = 'index';
const MAX_TEMPLATE_BYTES = 60_000;

export type ClockTemplate = {
  id: string;
  name: string;
  segments: number;
  svg: string;
  builtin: boolean;
  variableSegments?: boolean;
};

export type InspectResult =
  | {ok: true; segments: number; svg: string}
  | {ok: false; error: string};

const SHAPE_TAGS = new Set([
  'rect',
  'circle',
  'ellipse',
  'path',
  'polygon',
  'polyline',
]);

const builtinTracks: ClockTemplate[] = [4, 6, 8, 12].map((segments) => ({
  id: `track-${segments}`,
  name: `Track ${segments}`,
  segments,
  svg: buildLinearTrackSvg(segments),
  builtin: true,
}));

const pieTemplate: ClockTemplate = {
  id: PIE_TEMPLATE_ID,
  name: 'Pie clock',
  segments: 4,
  svg: '',
  builtin: true,
  variableSegments: true,
};

const templateCache = new Map<string, ClockTemplate>();

function collection() {
  return miro.board.storage.collection(COLLECTION_NAME);
}

function templateKey(id: string): string {
  return `t:${id}`;
}

function parseSlotNumber(element: Element): number | null {
  const dataSlot = element.getAttribute('data-slot');
  if (dataSlot) {
    const value = Number.parseInt(dataSlot, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const id = element.getAttribute('id');
  if (!id) {
    return null;
  }

  const match = /^slot-(\d+)$/i.exec(id);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function slotElements(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll('[data-slot], [id]')).filter(
    (element) => parseSlotNumber(element) !== null,
  );
}

function uniqueSlots(root: ParentNode): number[] {
  const slots = new Set<number>();
  for (const element of slotElements(root)) {
    const slot = parseSlotNumber(element);
    if (slot) {
      slots.add(slot);
    }
  }
  return [...slots].sort((a, b) => a - b);
}

function sanitizeSvg(svg: string): InspectResult {
  const trimmed = svg.trim();
  if (!trimmed || !/<svg[\s>]/i.test(trimmed)) {
    return {ok: false, error: 'File is not an SVG.'};
  }
  if (/<script/i.test(trimmed) || /javascript:/i.test(trimmed)) {
    return {ok: false, error: 'SVG must not contain scripts.'};
  }

  const parsed = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) {
    return {ok: false, error: 'Could not parse SVG.'};
  }

  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() !== 'svg') {
    return {ok: false, error: 'Root element must be <svg>.'};
  }

  parsed.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
  if (!root.getAttribute('xmlns')) {
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const slots = uniqueSlots(parsed);
  if (slots.length < MIN_SLOTS) {
    return {
      ok: false,
      error: `Add at least ${MIN_SLOTS} slots (data-slot="1" or id="slot-1").`,
    };
  }
  if (slots.length > MAX_SLOTS) {
    return {
      ok: false,
      error: `At most ${MAX_SLOTS} slots.`,
    };
  }
  const consecutive = slots.every((slot, index) => slot === index + 1);
  if (!consecutive) {
    return {
      ok: false,
      error: 'Slots must be numbered 1, 2, 3… with no gaps.',
    };
  }

  const serialized = new XMLSerializer().serializeToString(root);
  return {ok: true, segments: slots.length, svg: serialized};
}

export function inspectSvg(svg: string): InspectResult {
  return sanitizeSvg(svg);
}

function paintShape(element: Element, fill: string, stroke: string): void {
  const tag = element.tagName.toLowerCase();
  const fillAttr = element.getAttribute('fill');
  const strokeAttr = element.getAttribute('stroke');

  if (SHAPE_TAGS.has(tag) || (fillAttr && fillAttr !== 'none')) {
    element.setAttribute('fill', fill);
  }
  if (strokeAttr && strokeAttr !== 'none') {
    element.setAttribute('stroke', stroke);
  }

  for (const child of Array.from(element.children)) {
    paintShape(child, fill, stroke);
  }
}

export function renderTemplateSvg(
  source: string,
  filled: number,
  style: Partial<ProgressClockStyle> = {},
): string {
  const fillColor = style.fillColor ?? DEFAULT_FILL_COLOR;
  const emptyColor = style.emptyColor ?? DEFAULT_EMPTY_COLOR;
  const strokeColor = style.strokeColor ?? DEFAULT_STROKE_COLOR;
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  const clamped = Math.max(0, Math.floor(filled));

  for (const element of slotElements(parsed)) {
    const slot = parseSlotNumber(element);
    if (!slot) {
      continue;
    }

    const isFilled = slot <= clamped;
    const role = element.getAttribute('data-role');
    if (role === 'filled') {
      element.setAttribute('display', isFilled ? 'inline' : 'none');
      continue;
    }
    if (role === 'empty') {
      element.setAttribute('display', isFilled ? 'none' : 'inline');
      continue;
    }

    paintShape(element, isFilled ? fillColor : emptyColor, strokeColor);
  }

  return new XMLSerializer().serializeToString(root);
}

export function svgToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function viewBoxSize(svg: string): {width: number; height: number} | null {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return {width: parts[2], height: parts[3]};
    }
  }

  const width = Number.parseFloat(root.getAttribute('width') ?? '');
  const height = Number.parseFloat(root.getAttribute('height') ?? '');
  if (width > 0 && height > 0) {
    return {width, height};
  }

  return null;
}

export function imageWidthForSvg(svg: string): number {
  const size = viewBoxSize(svg);
  if (!size) {
    return CLOCK_SIZE;
  }

  if (size.width >= size.height) {
    return Math.round(Math.min(480, Math.max(CLOCK_SIZE, size.width)));
  }

  return CLOCK_SIZE;
}

function buildLinearTrackSvg(segments: number): string {
  const gap = 8;
  const pip = 40;
  const height = 48;
  const width = gap + segments * (pip + gap);
  const pips = Array.from({length: segments}, (_, index) => {
    const slot = index + 1;
    const x = gap + index * (pip + gap);
    return `<rect id="slot-${slot}" data-slot="${slot}" x="${x}" y="8" width="${pip}" height="32" rx="6" fill="${DEFAULT_EMPTY_COLOR}" stroke="${DEFAULT_STROKE_COLOR}" stroke-width="2"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g id="base"><rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="#f5f5f7"/></g>${pips}</svg>`;
}

function isBuiltinId(id: string): boolean {
  return id === PIE_TEMPLATE_ID || id.startsWith('track-');
}

export function listBuiltinTemplates(): ClockTemplate[] {
  return [pieTemplate, ...builtinTracks];
}

async function readIndex(): Promise<string[]> {
  const ids = await collection().get<string[]>(INDEX_KEY);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

export async function getTemplate(id: string): Promise<ClockTemplate | null> {
  const cached = templateCache.get(id);
  if (cached) {
    return cached;
  }

  const builtin = listBuiltinTemplates().find((template) => template.id === id);
  if (builtin) {
    templateCache.set(id, builtin);
    return builtin;
  }

  const stored = await collection().get<Omit<ClockTemplate, 'builtin'>>(
    templateKey(id),
  );
  if (!stored || typeof stored.svg !== 'string') {
    return null;
  }

  const template: ClockTemplate = {
    id: stored.id || id,
    name: stored.name || 'Custom track',
    segments: stored.segments,
    svg: stored.svg,
    builtin: false,
  };
  templateCache.set(id, template);
  return template;
}

export async function listSavedTemplates(): Promise<ClockTemplate[]> {
  const ids = await readIndex();
  const templates = await Promise.all(ids.map((id) => getTemplate(id)));
  return templates.filter((template): template is ClockTemplate => {
    return Boolean(template && !template.builtin);
  });
}

export async function listAllTemplates(): Promise<ClockTemplate[]> {
  const saved = await listSavedTemplates();
  return [...listBuiltinTemplates(), ...saved];
}

export async function saveTemplate(input: {
  name: string;
  svg: string;
}): Promise<ClockTemplate> {
  const inspected = inspectSvg(input.svg);
  if (!inspected.ok) {
    throw new Error(inspected.error);
  }

  const name = input.name.trim() || `Track ${inspected.segments}`;
  const template: ClockTemplate = {
    id: `custom-${Date.now().toString(36)}`,
    name,
    segments: inspected.segments,
    svg: inspected.svg,
    builtin: false,
  };

  const payload = {
    id: template.id,
    name: template.name,
    segments: template.segments,
    svg: template.svg,
  };
  if (JSON.stringify(payload).length > MAX_TEMPLATE_BYTES) {
    throw new Error('SVG is too large for Miro storage (keep under 60 KB).');
  }

  const ids = await readIndex();
  await collection().set(templateKey(template.id), payload);
  await collection().set(INDEX_KEY, [...ids, template.id]);
  templateCache.set(template.id, template);
  return template;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (isBuiltinId(id)) {
    return;
  }

  const ids = await readIndex();
  await collection().remove(templateKey(id));
  await collection().set(
    INDEX_KEY,
    ids.filter((entry) => entry !== id),
  );
  templateCache.delete(id);
}

export async function buildClockImageUrl(config: {
  templateId?: string;
  segments: number;
  filled: number;
  fillColor: string;
  emptyColor: string;
  strokeColor: string;
}): Promise<string> {
  const templateId = config.templateId || PIE_TEMPLATE_ID;
  const style = {
    fillColor: config.fillColor,
    emptyColor: config.emptyColor,
    strokeColor: config.strokeColor,
  };

  if (templateId === PIE_TEMPLATE_ID) {
    return buildProgressClockDataUrl(config.segments, config.filled, style);
  }

  const template = await getTemplate(templateId);
  if (!template?.svg) {
    return buildProgressClockDataUrl(config.segments, config.filled, style);
  }

  return svgToDataUrl(renderTemplateSvg(template.svg, config.filled, style));
}

export async function clockImageWidth(config: {
  templateId?: string;
}): Promise<number> {
  const templateId = config.templateId || PIE_TEMPLATE_ID;
  if (templateId === PIE_TEMPLATE_ID) {
    return CLOCK_SIZE;
  }

  const template = await getTemplate(templateId);
  if (!template?.svg) {
    return CLOCK_SIZE;
  }

  return imageWidthForSvg(template.svg);
}

export function previewDataUrl(
  template: ClockTemplate,
  filled: number,
  style: Partial<ProgressClockStyle> = {},
): string {
  if (template.id === PIE_TEMPLATE_ID) {
    return buildProgressClockDataUrl(template.segments, filled, style);
  }

  return svgToDataUrl(
    renderTemplateSvg(template.svg, filled, style),
  );
}
