import type {CustomEvent, Image} from '@mirohq/websdk-types';

import {
  DEFAULT_EMPTY_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
} from './progressClockSvg';
import {
  buildClockImageUrl,
  clockImageWidth,
  getTemplate,
  PIE_TEMPLATE_ID,
} from './clockTemplates';

export const CLOCK_KIND = 'progress-clock';
export const CLOCK_METADATA_KIND = 'kind';
export const CLOCK_METADATA_CONFIG = 'config';
export const CLOCK_METADATA_SEGMENTS = 'segments';
export const CLOCK_METADATA_FILLED = 'filled';
export const CLOCK_METADATA_FILL_COLOR = 'fillColor';
export const CLOCK_METADATA_EMPTY_COLOR = 'emptyColor';
export const CLOCK_METADATA_STROKE_COLOR = 'strokeColor';

export const CLOCK_SEGMENT_PRESETS = [4, 6, 8, 12] as const;
export const MIN_CLOCK_SEGMENTS = 2;
export const MAX_CLOCK_SEGMENTS = 24;

export type ProgressClockConfig = {
  templateId: string;
  segments: number;
  filled: number;
  fillColor: string;
  emptyColor: string;
  strokeColor: string;
};

type BoardItemLike = {
  type: string;
  id: string;
  getMetadata?: Image['getMetadata'];
};

const clockById = new Map<string, Image>();
const stateById = new Map<string, ProgressClockConfig>();
const desiredById = new Map<string, ProgressClockConfig>();
const writeChainById = new Map<string, Promise<ProgressClockConfig>>();

function isImage(item: {type: string}): item is Image {
  return item.type === 'image';
}

export function clampSegments(segments: number): number {
  return Math.max(
    MIN_CLOCK_SEGMENTS,
    Math.min(MAX_CLOCK_SEGMENTS, Math.floor(segments)),
  );
}

export function clampFilled(filled: number, segments: number): number {
  return Math.max(0, Math.min(segments, Math.floor(filled)));
}

function readColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function normalizeConfig(config: Partial<ProgressClockConfig>): ProgressClockConfig {
  const templateId =
    typeof config.templateId === 'string' && config.templateId
      ? config.templateId
      : PIE_TEMPLATE_ID;
  const segments = clampSegments(config.segments ?? 4);
  return {
    templateId,
    segments,
    filled: clampFilled(config.filled ?? 0, segments),
    fillColor: readColor(config.fillColor, DEFAULT_FILL_COLOR),
    emptyColor: readColor(config.emptyColor, DEFAULT_EMPTY_COLOR),
    strokeColor: readColor(config.strokeColor, DEFAULT_STROKE_COLOR),
  };
}

function parseConfig(meta: Record<string, unknown>): ProgressClockConfig | null {
  if (meta[CLOCK_METADATA_KIND] !== CLOCK_KIND) {
    return null;
  }

  const packed = meta[CLOCK_METADATA_CONFIG];
  if (packed && typeof packed === 'object' && !Array.isArray(packed)) {
    return normalizeConfig(packed as Partial<ProgressClockConfig>);
  }

  return normalizeConfig({
    segments:
      typeof meta[CLOCK_METADATA_SEGMENTS] === 'number'
        ? meta[CLOCK_METADATA_SEGMENTS]
        : 4,
    filled:
      typeof meta[CLOCK_METADATA_FILLED] === 'number'
        ? meta[CLOCK_METADATA_FILLED]
        : 0,
    fillColor: readColor(meta[CLOCK_METADATA_FILL_COLOR], DEFAULT_FILL_COLOR),
    emptyColor: readColor(meta[CLOCK_METADATA_EMPTY_COLOR], DEFAULT_EMPTY_COLOR),
    strokeColor: readColor(
      meta[CLOCK_METADATA_STROKE_COLOR],
      DEFAULT_STROKE_COLOR,
    ),
  });
}

async function asBoardItem(item: BoardItemLike): Promise<BoardItemLike> {
  const cached = clockById.get(item.id);
  if (cached) {
    return cached;
  }

  if (typeof item.getMetadata === 'function') {
    return item;
  }

  return miro.board.getById(item.id) as Promise<BoardItemLike>;
}

async function resolveClock(item: BoardItemLike): Promise<Image | null> {
  const cached = clockById.get(item.id);
  if (cached) {
    return cached;
  }

  const boardItem = await asBoardItem(item);
  if (
    !isImage(boardItem as Image) ||
    typeof boardItem.getMetadata !== 'function'
  ) {
    return null;
  }

  const image = boardItem as Image;
  const meta = await image.getMetadata();
  const state = parseConfig(meta);
  if (!state) {
    return null;
  }

  clockById.set(image.id, image);
  stateById.set(image.id, state);
  return image;
}

