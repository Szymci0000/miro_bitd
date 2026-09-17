import * as React from 'react';

import {
  DEFAULT_EMPTY_COLOR,
  DEFAULT_FILL_COLOR,
  DEFAULT_STROKE_COLOR,
} from './progressClockSvg';
import {
  deleteTemplate,
  EXAMPLE_TRACK_SVG,
  inspectSvg,
  listSavedTemplates,
  previewDataUrl,
  saveTemplate,
  type ClockTemplate,
} from './clockTemplates';

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

function downloadExample(): void {
  const blob = new Blob([EXAMPLE_TRACK_SVG], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'example-track.svg';
  link.click();
  URL.revokeObjectURL(url);
}

export const TemplateLibrary: React.FC<{
  onSaved?: (template: ClockTemplate) => void;
  onAddToBoard?: (template: ClockTemplate) => void;
  addingDisabled?: boolean;
}> = ({onSaved, onAddToBoard, addingDisabled}) => {
  const [name, setName] = React.useState('');
  const [svg, setSvg] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [slotCount, setSlotCount] = React.useState<number | null>(null);
  const [saved, setSaved] = React.useState<ClockTemplate[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const reloadSaved = React.useCallback(async () => {
    try {
      setSaved(await listSavedTemplates());
    } catch (err) {
      console.error(err);
      setError('Could not load saved templates from this board.');
    }
  }, []);

  React.useEffect(() => {
    void reloadSaved();
  }, [reloadSaved]);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    const text = await file.text();
    const inspected = inspectSvg(text);
    if (!inspected.ok) {
      setSvg(null);
      setPreview(null);
      setSlotCount(null);
      setError(inspected.error);
      setStatus(null);
      return;
    }

    const draft: ClockTemplate = {
      id: 'preview',
      name: file.name,
      segments: inspected.segments,
      svg: inspected.svg,
      builtin: false,
    };
    setError(null);
    setStatus(`Found ${inspected.segments} slots.`);
    setSvg(inspected.svg);
    setSlotCount(inspected.segments);
    setPreview(
      previewDataUrl(draft, Math.ceil(inspected.segments / 2), {
        fillColor: DEFAULT_FILL_COLOR,
        emptyColor: DEFAULT_EMPTY_COLOR,
        strokeColor: DEFAULT_STROKE_COLOR,
      }),
    );
    if (!name.trim()) {
      setName(file.name.replace(/\.svg$/i, ''));
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!svg) {
      setError('Choose an SVG file first.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const template = await saveTemplate({name, svg});
      setStatus(`Saved “${template.name}” on this board.`);
      setName('');
      setSvg(null);
      setPreview(null);
      setSlotCount(null);
      await reloadSaved();
      onSaved?.(template);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <p>
        Import one SVG with slots. Templates are stored on this Miro board, so
        they survive reload and clearing the browser.
      </p>
      <p className="p-small">
        Mark steps with <code>data-slot="1"</code> … or <code>id="slot-1"</code>.
        Optional: <code>id="base"</code>, <code>id="overlay"</code>,{' '}
        <code>data-role="empty"</code> / <code>data-role="filled"</code>.
      </p>
      <button
        className="button button-secondary button-block"
        type="button"
        onClick={downloadExample}
      >
        Download example SVG
      </button>

      <form id="save-template-form" onSubmit={handleSave}>
        <Field id="template-name" label="Name">
          <input
            id="template-name"
            className="input"
            type="text"
            value={name}
            disabled={isSaving}
            onChange={(e) => setName(e.target.value)}
            placeholder="Long-term project track"
          />
        </Field>
        <Field id="template-file" label="SVG file">
          <input
            id="template-file"
            className="input"
            type="file"
            accept=".svg,image/svg+xml"
            disabled={isSaving}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </Field>
        {slotCount !== null ? (
          <p className="p-small">{slotCount} slots</p>
        ) : null}
        {preview ? (
          <img className="template-preview" src={preview} alt="Template preview" />
        ) : null}
        {error ? <p className="p-small">{error}</p> : null}
        {status ? <p className="p-small">{status}</p> : null}
      </form>

      <h2 className="h3">Saved on this board</h2>
      {saved.length === 0 ? (
        <p className="p-small">No custom templates yet.</p>
      ) : (
        <div className="template-list">
          {saved.map((template) => (
            <div className="template-item" key={template.id}>
              <img
                src={previewDataUrl(template, Math.ceil(template.segments / 2))}
                alt=""
              />
              <div>
                <strong>{template.name}</strong>
                <p className="p-small">{template.segments} slots</p>
              </div>
              <div className="template-item-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={addingDisabled}
                  onClick={() => onAddToBoard?.(template)}
                >
                  Add
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={addingDisabled}
                  onClick={() => {
                    void deleteTemplate(template.id).then(
                      () => reloadSaved(),
                      (err) => {
                        console.error(err);
                        setError('Failed to delete template.');
                      },
                    );
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
