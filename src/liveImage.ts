import type {Image} from '@mirohq/websdk-types';

type Geometry = {
  x: number;
  y: number;
  width: number;
  rotation: number;
  relativeTo?: Image['relativeTo'];
};

const geometryById = new Map<string, Geometry>();
let listening = false;

function isImage(item: {type: string}): item is Image {
  return item.type === 'image';
}

function readGeometry(item: Image): Geometry {
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    rotation: item.rotation,
    relativeTo: item.relativeTo,
  };
}

function applyGeometry(image: Image, geo: Geometry): void {
  image.x = geo.x;
  image.y = geo.y;
  image.width = geo.width;
  image.rotation = geo.rotation;
  if (geo.relativeTo) {
    image.relativeTo = geo.relativeTo;
  }
}

function rememberGeometry(item: {type: string; id: string}): void {
  if (!isImage(item)) {
    return;
  }

  geometryById.set(item.id, readGeometry(item));
}

/**
 * Board item objects keep the x/y from when they were first fetched.
 * sync() writes those stale coordinates back, so a later value change
 * teleports the item to where it was when the panel or cache last loaded.
 */
export function trackItemGeometry(): void {
  if (listening || typeof miro === 'undefined') {
    return;
  }

  listening = true;
  void miro.board.ui.on('experimental:items:update', ({items}) => {
    for (const item of items) {
      rememberGeometry(item);
    }
  });
}

export async function getLiveImage(id: string): Promise<Image | null> {
  trackItemGeometry();

  const live = await miro.board.getById(id);
  if (!isImage(live)) {
    return null;
  }

  const tracked = geometryById.get(id);
  if (tracked) {
    applyGeometry(live, tracked);
  } else {
    rememberGeometry(live);
  }

  return live;
}

trackItemGeometry();
