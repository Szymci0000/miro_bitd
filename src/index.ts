import type {CustomAction, CustomEvent} from '@mirohq/websdk-types';

import {
  adjustCounter,
  COUNTER_KIND,
  COUNTER_METADATA_KIND,
  syncCounterPairPosition,
} from './counter';
import {
  adjustIfClock,
  CLOCK_KIND,
} from './progressClock';
import {adjustIfBar, BAR_KIND} from './progressBar';
import {trackItemGeometry} from './liveImage';
import {
  identifySelection,
  panelUrl,
  type SelectedWidget,
} from './selectedWidget';

/** Match counters, clocks, and progress bars (shared metadata key: kind). */
const adjustablePredicate = {
  type: 'image',
  [`metadata.${COUNTER_METADATA_KIND}`]: {
    $in: [COUNTER_KIND, CLOCK_KIND, BAR_KIND],
  },
};

let lastPanelKey: string | null = null;
let panelIsOpen = false;
let selectionPanelTimer: ReturnType<typeof setTimeout> | null = null;
let customEventsBound = false;
let actionsRegistered = false;

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

async function openItemPanel(widget: SelectedWidget): Promise<void> {
  const panelKey = `${widget.kind}:${widget.itemId}`;
  if (panelIsOpen && lastPanelKey === panelKey) {
    return;
  }

  lastPanelKey = panelKey;

  try {
    const opened = await miro.board.ui.openPanel({
      url: panelUrl(widget),
    });

    const waitForClose = (
      opened as {waitForClose?: () => Promise<unknown>} | undefined
    )?.waitForClose;
    if (typeof waitForClose === 'function') {
      panelIsOpen = true;
      void waitForClose().finally(() => {
        if (lastPanelKey === panelKey) {
          panelIsOpen = false;
          lastPanelKey = null;
        }
      });
    } else {
      panelIsOpen = false;
      lastPanelKey = null;
    }
  } catch (error) {
    panelIsOpen = false;
    lastPanelKey = null;
    console.error('Failed to open item panel', error);
  }
}

async function openPanelForSelection(
  items: Array<{type: string; id: string}>,
): Promise<void> {
  const widget = await identifySelection(items);
  if (!widget) {
    return;
  }

  await openItemPanel(widget);
}

async function openSelectedItemPanel(event: CustomEvent) {
  lastPanelKey = null;
  panelIsOpen = false;
  await openPanelForSelection(event.items);
}

async function registerBoardActions() {
  if (!customEventsBound) {
    await miro.board.ui.on('custom:item-decrement', (event) =>
      adjustSelected(event, -1),
    );
    await miro.board.ui.on('custom:item-increment', (event) =>
      adjustSelected(event, 1),
    );
    await miro.board.ui.on('custom:item-controls', openSelectedItemPanel);
    customEventsBound = true;
  }

  if (actionsRegistered) {
    return;
  }

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
        icon: 'edit',
        position: 3,
      },
    },
  ];

  for (const action of actions) {
    try {
      await miro.board.experimental.action.register(action);
    } catch (error) {
      console.error(`Failed to register action ${action.event}`, error);
    }
  }

  actionsRegistered = true;
}

export async function init() {
  trackItemGeometry();

  await miro.board.ui.on('icon:click', async () => {
    lastPanelKey = null;
    panelIsOpen = false;

    try {
      const selected = await miro.board.getSelection();
      const widget = await identifySelection(selected);
      if (widget) {
        await openItemPanel(widget);
        return;
      }
    } catch (error) {
      console.error('Failed to open panel for selection', error);
    }

    await miro.board.ui.openPanel({url: panelUrl()});
  });

  // Selecting a counter/clock/bar opens sidebar with -1/+1.
  await miro.board.ui.on('selection:update', ({items}) => {
    if (selectionPanelTimer) {
      clearTimeout(selectionPanelTimer);
    }
    selectionPanelTimer = setTimeout(() => {
      void openPanelForSelection(items);
    }, 150);
  });

  try {
    await miro.board.ui.on('experimental:items:update', async ({items}) => {
      await Promise.all(
        items.map((item: {type: string; id: string}) =>
          syncCounterPairPosition(item),
        ),
      );
    });
  } catch (error) {
    console.error('Failed to subscribe to item updates', error);
  }

  try {
    await registerBoardActions();
  } catch (error) {
    console.error('Failed to register board actions', error);
  }
}

init();
