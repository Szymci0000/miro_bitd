import * as React from 'react';
import {createRoot} from 'react-dom/client';

import {
  createCounter,
  getCounterValue,
  setCounterValue,
} from './counter';
import {
  CLOCK_SEGMENT_PRESETS,
  MAX_CLOCK_SEGMENTS,
  MIN_CLOCK_SEGMENTS,
  clampFilled,
  createProgressClock,
  getClockState,
  setClockFilled,
  updateClockConfig,
  type ProgressClockConfig,
} from './progressClock';
import {
  DEFAULT_EMPTY_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
} from './progressClockSvg';
import {
  getTemplate,
  listAllTemplates,
  listBuiltinTemplates,
  PIE_TEMPLATE_ID,
  previewDataUrl,
  type ClockTemplate,
} from './clockTemplates';
import {
  createProgressBar,
  getBarState,
  setBarFilled,
  updateBarConfig,
  type ProgressBarConfig,
} from './progressBar';
import {
  BAR_TICK_PRESETS,
  MAX_BAR_STEPS,
  MIN_BAR_STEPS,
  buildProgressBarDataUrl,
  clampBarFilled,
} from './progressBarSvg';
import {TemplateLibrary} from './templatePanel';
import '../src/assets/style.css';

function getPanelParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    itemId: params.get('itemId'),
    kind: params.get('kind') as 'counter' | 'clock' | 'bar' | null,
  };
}

const goHome = () => {
  window.location.href = 'app.html';
};

const AdjustButtons: React.FC<{
  disabled?: boolean;
  onAdjust: (delta: number) => void;
}> = ({disabled, onAdjust}) => (
  <div className="actions-row">
    <button
      className="button button-primary"
      type="button"
      disabled={disabled}
      onClick={() => onAdjust(-1)}
    >
      -1
    </button>
    <button
      className="button button-primary"
      type="button"
      disabled={disabled}
      onClick={() => onAdjust(1)}
    >
      +1
    </button>
  </div>
);

const Field: React.FC<{
  id: string;
  label: string;
  children: React.ReactNode;
}> = ({id, label, children}) => (
  <div className="form-group">
    <label htmlFor={id}>{label}</label>
    {children}
  </div>
);

const Tabs: React.FC<{
  tabs: {id: string; label: string}[];
  active: string;
  onChange: (id: string) => void;
}> = ({tabs, active, onChange}) => (
  <div className="tabs">
    <div className="tabs-header-list" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={tab.id === active ? 'tab tab-active' : 'tab'}
          aria-selected={tab.id === active}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-text">{tab.label}</span>
        </button>
      ))}
    </div>
  </div>
);

