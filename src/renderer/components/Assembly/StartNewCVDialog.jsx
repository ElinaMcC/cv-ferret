import { useState, useEffect, useRef } from 'react';
import { profileAPI, cvDocumentAPI, documentAPI } from '../../services/ipc.js';
import { usePoolStore } from '../../stores/poolStore.js';

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
// To import an existing CV file (DOCX/PDF/Markdown) and extract it into the
// Experience Pool, point users at the Import page instead — see the hint below.
//
// Props:
//   preselectedProfileId         — profile to associate the new CV with (from CV Library)
//   onCreated(id, title, profileId) — called with the new cv_document id
//   onCancel()                   — called if user dismisses without creating
//   onNavigate(view)              — used to link to the Import page

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

export default function StartNewCVDialog({ preselectedProfileId, onCreated, onCancel, onNavigate, inline = false }) {
  const poolJobs = usePoolStore(s => s.jobs);
  const poolEmpty = poolJobs.length === 0;

  const [mode, setMode]               = useState('scratch');
  const [title, setTitle]             = useState(defaultTitle);
  const [profiles, setProfiles]       = useState([]);
  const [cvDocuments, setCvDocuments] = useState([]);
  const [selectedCvId, setSelectedCvId] = useState('');
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
    (mode !== 'existing' || selectedCvId);

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
            title="Start from skeleton"
            description={poolEmpty
              ? 'Your Experience Pool is empty, so the skeleton will have minimal structure. Add jobs and tasks to your pool first for the best result.'
              : 'Creates a document from your pool — job headings with empty task areas. Use the pool drawer to insert the tasks you need.'}
          />
          <ModeCard
            id="defaults"
            selected={mode === 'defaults'}
            onSelect={() => setMode('defaults')}
            title="Pre-fill from pool"
            description={poolEmpty
              ? 'Your Experience Pool is empty — there are no tasks to pre-fill yet.'
              : 'Opens a document with all your default task versions already inserted. Trim it down to what this application needs.'}
            disabled={poolEmpty}
            disabledHint="Add jobs and tasks to your Experience Pool first."
          />
          <ModeCard
            id="existing"
            selected={mode === 'existing'}
            onSelect={() => setMode('existing')}
            title="Copy a saved draft"
            description="Clones a CV you've previously built in this app as a starting point for a new variant. Only CVs created in CV Ferret appear here — not external files."
            disabled={cvDocuments.length === 0}
            disabledHint="No saved drafts yet — create one using another option first, then come back here."
          />
        </div>

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

        {onNavigate && (
          <p className="asm-dialog-hint">
            Importing an existing CV file? Use the{' '}
            <button
              type="button"
              className="asm-dialog-link"
              onClick={() => onNavigate('import')}
            >
              Import page
            </button>{' '}
            to extract your jobs, education, and skills into the Experience Pool.
          </p>
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
