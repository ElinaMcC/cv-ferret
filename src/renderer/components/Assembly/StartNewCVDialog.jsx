import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { profileAPI, cvDocumentAPI, documentAPI } from '../../services/ipc.js';

// Three ways to start a new CV:
//
//   scratch   — job structure (headings, dates) prefilled from the pool, task
//               areas empty. User adds tasks manually or via the pool drawer.
//
//   defaults  — same structure, all default task versions pre-inserted as
//               a starting point to edit down from.
//
//   existing  — clone any existing CV (grouped by profile in the picker).
//               The new document's profile association still comes from the
//               context in which the dialog was opened (preselectedProfileId).
//
// Props:
//   preselectedProfileId         — profile to associate the new CV with (from CV Library)
//   onCreated(id, title, profileId) — called with the new cv_document id
//   onCancel()                   — called if user dismisses without creating

function defaultTitle() {
  return `New CV — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

// Returns a default title that doesn't clash with any existing cv_document title.
// If "New CV — 5 June 2026" already exists, returns "New CV — 5 June 2026 (2)", etc.
function uniqueDefaultTitle(existingDocs) {
  const base   = defaultTitle();
  const titles = new Set((existingDocs || []).map(d => d.title));
  if (!titles.has(base)) return base;
  let n = 2;
  while (titles.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

export default function StartNewCVDialog({ preselectedProfileId, onCreated, onCancel, inline = false }) {
  const [mode, setMode]               = useState('scratch');
  const [title, setTitle]             = useState(defaultTitle);
  const [profiles, setProfiles]       = useState([]);
  const [cvDocuments, setCvDocuments] = useState([]);
  const [selectedCvId, setSelectedCvId] = useState('');
  const [markdownHtml, setMarkdownHtml] = useState('');
  const [markdownFileName, setMarkdownFileName] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
    Promise.all([profileAPI.list(), cvDocumentAPI.list()])
      .then(([loadedProfiles, loadedDocs]) => {
        setProfiles(loadedProfiles);
        setCvDocuments(loadedDocs);
        // Update the title to a unique value now that we know what already exists.
        // Only overwrite if the user hasn't started typing (value still matches the
        // bare default generated at component mount time).
        setTitle(prev => prev === defaultTitle() ? uniqueDefaultTitle(loadedDocs) : prev);
        // Default to 'existing' when coming from a profile context and CVs exist.
        if (preselectedProfileId && loadedDocs.length > 0) {
          setMode('existing');
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Profile to associate the new document with (from CV Library context).
  const preselectedProfile = profiles.find(p => String(p.id) === String(preselectedProfileId));

  const canCreate = title.trim() &&
    (mode !== 'existing' || selectedCvId) &&
    (mode !== 'markdown' || markdownHtml);

  // CVs grouped for the optgroup dropdown.
  const profilesWithDocs = profiles.filter(p => cvDocuments.some(d => d.profile_id === p.id));
  const unorganisedDocs  = cvDocuments.filter(d => !d.profile_id);

  async function handleCreate() {
    if (!canCreate || loading) return;
    setLoading(true);
    setError('');

    try {
      let contentHtml = '';
      // Profile association is always from the pre-selected context, not from
      // whichever CV the user chose to clone.
      const profileId = preselectedProfile?.id || null;

      if (mode === 'scratch') {
        const { html } = await documentAPI.blankTemplate(false);
        contentHtml = html;

      } else if (mode === 'defaults') {
        const { html } = await documentAPI.blankTemplate(true);
        contentHtml = html;

      } else if (mode === 'existing') {
        const sourceDoc = await cvDocumentAPI.get(parseInt(selectedCvId));
        contentHtml = sourceDoc.content_html || '';

      } else if (mode === 'markdown') {
        contentHtml = markdownHtml;
      }

      const { id } = await cvDocumentAPI.create({
        title:        title.trim(),
        content_html: contentHtml,
        profile_id:   profileId,
      });

      onCreated(id, title.trim(), profileId);
    } catch (err) {
      setError('Failed to create CV: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkdownFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMarkdownFileName(file.name);
    const text = await file.text();
    setMarkdownHtml(marked.parse(text));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && canCreate) handleCreate();
    if (e.key === 'Escape') onCancel();
  }

  const Wrapper = inline ? InlineWrapper : OverlayWrapper;

  return (
    <Wrapper onKeyDown={handleKeyDown}>
      <div className="asm-dialog" role="dialog" aria-modal="true" aria-label="New CV">

        <h2 className="asm-dialog-title">Start a new CV</h2>

        <label className="asm-dialog-label">
          Title
          <input
            ref={titleRef}
            className="asm-dialog-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Senior Product Manager — fintech"
          />
        </label>

        <div className="asm-dialog-modes">
          <ModeCard
            id="scratch"
            selected={mode === 'scratch'}
            onSelect={() => setMode('scratch')}
            title="Start from scratch"
            description="Job structure prefilled from your pool. Task areas are empty — add what you need."
          />
          <ModeCard
            id="defaults"
            selected={mode === 'defaults'}
            onSelect={() => setMode('defaults')}
            title="Load defaults"
            description="All your default task versions inserted as a starting point to edit down from."
          />
          <ModeCard
            id="existing"
            selected={mode === 'existing'}
            onSelect={() => setMode('existing')}
            title="Load from existing CV"
            description="Clone any CV you've already created as a starting point for a new variant."
            disabled={cvDocuments.length === 0}
            disabledHint="No CVs yet — create one first using scratch or defaults."
          />
          <ModeCard
            id="markdown"
            selected={mode === 'markdown'}
            onSelect={() => setMode('markdown')}
            title="Load from Markdown"
            description="Import a CV written in Markdown — useful for agent-generated drafts."
          />
        </div>

        {/* Markdown file picker */}
        {mode === 'markdown' && (
          <label className="asm-dialog-label">
            Markdown file
            <input
              type="file"
              accept=".md,.txt"
              className="asm-dialog-file-input"
              onChange={handleMarkdownFile}
            />
            {markdownFileName && (
              <span className="asm-dialog-hint">✓ {markdownFileName}</span>
            )}
          </label>
        )}

        {/* CV picker: shown in existing mode, grouped by profile */}
        {mode === 'existing' && cvDocuments.length > 0 && (
          <label className="asm-dialog-label">
            Source CV
            <select
              className="asm-dialog-select"
              value={selectedCvId}
              onChange={e => setSelectedCvId(e.target.value)}
            >
              <option value="">Select a CV to clone…</option>
              {profilesWithDocs.map(p => (
                <optgroup key={p.id} label={p.name}>
                  {cvDocuments
                    .filter(d => d.profile_id === p.id)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.title || 'Untitled CV'}</option>
                    ))
                  }
                </optgroup>
              ))}
              {unorganisedDocs.length > 0 && (
                <optgroup label="Unorganised">
                  {unorganisedDocs.map(d => (
                    <option key={d.id} value={d.id}>{d.title || 'Untitled CV'}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}

        {error && <p className="asm-dialog-error">{error}</p>}

        <div className="asm-dialog-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleCreate}
            disabled={!canCreate || loading}
          >
            {loading ? 'Creating…' : 'Create CV'}
          </button>
        </div>

      </div>
    </Wrapper>
  );
}

function OverlayWrapper({ children, onKeyDown }) {
  return <div className="asm-dialog-overlay" onKeyDown={onKeyDown}>{children}</div>;
}

function InlineWrapper({ children, onKeyDown }) {
  return <div className="asm-start-inline" onKeyDown={onKeyDown}>{children}</div>;
}

function ModeCard({ id, selected, onSelect, title, description, disabled, disabledHint }) {
  return (
    <button
      className={`asm-mode-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onSelect}
      aria-pressed={selected}
      title={disabled ? disabledHint : undefined}
      type="button"
    >
      <span className="asm-mode-radio" aria-hidden="true">{selected ? '●' : '○'}</span>
      <span className="asm-mode-body">
        <span className="asm-mode-title">{title}</span>
        <span className="asm-mode-desc">{disabled ? disabledHint : description}</span>
      </span>
    </button>
  );
}
