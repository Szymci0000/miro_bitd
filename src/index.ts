import type {CustomAction, CustomEvent} from '@mirohq/websdk-types';

import {
  adjustCounter,
  COUNTER_KIND,
  COUNTER_METADATA_KIND,
  resolveNumberImage,
  syncCounterPairPosition,
} from './counter';
import {
  adjustIfClock,
  CLOCK_KIND,
  getClockState,
} from './progressClock';
import {adjustIfBar, BAR_KIND, getBarState} from './progressBar';

/** Match counters, clocks, and progress bars (shared metadata key: kind). */
const adjustablePredicate = {
  type: 'image',
  [`metadata.${COUNTER_METADATA_KIND}`]: {
    $in: [COUNTER_KIND, CLOCK_KIND, BAR_KIND],
  },
};

let lastPanelKey: string | null = null;
let selectionPanelTimer: ReturnType<typeof setTimeout> | null = null;

async function adjustSelected(event: CustomEvent, delta: number) {
  const item = event.items[0];
  if (!item) {
    return;
  }

  if (await adjustIfClock(item, delta)) {
    return;
  }

  if (await adjustIfBar(item, delta)) {
    return;
  }

  await adjustCounter(event, delta);
}

async function openItemPanel(
  itemId: string,
  kind: 'counter' | 'clock' | 'bar',
): Promise<void> {
  const panelKey = `${kind}:${itemId}`;
  if (lastPanelKey === panelKey) {
    return;
  }
  lastPanelKey = panelKey;

  await miro.board.ui.openPanel({
    url: `app.html?itemId=${encodeURIComponent(itemId)}&kind=${kind}`,
  });
}

async function openPanelForSelection(
  items: Array<{type: string; id: string}>,
): Promise<void> {
  if (items.length !== 1) {
    return;
  }

  const item = items[0];

  if (await getClockState(item)) {
    await openItemPanel(item.id, 'clock');
    return;
  }

  if (await getBarState(item)) {
    await openItemPanel(item.id, 'bar');
    return;
  }

  const numberImage = await resolveNumberImage(item);
  if (numberImage) {
    await openItemPanel(numberImage.id, 'counter');
  }
}

async function openSelectedItemPanel(event: CustomEvent) {
  lastPanelKey = null;
  await openPanelForSelection(event.items);
}

async function registerBoardActions() {
  await miro.board.ui.on('custom:item-decrement', (event) =>
    adjustSelected(event, -1),
  );
  await miro.board.ui.on('custom:item-increment', (event) =>
    adjustSelected(event, 1),
  );
  await miro.board.ui.on('custom:item-controls', openSelectedItemPanel);

  for (const eventName of [
    'item-decrement',
    'item-increment',
    'item-controls',
    'counter-settings',
    'counter-decrement',
    'counter-increment',
  ]) {
    try {
      await miro.board.experimental.action.deregister(eventName);
    } catch {
      // Not registered yet.
    }
  }

  const actions: CustomAction[] = [
    {
      event: 'item-decrement',
      selection: 'single',
      scope: 'local',
      contexts: {item: {}},
      predicate: adjustablePredicate,
      ui: {
        label: '-1',
        description: 'Decrease by 1 / unfill one step',
        icon: 'arrow-left',
        position: 1,
      },
    },
    {
      event: 'item-increment',
      selection: 'single',
      scope: 'local',
      contexts: {item: {}},
      predicate: adjustablePredicate,
      ui: {
        label: '+1',
        description: 'Increase by 1 / fill one step',
        icon: 'arrow-right',
        position: 2,
      },
    },
    {
      event: 'item-controls',
      selection: 'single',
      scope: 'local',
      contexts: {item: {}},
      predicate: adjustablePredicate,
      ui: {
        label: 'Controls',
        description: 'Open -1 / +1 controls in the sidebar',
        icon: 'square-pencil',
        position: 3,
      },
    },
  ];

  for (const action of actions) {
    try {
      await miro.board.experimental.action.register(action);
    } catch (error) {
      console.error(`Failed to register action ${action.event}`, error);
      await miro.board.notifications.showError(
        `Failed to register ${action.ui?.label ?? action.event}`,
      );
    }
  }
}

export async function init() {
  await miro.board.ui.on('icon:click', async () => {
    lastPanelKey = null;
    await miro.board.ui.openPanel({url: 'app.html'});
  });

  // Selecting a counter/clock opens sidebar with -1/+1.
  await miro.board.ui.on('selection:update', ({items}) => {
    if (selectionPanelTimer) {
      clearTimeout(selectionPanelTimer);
    }
    selectionPanelTimer = setTimeout(() => {
      void openPanelForSelection(items);
    }, 150);
  });

  await miro.board.ui.on('experimental:items:update', async ({items}) => {
    await Promise.all(
      items.map((item: {type: string; id: string}) =>
        syncCounterPairPosition(item),
      ),
    );
  });

  try {
    await registerBoardActions();
  } catch (error) {
    console.error('Failed to register board actions', error);
  }
}

init();
