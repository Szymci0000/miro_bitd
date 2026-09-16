import type {CustomEvent, Image} from '@mirohq/websdk-types';

import {
  buildNumberDataUrl,
  buildShapeDataUrl,
  COUNTER_SIZE,
} from './counterSvg';

export const COUNTER_KIND = 'counter';
export const COUNTER_METADATA_KIND = 'kind';
export const COUNTER_METADATA_ROLE = 'role';
export const COUNTER_METADATA_VALUE = 'value';
export const COUNTER_METADATA_PAIR_ID = 'pairId';
export const COUNTER_ROLE_SHAPE = 'shape';
export const COUNTER_ROLE_NUMBER = 'number';

/** Skip move-sync echoes while we are writing. */
const writingIds = new Set<string>();

type BoardItemLike = {
  type: string;
  id: string;
  getMetadata?: Image['getMetadata'];
  getItems?: () => Promise<BoardItemLike[]>;
};

function isImage(item: {type: string}): item is Image {
  return item.type === 'image';
}

async function asBoardItem(item: BoardItemLike): Promise<BoardItemLike> {
  if (typeof item.getMetadata === 'function') {
    return item;
  }

  return miro.board.getById(item.id) as Promise<BoardItemLike>;
}

async function withWriting(id: string, run: () => Promise<void>): Promise<void> {
  writingIds.add(id);
  try {
    await run();
  } finally {
    writingIds.delete(id);
  }
}

async function getStoredValue(numberImage: Image): Promise<number> {
  const metadataValue = await numberImage.getMetadata(COUNTER_METADATA_VALUE);
  if (typeof metadataValue === 'number') {
    return metadataValue;
  }

  return Number.parseInt(numberImage.title.replace(/\D/g, ''), 10) || 0;
}

export async function resolveNumberImage(item: {
  type: string;
  id: string;
}): Promise<Image | null> {
  const boardItem = await asBoardItem(item);

  if (boardItem.type === 'group' && typeof boardItem.getItems === 'function') {
    const grouped = await boardItem.getItems();
    for (const child of grouped) {
      const numberImage = await resolveNumberImage(child);
      if (numberImage) {
        return numberImage;
      }
    }
    return null;
  }

  if (!isImage(boardItem as Image) || typeof boardItem.getMetadata !== 'function') {
    return null;
  }

  const image = boardItem as Image;
  const kind = await image.getMetadata(COUNTER_METADATA_KIND);
  if (kind !== COUNTER_KIND) {
    return null;
  }

  const role = await image.getMetadata(COUNTER_METADATA_ROLE);
  if (role === COUNTER_ROLE_NUMBER) {
    return image;
  }

  if (role === COUNTER_ROLE_SHAPE) {
    const numberId = await image.getMetadata(COUNTER_METADATA_PAIR_ID);
    if (typeof numberId !== 'string') {
      return null;
    }

    const paired = await miro.board.getById(numberId);
    return isImage(paired) ? paired : null;
  }

  return null;
}

export async function createCounter(initialValue = 0): Promise<Image> {
  const shape = await miro.board.createImage({
    title: 'Counter shape',
    url: buildShapeDataUrl(),
    width: COUNTER_SIZE,
  });

  // Number sits on top (same size) so a single click selects it.
  // We avoid grouping: Miro custom actions can't target "groups that contain
  // counters" (groups have no metadata), so grouped counters need a double-click.
  const number = await miro.board.createImage({
    title: `Counter ${initialValue}`,
    url: buildNumberDataUrl(initialValue),
    width: COUNTER_SIZE,
    x: shape.x,
    y: shape.y,
  });

  await shape.setMetadata(COUNTER_METADATA_KIND, COUNTER_KIND);
  await shape.setMetadata(COUNTER_METADATA_ROLE, COUNTER_ROLE_SHAPE);
  await shape.setMetadata(COUNTER_METADATA_PAIR_ID, number.id);

  await number.setMetadata(COUNTER_METADATA_KIND, COUNTER_KIND);
  await number.setMetadata(COUNTER_METADATA_ROLE, COUNTER_ROLE_NUMBER);
  await number.setMetadata(COUNTER_METADATA_PAIR_ID, shape.id);
  await number.setMetadata(COUNTER_METADATA_VALUE, initialValue);

  await number.bringToFront();

  return number;
}

export async function getCounterValue(item: {
  type: string;
  id: string;
}): Promise<number | null> {
  const numberImage = await resolveNumberImage(item);
  if (!numberImage) {
    return null;
  }

  return getStoredValue(numberImage);
}

export async function setCounterValue(
  item: {type: string; id: string},
  value: number,
): Promise<void> {
  const numberImage = await resolveNumberImage(item);
  if (!numberImage) {
    return;
  }

  await withWriting(numberImage.id, async () => {
    numberImage.title = `Counter ${value}`;
    numberImage.url = buildNumberDataUrl(value);
    await numberImage.sync();
    await numberImage.setMetadata(COUNTER_METADATA_VALUE, value);
  });
}

export async function adjustCounter(
  event: CustomEvent,
  delta: number,
): Promise<void> {
  await Promise.all(
    event.items.map(async (item) => {
      const current = await getCounterValue(item);
      if (current === null) {
        return;
      }

      await setCounterValue(item, current + delta);
    }),
  );
}

/**
 * If one half of the counter moves, keep the other aligned.
 * Shape URL is never rewritten — only the number image re-renders on value change.
 */
export async function syncCounterPairPosition(item: {
  type: string;
  id: string;
}): Promise<void> {
  if (writingIds.has(item.id) || !isImage(item)) {
    return;
  }

  const kind = await item.getMetadata(COUNTER_METADATA_KIND);
  if (kind !== COUNTER_KIND) {
    return;
  }

  const pairId = await item.getMetadata(COUNTER_METADATA_PAIR_ID);
  if (typeof pairId !== 'string') {
    return;
  }

  const paired = await miro.board.getById(pairId);
  if (!isImage(paired) || writingIds.has(paired.id)) {
    return;
  }

  if (paired.x === item.x && paired.y === item.y && paired.width === item.width) {
    return;
  }

  await withWriting(paired.id, async () => {
    paired.x = item.x;
    paired.y = item.y;
    paired.width = item.width;
    await paired.sync();
  });
}