const PanelShell: React.FC<{
  title: string;
  description?: React.ReactNode;
  tabs?: {id: string; label: string}[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({title, description, tabs, activeTab, onTabChange, footer, children}) => (
  <div className="app-shell">
    <div className="app-header">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {tabs && activeTab && onTabChange ? (
        <Tabs tabs={tabs} active={activeTab} onChange={onTabChange} />
      ) : null}
    </div>
    <div className="app-scroll">{children}</div>
    {footer ? <div className="app-footer">{footer}</div> : null}
  </div>
);

const TickEveryField: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
}> = ({id, value, onChange}) => (
  <>
    <Field id={id} label="Vertical lines every N steps (0 = none)">
      <input
        id={id}
        className="input"
        type="number"
        min={0}
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
    <div className="preset-row">
      {BAR_TICK_PRESETS.map((preset) => (
        <button
          key={preset}
          className="button button-secondary"
          type="button"
          onClick={() => onChange(String(preset))}
        >
          {preset === 0 ? 'None' : preset}
        </button>
      ))}
    </div>
  </>
);

const CreateView: React.FC = () => {
  const [tab, setTab] = React.useState<
    'counter' | 'clock' | 'bar' | 'templates'
  >('counter');
  const [isCreatingCounter, setIsCreatingCounter] = React.useState(false);
  const [isCreatingClock, setIsCreatingClock] = React.useState(false);
  const [isCreatingBar, setIsCreatingBar] = React.useState(false);
  const [templates, setTemplates] = React.useState<ClockTemplate[]>(
    listBuiltinTemplates(),
  );
  const [templateId, setTemplateId] = React.useState(PIE_TEMPLATE_ID);
  const [segments, setSegments] = React.useState('4');
  const [filled, setFilled] = React.useState('0');
  const [barSteps, setBarSteps] = React.useState('10');
  const [barFilled, setBarFilled] = React.useState('0');
  const [barTickEvery, setBarTickEvery] = React.useState('0');
  const [fillColor, setFillColor] = React.useState(DEFAULT_FILL_COLOR);
  const [emptyColor, setEmptyColor] = React.useState(DEFAULT_EMPTY_COLOR);
  const [strokeColor, setStrokeColor] = React.useState(DEFAULT_STROKE_COLOR);
  const [tickColor, setTickColor] = React.useState(DEFAULT_STROKE_COLOR);
  const [error, setError] = React.useState<string | null>(null);

  const selectedTemplate =
    templates.find((template) => template.id === templateId) ?? templates[0];
  const isPie = selectedTemplate?.id === PIE_TEMPLATE_ID;

  const reloadTemplates = React.useCallback(async () => {
    try {
      setTemplates(await listAllTemplates());
    } catch (err) {
      console.error(err);
    }
  }, []);

  React.useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  const handleCreateCounter = async () => {
    setIsCreatingCounter(true);
    try {
      const counter = await createCounter(0);
      await miro.board.viewport.zoomTo(counter);
    } finally {
      setIsCreatingCounter(false);
    }
  };

  const handleCreateClock = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextSegments = Number.parseInt(segments, 10);
    const nextFilled = Number.parseInt(filled, 10);
    const templateSegments = selectedTemplate?.segments ?? nextSegments;

    if (isPie) {
      if (
        Number.isNaN(nextSegments) ||
        nextSegments < MIN_CLOCK_SEGMENTS ||
        nextSegments > MAX_CLOCK_SEGMENTS
      ) {
        setError(`Segments must be ${MIN_CLOCK_SEGMENTS}–${MAX_CLOCK_SEGMENTS}.`);
        return;
      }
    }
    if (Number.isNaN(nextFilled) || nextFilled < 0) {
      setError('Filled must be 0 or greater.');
      return;
    }

    setError(null);
    setIsCreatingClock(true);
    try {
      const clock = await createProgressClock({
        templateId: selectedTemplate?.id ?? PIE_TEMPLATE_ID,
        segments: isPie ? nextSegments : templateSegments,
        filled: nextFilled,
        fillColor,
        emptyColor,
        strokeColor,
      });
      await miro.board.viewport.zoomTo(clock);
    } finally {
      setIsCreatingClock(false);
    }
  };

  const handleCreateBar = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextSteps = Number.parseInt(barSteps, 10);
    const nextFilled = Number.parseInt(barFilled, 10);
    const nextTickEvery = Number.parseInt(barTickEvery, 10);

    if (Number.isNaN(nextSteps) || nextSteps < MIN_BAR_STEPS) {
      setError(`Steps must be ${MIN_BAR_STEPS} or more.`);
      return;
    }
    if (nextSteps > MAX_BAR_STEPS) {
      setError(`Steps must be at most ${MAX_BAR_STEPS}.`);
      return;
    }
    if (Number.isNaN(nextFilled) || nextFilled < 0) {
      setError('Filled must be 0 or greater.');
      return;
    }
    if (Number.isNaN(nextTickEvery) || nextTickEvery < 0) {
      setError('Line interval must be 0 or greater.');
      return;
    }

    setError(null);
    setIsCreatingBar(true);
    try {
      const bar = await createProgressBar({
        steps: nextSteps,
        filled: nextFilled,
        tickEvery: nextTickEvery,
        fillColor,
        emptyColor,
        strokeColor,
        tickColor,
      });
      await miro.board.viewport.zoomTo(bar);
    } finally {
      setIsCreatingBar(false);
    }
  };

  const parsedBarSteps = Number.parseInt(barSteps, 10);
  const barPreview = buildProgressBarDataUrl({
    steps: Number.isNaN(parsedBarSteps) ? 10 : parsedBarSteps,
    filled: Number.parseInt(barFilled, 10) || 0,
    tickEvery: Number.parseInt(barTickEvery, 10) || 0,
    fillColor,
    emptyColor,
    strokeColor,
    tickColor,
  });

  const clockPreview = selectedTemplate
    ? previewDataUrl(
        {
          ...selectedTemplate,
          segments: isPie
            ? Number.parseInt(segments, 10) || selectedTemplate.segments
            : selectedTemplate.segments,
        },
        Number.parseInt(filled, 10) || 0,
        {fillColor, emptyColor, strokeColor},
      )
    : null;

  return (
    <PanelShell
      title="BitD pieces"
      description={
        <>
          Add a piece, then select it for <strong>-1</strong> /{' '}
          <strong>+1</strong> and settings in this sidebar.
        </>
      }
      tabs={[
        {id: 'counter', label: 'Counter'},
        {id: 'clock', label: 'Clock'},
        {id: 'bar', label: 'Bar'},
        {id: 'templates', label: 'Templates'},
      ]}
      activeTab={tab}
      onTabChange={(id) => {
        setError(null);
        setTab(id as 'counter' | 'clock' | 'bar' | 'templates');
      }}
      footer={
        tab === 'counter' ? (
          <button
            className="button button-primary button-block"
            type="button"
            onClick={handleCreateCounter}
            disabled={isCreatingCounter || isCreatingClock || isCreatingBar}
          >
            {isCreatingCounter ? 'Creating…' : 'Add counter'}
          </button>
        ) : tab === 'clock' ? (
          <button
            className="button button-primary button-block"
            type="submit"
            form="create-clock-form"
            disabled={isCreatingCounter || isCreatingClock || isCreatingBar}
          >
            {isCreatingClock ? 'Creating…' : 'Add to board'}
          </button>
        ) : tab === 'bar' ? (
          <button
            className="button button-primary button-block"
            type="submit"
            form="create-bar-form"
            disabled={isCreatingCounter || isCreatingClock || isCreatingBar}
          >
            {isCreatingBar ? 'Creating…' : 'Add to board'}
          </button>
        ) : (
          <button
            className="button button-primary button-block"
            type="submit"
            form="save-template-form"
          >
            Save template
          </button>
        )
      }
    >
      {tab === 'counter' ? (
        <p>
          Places a stacked shape and number you can increment from the toolbar
          or this sidebar.
        </p>
      ) : tab === 'templates' ? (
        <TemplateLibrary
          onSaved={(template) => {
            void reloadTemplates();
            setTemplateId(template.id);
          }}
        />
      ) : tab === 'bar' ? (
        <form id="create-bar-form" onSubmit={handleCreateBar}>
          <p className="p-small">
            Horizontal track with any number of steps. Optional vertical
            dividers every N steps.
          </p>
          <img className="template-preview" src={barPreview} alt="" />
          <Field id="bar-steps" label="Steps">
            <input
              id="bar-steps"
              className="input"
              type="number"
              min={MIN_BAR_STEPS}
              max={MAX_BAR_STEPS}
              step="1"
              value={barSteps}
              onChange={(e) => setBarSteps(e.target.value)}
            />
          </Field>
          <Field id="bar-filled" label="Filled">
            <input
              id="bar-filled"
              className="input"
              type="number"
              min={0}
              step="1"
              value={barFilled}
              onChange={(e) => setBarFilled(e.target.value)}
            />
          </Field>
          <TickEveryField
            id="bar-tick-every"
            value={barTickEvery}
            onChange={setBarTickEvery}
          />
          <Field id="bar-fill-color" label="Fill color">
            <input
              id="bar-fill-color"
              className="color-swatch"
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </Field>
          <Field id="bar-empty-color" label="Empty color">
            <input
              id="bar-empty-color"
              className="color-swatch"
              type="color"
              value={emptyColor}
              onChange={(e) => setEmptyColor(e.target.value)}
            />
          </Field>
          <Field id="bar-stroke-color" label="Outline">
            <input
              id="bar-stroke-color"
              className="color-swatch"
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </Field>
          <Field id="bar-tick-color" label="Line color">
            <input
              id="bar-tick-color"
              className="color-swatch"
              type="color"
              value={tickColor}
              onChange={(e) => setTickColor(e.target.value)}
            />
          </Field>
          {error ? <p className="p-small">{error}</p> : null}
        </form>
      ) : (
        <form id="create-clock-form" onSubmit={handleCreateClock}>
          <Field id="create-template" label="Template">
            <select
              id="create-template"
              className="select"
              value={selectedTemplate?.id ?? PIE_TEMPLATE_ID}
              onChange={(e) => {
                const next = templates.find(
                  (template) => template.id === e.target.value,
                );
                setTemplateId(e.target.value);
                if (next && !next.variableSegments) {
                  setSegments(String(next.segments));
                }
              }}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.variableSegments
                    ? ''
                    : ` (${template.segments})`}
                </option>
              ))}
            </select>
          </Field>
          {clockPreview ? (
            <img className="template-preview" src={clockPreview} alt="" />
          ) : null}
          {isPie ? (
            <>
              <Field
                id="create-segments"
                label={`Segments (${MIN_CLOCK_SEGMENTS}–${MAX_CLOCK_SEGMENTS})`}
              >
                <input
                  id="create-segments"
                  className="input"
                  type="number"
                  min={MIN_CLOCK_SEGMENTS}
                  max={MAX_CLOCK_SEGMENTS}
                  step="1"
                  value={segments}
                  onChange={(e) => setSegments(e.target.value)}
                />
              </Field>
              <div className="preset-row">
                {CLOCK_SEGMENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className="button button-secondary"
                    type="button"
                    onClick={() => setSegments(String(preset))}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="p-small">
              This track has {selectedTemplate?.segments ?? 0} slots.
            </p>
          )}
          <Field id="create-filled" label="Filled">
            <input
              id="create-filled"
              className="input"
              type="number"
              min={0}
              step="1"
              value={filled}
              onChange={(e) => setFilled(e.target.value)}
            />
          </Field>
          <Field id="create-fill-color" label="Fill color">
            <input
              id="create-fill-color"
              className="color-swatch"
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </Field>
          <Field id="create-empty-color" label="Empty color">
            <input
              id="create-empty-color"
              className="color-swatch"
              type="color"
              value={emptyColor}
              onChange={(e) => setEmptyColor(e.target.value)}
            />
          </Field>
          <Field id="create-stroke-color" label="Stroke">
            <input
              id="create-stroke-color"
              className="color-swatch"
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </Field>
          {error ? <p className="p-small">{error}</p> : null}
        </form>
      )}
    </PanelShell>
  );
};