async function readState(clock: Image): Promise<ProgressClockConfig | null> {
  const cached = stateById.get(clock.id);
  if (cached) {
    return cached;
  }

  const meta = await clock.getMetadata();
  const state = parseConfig(meta);
  if (state) {
    stateById.set(clock.id, state);
  }
  return state;
}

function peekState(id: string): ProgressClockConfig | undefined {
  return desiredById.get(id) ?? stateById.get(id);
}

async function writeClock(
  clock: Image,
  next: ProgressClockConfig,
): Promise<void> {
  const template = next.templateId
    ? await getTemplate(next.templateId)
    : null;
  const segments = template?.variableSegments
    ? next.segments
    : template?.segments ?? next.segments;
  next.segments = segments;
  next.filled = clampFilled(next.filled, segments);

  clock.title = `${template?.name ?? 'Progress clock'} (${next.filled}/${next.segments})`;
  clock.url = await buildClockImageUrl(next);
  await clock.sync();
  await clock.setMetadata(CLOCK_METADATA_CONFIG, next);
  stateById.set(clock.id, next);
}

async function applyClockConfig(
  clock: Image,
  config: ProgressClockConfig,
): Promise<ProgressClockConfig> {
  const next = normalizeConfig(config);
  desiredById.set(clock.id, next);

  const previous = writeChainById.get(clock.id) ?? Promise.resolve(next);
  const current = previous.catch(() => next).then(async () => {
    const toWrite = desiredById.get(clock.id) ?? next;
    if (stateById.get(clock.id) !== toWrite) {
      await writeClock(clock, toWrite);
    }
    return desiredById.get(clock.id) ?? toWrite;
  });

  writeChainById.set(clock.id, current);
  try {
    return await current;
  } finally {
    if (writeChainById.get(clock.id) === current) {
      writeChainById.delete(clock.id);
    }
  }
}

export async function getClockState(item: {
  type: string;
  id: string;
}): Promise<ProgressClockConfig | null> {
  const clock = await resolveClock(item);
  if (!clock) {
    return null;
  }

  return peekState(clock.id) ?? readState(clock);
}

export async function setClockFilled(
  item: {type: string; id: string},
  filled: number,
): Promise<ProgressClockConfig | null> {
  const clock = await resolveClock(item);
  if (!clock) {
    return null;
  }

  const state = peekState(clock.id) ?? (await readState(clock));
  if (!state) {
    return null;
  }

  return applyClockConfig(clock, {...state, filled});
}

export async function updateClockConfig(
  item: {type: string; id: string},
  patch: Partial<ProgressClockConfig>,
): Promise<ProgressClockConfig | null> {
  const clock = await resolveClock(item);
  if (!clock) {
    return null;
  }

  const state = peekState(clock.id) ?? (await readState(clock));
  if (!state) {
    return null;
  }

  return applyClockConfig(clock, {...state, ...patch});
}

export async function createProgressClock(
  config: Partial<ProgressClockConfig> = {},
): Promise<Image> {
  let next = normalizeConfig(config);
  const template = next.templateId
    ? await getTemplate(next.templateId)
    : null;
  if (template && !template.variableSegments) {
    next = normalizeConfig({
      ...next,
      segments: template.segments,
    });
  }

  const clock = await miro.board.createImage({
    title: `${template?.name ?? 'Progress clock'} (${next.filled}/${next.segments})`,
    url: await buildClockImageUrl(next),
    width: await clockImageWidth(next),
  });

  await Promise.all([
    clock.setMetadata(CLOCK_METADATA_KIND, CLOCK_KIND),
    clock.setMetadata(CLOCK_METADATA_CONFIG, next),
  ]);

  clockById.set(clock.id, clock);
  stateById.set(clock.id, next);
  return clock;
}

export async function adjustIfClock(
  item: {type: string; id: string},
  delta: number,
): Promise<boolean> {
  const clock = await resolveClock(item);
  if (!clock) {
    return false;
  }

  const state = peekState(clock.id) ?? (await readState(clock));
  if (!state) {
    return false;
  }

  await applyClockConfig(clock, {...state, filled: state.filled + delta});
  return true;
}

export async function adjustClock(
  event: CustomEvent,
  delta: number,
): Promise<void> {
  await Promise.all(
    event.items.map((item) => adjustIfClock(item, delta)),
  );
}
