import {resolveNumberImage} from './counter';
import {getClockState} from './progressClock';
import {getBarState} from './progressBar';

export type WidgetKind = 'counter' | 'clock' | 'bar';

export type SelectedWidget = {
  itemId: string;
  kind: WidgetKind;
};

export function panelUrl(widget?: SelectedWidget): string {
  const url = new URL('app.html', window.location.href);
  if (widget) {
    url.searchParams.set('itemId', widget.itemId);
    url.searchParams.set('kind', widget.kind);
  }

  return `${url.pathname}${url.search}`;
}

export async function identifySelection(
  items: Array<{type: string; id: string}>,
): Promise<SelectedWidget | null> {
  if (items.length !== 1) {
    return null;
  }

  return identifyItem(items[0]);
}

export async function identifyItem(item: {
  type: string;
  id: string;
}): Promise<SelectedWidget | null> {
  try {
    if (await getClockState(item)) {
      return {itemId: item.id, kind: 'clock'};
    }

    if (await getBarState(item)) {
      return {itemId: item.id, kind: 'bar'};
    }

    const numberImage = await resolveNumberImage(item);
    if (numberImage) {
      return {itemId: numberImage.id, kind: 'counter'};
    }
  } catch (error) {
    console.error('Failed to identify selected widget', error);
  }

  return null;
}
