import type {Image} from '@mirohq/websdk-types';

import {
  DEFAULT_EMPTY_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
} from './progressClockSvg';
import {selectCreated, viewportCenter} from './boardPlacement';
import {
  BAR_WIDTH,
  buildProgressBarDataUrl,
  clampBarFilled,
  clampBarSteps,
  clampTickEvery,
  type ProgressBarVisual,
} from './progressBarSvg';
import {getLiveImage} from './liveImage';

export const BAR_KIND = 'progress-bar';
export const BAR_METADATA_KIND = 'kind';
export const BAR_METADATA_CONFIG = 'config';

export type ProgressBarConfig = ProgressBarVisual;

type BoardItemLike = {
  type: string;
  id: string;
  getMetadata?: Image['getMetadata'];
};

const barById = new Map<string, Image>();
const stateById = new Map<string, ProgressBarConfig>();
const desiredById = new Map<string, ProgressBarConfig>();
const writeChainById = new Map<string, Promise<ProgressBarConfig>>();

function isImage(item: {type: string}): item is Image {
  return item.type === 'image';
}

function readColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function normalizeBarConfig(
  config: Partial<ProgressBarConfig>,
): ProgressBarConfig {
  const steps = clampBarSteps(config.steps ?? 10);
  return {
    steps,
    filled: clampBarFilled(config.filled ?? 0, steps),
    tickEvery: clampTickEvery(config.tickEvery ?? 0, steps),
    fillColor: readColor(config.fillColor, DEFAULT_FILL_COLOR),
    emptyColor: readColor(config.emptyColor, DEFAULT_EMPTY_COLOR),
    strokeColor: readColor(config.strokeColor, DEFAULT_STROKE_COLOR),
    tickColor: readColor(config.tickColor, config.strokeColor || DEFAULT_STROKE_COLOR),
  };
}

function parseConfig(meta: Record<string, unknown>): ProgressBarConfig | null {
  if (meta[BAR_METADATA_KIND] !== BAR_KIND) {
    return null;
  }

  const packed = meta[BAR_METADATA_CONFIG];
  if (packed && typeof packed === 'object' && !Array.isArray(packed)) {
    return normalizeBarConfig(packed as Partial<ProgressBarConfig>);
  }

  return null;
}

async function asBoardItem(item: BoardItemLike): Promise<BoardItemLike> {
  const cached = barById.get(item.id);
  if (cached) {
    return cached;
  }

  if (typeof item.getMetadata === 'function') {
    return item;
  }

  return miro.board.getById(item.id) as Promise<BoardItemLike>;
}

async function resolveBar(item: BoardItemLike): Promise<Image | null> {
  const cached = barById.get(item.id);
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

  barById.set(image.id, image);
  stateById.set(image.id, state);
  return image;
}

async function readState(bar: Image): Promise<ProgressBarConfig | null> {
  const cached = stateById.get(bar.id);
  if (cached) {
    return cached;
  }

  const meta = await bar.getMetadata();
  const state = parseConfig(meta);
  if (state) {
    stateById.set(bar.id, state);
  }
  return state;
}

function peekState(id: string): ProgressBarConfig | undefined {
  return desiredById.get(id) ?? stateById.get(id);
}

async function writeBar(bar: Image, next: ProgressBarConfig): Promise<void> {
  const normalized = normalizeBarConfig(next);
  next.steps = normalized.steps;
  next.filled = normalized.filled;
  next.tickEvery = normalized.tickEvery;
  next.fillColor = normalized.fillColor;
  next.emptyColor = normalized.emptyColor;
  next.strokeColor = normalized.strokeColor;
  next.tickColor = normalized.tickColor;

  const title = `Progress bar (${next.filled}/${next.steps})`;
  const url = buildProgressBarDataUrl(next);

  const live = await getLiveImage(bar.id);
  if (!live) {
    return;
  }

  live.title = title;
  live.url = url;
  await live.sync();
  await live.setMetadata(BAR_METADATA_CONFIG, next);
  barById.set(live.id, live);
  stateById.set(live.id, next);
}

async function applyBarConfig(
  bar: Image,
  config: ProgressBarConfig,
): Promise<ProgressBarConfig> {
  const next = normalizeBarConfig(config);
  desiredById.set(bar.id, next);

  const previous = writeChainById.get(bar.id) ?? Promise.resolve(next);
  const current = previous.catch(() => next).then(async () => {
    const toWrite = desiredById.get(bar.id) ?? next;
    if (stateById.get(bar.id) !== toWrite) {
      await writeBar(bar, toWrite);
    }
    return desiredById.get(bar.id) ?? toWrite;
  });

  writeChainById.set(bar.id, current);
  try {
    return await current;
  } finally {
    if (writeChainById.get(bar.id) === current) {
      writeChainById.delete(bar.id);
    }
  }
}

export async function getBarState(item: {
  type: string;
  id: string;
}): Promise<ProgressBarConfig | null> {
  const bar = await resolveBar(item);
  if (!bar) {
    return null;
  }

  return peekState(bar.id) ?? readState(bar);
}

export async function setBarFilled(
  item: {type: string; id: string},
  filled: number,
): Promise<ProgressBarConfig | null> {
  const bar = await resolveBar(item);
  if (!bar) {
    return null;
  }

  const state = peekState(bar.id) ?? (await readState(bar));
  if (!state) {
    return null;
  }

  return applyBarConfig(bar, {...state, filled});
}

export async function updateBarConfig(
  item: {type: string; id: string},
  patch: Partial<ProgressBarConfig>,
): Promise<ProgressBarConfig | null> {
  const bar = await resolveBar(item);
  if (!bar) {
    return null;
  }

  const state = peekState(bar.id) ?? (await readState(bar));
  if (!state) {
    return null;
  }

  return applyBarConfig(bar, {...state, ...patch});
}

export async function createProgressBar(
  config: Partial<ProgressBarConfig> = {},
): Promise<Image> {
  const next = normalizeBarConfig(config);
  const {x, y} = await viewportCenter();
  const bar = await miro.board.createImage({
    title: `Progress bar (${next.filled}/${next.steps})`,
    url: buildProgressBarDataUrl(next),
    width: BAR_WIDTH,
    x,
    y,
  });

  await Promise.all([
    bar.setMetadata(BAR_METADATA_KIND, BAR_KIND),
    bar.setMetadata(BAR_METADATA_CONFIG, next),
  ]);

  barById.set(bar.id, bar);
  stateById.set(bar.id, next);
  await selectCreated(bar);
  return bar;
}

export async function adjustIfBar(
  item: {type: string; id: string},
  delta: number,
): Promise<boolean> {
  const bar = await resolveBar(item);
  if (!bar) {
    return false;
  }

  const state = peekState(bar.id) ?? (await readState(bar));
  if (!state) {
    return false;
  }

  await applyBarConfig(bar, {...state, filled: state.filled + delta});
  return true;
}