const CounterControls: React.FC<{itemId: string}> = ({itemId}) => {
  const [value, setValue] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState('0');
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      const current = await getCounterValue({type: 'image', id: itemId});
      if (current === null) {
        setError('Selected item is not a counter.');
        return;
      }
      setError(null);
      setValue(current);
      setDraft(String(current));
    } catch (err) {
      console.error(err);
      setError('Failed to load counter.');
    }
  }, [itemId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const applyValue = async (next: number) => {
    setIsBusy(true);
    setError(null);
    try {
      await setCounterValue({type: 'image', id: itemId}, next);
      setValue(next);
      setDraft(String(next));
    } finally {
      setIsBusy(false);
    }
  };

  if (error && value === null) {
    return (
      <PanelShell
        title="Counter"
        footer={
          <button
            className="button button-secondary button-block"
            type="button"
            onClick={goHome}
          >
            Back
          </button>
        }
      >
        <p>{error}</p>
      </PanelShell>
    );
  }

  if (value === null) {
    return (
      <PanelShell title="Counter">
        <p>Loading…</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Counter"
      footer={
        <div className="actions-row">
          <button
            className="button button-primary"
            type="submit"
            form="counter-form"
            disabled={isBusy}
          >
            Save
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={goHome}
          >
            Back
          </button>
        </div>
      }
    >
      <p className="value">{value}</p>
      <AdjustButtons
        disabled={isBusy}
        onAdjust={(delta) => void applyValue(value + delta)}
      />
      <form
        id="counter-form"
        onSubmit={(event) => {
          event.preventDefault();
          const next = Number.parseInt(draft, 10);
          if (Number.isNaN(next)) {
            setError('Enter a valid integer.');
            return;
          }
          void applyValue(next);
        }}
      >
        <Field id="counter-value" label="Set value">
          <input
            id="counter-value"
            className="input"
            type="number"
            step="1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Field>
        {error ? <p className="p-small">{error}</p> : null}
      </form>
    </PanelShell>
  );
};

const ClockControls: React.FC<{itemId: string}> = ({itemId}) => {
  const [tab, setTab] = React.useState<'adjust' | 'settings'>('adjust');
  const [config, setConfig] = React.useState<ProgressClockConfig | null>(null);
  const [segmentsDraft, setSegmentsDraft] = React.useState('4');
  const [filledDraft, setFilledDraft] = React.useState('0');
  const [fillColor, setFillColor] = React.useState(DEFAULT_FILL_COLOR);
  const [emptyColor, setEmptyColor] = React.useState(DEFAULT_EMPTY_COLOR);
  const [strokeColor, setStrokeColor] = React.useState(DEFAULT_STROKE_COLOR);
  const [templateName, setTemplateName] = React.useState('Progress clock');
  const [isPie, setIsPie] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const configRef = React.useRef<ProgressClockConfig | null>(null);

  const applyLocalConfig = (next: ProgressClockConfig) => {
    configRef.current = next;
    setConfig(next);
    setSegmentsDraft(String(next.segments));
    setFilledDraft(String(next.filled));
    setFillColor(next.fillColor);
    setEmptyColor(next.emptyColor);
    setStrokeColor(next.strokeColor);
    setIsPie(!next.templateId || next.templateId === PIE_TEMPLATE_ID);
    void getTemplate(next.templateId || PIE_TEMPLATE_ID).then((template) => {
      setTemplateName(template?.name ?? 'Progress clock');
    });
  };

  const reload = React.useCallback(async () => {
    try {
      const state = await getClockState({type: 'image', id: itemId});
      if (!state) {
        setError('Selected item is not a progress clock.');
        return;
      }
      setError(null);
      applyLocalConfig(state);
    } catch (err) {
      console.error(err);
      setError('Failed to load progress clock.');
    }
  }, [itemId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const applyFilled = (next: number) => {
    const current = configRef.current;
    if (!current) {
      return;
    }

    const optimistic = {
      ...current,
      filled: clampFilled(next, current.segments),
    };
    applyLocalConfig(optimistic);
    setError(null);

    void setClockFilled({type: 'image', id: itemId}, optimistic.filled).then(
      (state) => {
        if (state) {
          applyLocalConfig(state);
        }
      },
      (err) => {
        console.error(err);
        setError('Failed to update clock.');
        void reload();
      },
    );
  };

  const saveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextSegments = Number.parseInt(segmentsDraft, 10);
    const nextFilled = Number.parseInt(filledDraft, 10);

    if (
      Number.isNaN(nextSegments) ||
      nextSegments < MIN_CLOCK_SEGMENTS ||
      nextSegments > MAX_CLOCK_SEGMENTS
    ) {
      setError(`Segments must be ${MIN_CLOCK_SEGMENTS}–${MAX_CLOCK_SEGMENTS}.`);
      return;
    }
    if (Number.isNaN(nextFilled) || nextFilled < 0) {
      setError('Filled must be 0 or greater.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const state = await updateClockConfig(
        {type: 'image', id: itemId},
        {
          segments: nextSegments,
          filled: nextFilled,
          fillColor,
          emptyColor,
          strokeColor,
        },
      );
      if (state) {
        applyLocalConfig(state);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (error && !config) {
    return (
      <PanelShell
        title="Progress clock"
        footer={
          <button
            className="button button-secondary button-block"
            type="button"
            onClick={goHome}
          >
            Back
          </button>
        }
      >
        <p>{error}</p>
      </PanelShell>
    );
  }

  if (!config) {
    return (
      <PanelShell title="Progress clock">
        <p>Loading…</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Progress clock"
      tabs={[
        {id: 'adjust', label: 'Adjust'},
        {id: 'settings', label: 'Settings'},
      ]}
      activeTab={tab}
      onTabChange={(id) => {
        setError(null);
        setTab(id as 'adjust' | 'settings');
      }}
      footer={
        <div className="actions-row">
          {tab === 'settings' ? (
            <button
              className="button button-primary"
              type="submit"
              form="clock-settings-form"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <button
              className="button button-primary"
              type="submit"
              form="clock-adjust-form"
            >
              Set
            </button>
          )}
          <button
            className="button button-secondary"
            type="button"
            onClick={goHome}
          >
            Back
          </button>
        </div>
      }
    >
      {tab === 'adjust' ? (
        <form
          id="clock-adjust-form"
          onSubmit={(event) => {
            event.preventDefault();
            const next = Number.parseInt(filledDraft, 10);
            if (Number.isNaN(next) || next < 0) {
              setError('Filled must be 0 or greater.');
              return;
            }
            void applyFilled(next);
          }}
        >
          <p className="value">
            {config.filled} / {config.segments}
          </p>
          <AdjustButtons
            onAdjust={(delta) => {
              const current = configRef.current;
              if (!current) {
                return;
              }
              applyFilled(current.filled + delta);
            }}
          />
          <Field id="clock-filled" label="Set filled">
            <input
              id="clock-filled"
              className="input"
              type="number"
              min={0}
              step="1"
              value={filledDraft}
              onChange={(e) => setFilledDraft(e.target.value)}
            />
          </Field>
          {error ? <p className="p-small">{error}</p> : null}
        </form>
      ) : (
        <form id="clock-settings-form" onSubmit={saveConfig}>
          <p className="p-small">{templateName}</p>
          {isPie ? (
            <>
              <Field
                id="clock-segments"
                label={`Segments (${MIN_CLOCK_SEGMENTS}–${MAX_CLOCK_SEGMENTS})`}
              >
                <input
                  id="clock-segments"
                  className="input"
                  type="number"
                  min={MIN_CLOCK_SEGMENTS}
                  max={MAX_CLOCK_SEGMENTS}
                  step="1"
                  value={segmentsDraft}
                  onChange={(e) => setSegmentsDraft(e.target.value)}
                />
              </Field>
              <div className="preset-row">
                {CLOCK_SEGMENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className="button button-secondary"
                    type="button"
                    onClick={() => setSegmentsDraft(String(preset))}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="p-small">{config.segments} slots (from template)</p>
          )}
          <Field id="clock-fill-color" label="Fill color">
            <input
              id="clock-fill-color"
              className="color-swatch"
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </Field>
          <Field id="clock-empty-color" label="Empty color">
            <input
              id="clock-empty-color"
              className="color-swatch"
              type="color"
              value={emptyColor}
              onChange={(e) => setEmptyColor(e.target.value)}
            />
          </Field>
          <Field id="clock-stroke-color" label="Stroke">
            <input
              id="clock-stroke-color"
              className="color-swatch"
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </Field>
          {error ? <p className="p-small">{error}</p> : null}
        </form>
      )}
    </PanelShell>
  );
};

const BarControls: React.FC<{itemId: string}> = ({itemId}) => {
  const [tab, setTab] = React.useState<'adjust' | 'settings'>('adjust');
  const [config, setConfig] = React.useState<ProgressBarConfig | null>(null);
  const [stepsDraft, setStepsDraft] = React.useState('10');
  const [filledDraft, setFilledDraft] = React.useState('0');
  const [tickDraft, setTickDraft] = React.useState('0');
  const [fillColor, setFillColor] = React.useState(DEFAULT_FILL_COLOR);
  const [emptyColor, setEmptyColor] = React.useState(DEFAULT_EMPTY_COLOR);
  const [strokeColor, setStrokeColor] = React.useState(DEFAULT_STROKE_COLOR);
  const [tickColor, setTickColor] = React.useState(DEFAULT_STROKE_COLOR);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const configRef = React.useRef<ProgressBarConfig | null>(null);

  const applyLocalConfig = (next: ProgressBarConfig) => {
    configRef.current = next;
    setConfig(next);
    setStepsDraft(String(next.steps));
    setFilledDraft(String(next.filled));
    setTickDraft(String(next.tickEvery));
    setFillColor(next.fillColor);
    setEmptyColor(next.emptyColor);
    setStrokeColor(next.strokeColor);
    setTickColor(next.tickColor);
  };

  const reload = React.useCallback(async () => {
    try {
      const state = await getBarState({type: 'image', id: itemId});
      if (!state) {
        setError('Selected item is not a progress bar.');
        return;
      }
      setError(null);
      applyLocalConfig(state);
    } catch (err) {
      console.error(err);
      setError('Failed to load progress bar.');
    }
  }, [itemId]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const applyFilled = (next: number) => {
    const current = configRef.current;
    if (!current) {
      return;
    }

    const optimistic = {
      ...current,
      filled: clampBarFilled(next, current.steps),
    };
    applyLocalConfig(optimistic);
    setError(null);

    void setBarFilled({type: 'image', id: itemId}, optimistic.filled).then(
      (state) => {
        if (state) {
          applyLocalConfig(state);
        }
      },
      (err) => {
        console.error(err);
        setError('Failed to update bar.');
        void reload();
      },
    );
  };

  const saveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextSteps = Number.parseInt(stepsDraft, 10);
    const nextFilled = Number.parseInt(filledDraft, 10);
    const nextTickEvery = Number.parseInt(tickDraft, 10);

    if (Number.isNaN(nextSteps) || nextSteps < MIN_BAR_STEPS) {
      setError(`Steps must be ${MIN_BAR_STEPS} or more.`);
      return;
    }
    if (nextSteps > MAX_BAR_STEPS) {
      setError(`Steps must be at most ${MAX_BAR_STEPS}.`);
      return;
    }
    if (Number.isNaN(nextFilled) || nextFilled < 0) {
      setError('Filled must be 0 or greater.');
      return;
    }
    if (Number.isNaN(nextTickEvery) || nextTickEvery < 0) {
      setError('Line interval must be 0 or greater.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const state = await updateBarConfig(
        {type: 'image', id: itemId},
        {
          steps: nextSteps,
          filled: nextFilled,
          tickEvery: nextTickEvery,
          fillColor,
          emptyColor,
          strokeColor,
          tickColor,
        },
      );
      if (state) {
        applyLocalConfig(state);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (error && !config) {
    return (
      <PanelShell
        title="Progress bar"
        footer={
          <button
            className="button button-secondary button-block"
            type="button"
            onClick={goHome}
          >
            Back
          </button>
        }
      >
        <p>{error}</p>
      </PanelShell>
    );
  }

  if (!config) {
    return (
      <PanelShell title="Progress bar">
        <p>Loading…</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Progress bar"
      tabs={[
        {id: 'adjust', label: 'Adjust'},
        {id: 'settings', label: 'Settings'},
      ]}
      activeTab={tab}
      onTabChange={(id) => {
        setError(null);
        setTab(id as 'adjust' | 'settings');
      }}
      footer={
        <div className="actions-row">
          {tab === 'settings' ? (
            <button
              className="button button-primary"
              type="submit"
              form="bar-settings-form"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <button
              className="button button-primary"
              type="submit"
              form="bar-adjust-form"
            >
              Set
            </button>
          )}
          <button
            className="button button-secondary"
            type="button"
            onClick={goHome}
          >
            Back
          </button>
        </div>
      }
    >
      {tab === 'adjust' ? (
        <form
          id="bar-adjust-form"
          onSubmit={(event) => {
            event.preventDefault();
            const next = Number.parseInt(filledDraft, 10);
            if (Number.isNaN(next) || next < 0) {
              setError('Filled must be 0 or greater.');
              return;
            }
            void applyFilled(next);
          }}
        >
          <img
            className="template-preview"
            src={buildProgressBarDataUrl(config)}
            alt=""
          />
          <p className="value">
            {config.filled} / {config.steps}
          </p>
          <AdjustButtons
            onAdjust={(delta) => {
              const current = configRef.current;
              if (!current) {
                return;
              }
              applyFilled(current.filled + delta);
            }}
          />
          <Field id="bar-set-filled" label="Set filled">
            <input
              id="bar-set-filled"
              className="input"
              type="number"
              min={0}
              step="1"
              value={filledDraft}
              onChange={(e) => setFilledDraft(e.target.value)}
            />
          </Field>
          {error ? <p className="p-small">{error}</p> : null}
        </form>
      ) : (
        <form id="bar-settings-form" onSubmit={saveConfig}>
          <img
            className="template-preview"
            src={buildProgressBarDataUrl({
              steps: Number.parseInt(stepsDraft, 10) || config.steps,
              filled: Number.parseInt(filledDraft, 10) || 0,
              tickEvery: Number.parseInt(tickDraft, 10) || 0,
              fillColor,
              emptyColor,
              strokeColor,
              tickColor,
            })}
            alt=""
          />
          <Field id="bar-edit-steps" label="Steps">
            <input
              id="bar-edit-steps"
              className="input"
              type="number"
              min={MIN_BAR_STEPS}
              max={MAX_BAR_STEPS}
              step="1"
              value={stepsDraft}
              onChange={(e) => setStepsDraft(e.target.value)}
            />
          </Field>
          <Field id="bar-edit-filled" label="Filled">
            <input
              id="bar-edit-filled"
              className="input"
              type="number"
              min={0}
              step="1"
              value={filledDraft}
              onChange={(e) => setFilledDraft(e.target.value)}
            />
          </Field>
          <TickEveryField
            id="bar-edit-ticks"
            value={tickDraft}
            onChange={setTickDraft}
          />
          <Field id="bar-edit-fill" label="Fill color">
            <input
              id="bar-edit-fill"
              className="color-swatch"
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </Field>
          <Field id="bar-edit-empty" label="Empty color">
            <input
              id="bar-edit-empty"
              className="color-swatch"
              type="color"
              value={emptyColor}
              onChange={(e) => setEmptyColor(e.target.value)}
            />
          </Field>
          <Field id="bar-edit-stroke" label="Outline">
            <input
              id="bar-edit-stroke"
              className="color-swatch"
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </Field>
          <Field id="bar-edit-tick-color" label="Line color">
            <input
              id="bar-edit-tick-color"
              className="color-swatch"
              type="color"
              value={tickColor}
              onChange={(e) => setTickColor(e.target.value)}
            />
          </Field>
          {error ? <p className="p-small">{error}</p> : null}
        </form>
      )}
    </PanelShell>
  );
};

const App: React.FC = () => {
  const {itemId, kind} = getPanelParams();

  if (!itemId) {
    return <CreateView />;
  }

  if (kind === 'clock') {
    return <ClockControls itemId={itemId} />;
  }

  if (kind === 'bar') {
    return <BarControls itemId={itemId} />;
  }

  return <CounterControls itemId={itemId} />;
};

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

const root = createRoot(container);
root.render(<App />);
