import { useState, useEffect, useRef } from 'react';
import { applicationAPI } from '../../services/ipc.js';
import { useToast } from '../../contexts/ToastContext.jsx';

// Modal for linking the current cv_document to an application.
//
// Two modes:
//   existing — search the application list and link to one
//   new       — quick-create a new application (employer + job title) and link it
//
// Props:
//   documentId    — current cv_document id
//   documentTitle — current cv_document title (shown in confirmation copy)
//   onClose()     — called when the user dismisses the modal

export default function SaveToApplicationModal({ documentId, documentTitle, onClose }) {
  const { showToast } = useToast();

  const [mode, setMode]             = useState('existing');
  const [applications, setApps]     = useState([]);
  const [searchQuery, setSearch]    = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [newEmployer, setEmployer]  = useState('');
  const [newJobTitle, setJobTitle]  = useState('');
  const [saving, setSaving]         = useState(false);
  const [linked, setLinked]         = useState(null); // { employer, job_title } after success

  const searchRef = useRef(null);

  useEffect(() => {
    applicationAPI.list()
      .then(setApps)
      .catch(() => {});
  }, []);

  // Auto-focus search when switching to 'existing' mode.
  useEffect(() => {
    if (mode === 'existing') searchRef.current?.focus();
  }, [mode]);

  const filteredApps = applications.filter(app => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (app.job_title || '').toLowerCase().includes(q) ||
      (app.employer  || '').toLowerCase().includes(q)
    );
  });

  const canSave = saving
    ? false
    : mode === 'existing'
      ? !!selectedId
      : !!(newEmployer.trim() || newJobTitle.trim());

  async function handleLink() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (mode === 'existing') {
        const app = applications.find(a => a.id === selectedId);
        await applicationAPI.update(selectedId, { cv_document_id: documentId });
        setLinked(app);
        showToast(`Linked to ${app.job_title || 'application'}${app.employer ? ' at ' + app.employer : ''}`);
      } else {
        const id = await applicationAPI.create({
          employer:      newEmployer.trim(),
          jobTitle:      newJobTitle.trim(),
          cvDocumentId:  documentId,
        });
        setLinked({ id, employer: newEmployer.trim(), job_title: newJobTitle.trim() });
        showToast('Application created and linked');
      }
    } catch (err) {
      showToast('Failed to link: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (linked) {
    return (
      <div className="asm-dialog-overlay" onKeyDown={handleKeyDown}>
        <div className="asm-dialog" role="dialog" aria-modal="true">
          <h2 className="asm-dialog-title">Linked</h2>
          <p className="asm-dialog-body">
            <strong>{documentTitle || 'This CV'}</strong> is now linked to{' '}
            <strong>{linked.job_title || '(untitled)'}</strong>
            {linked.employer ? ` at ${linked.employer}` : ''}.
            You can view and manage it from the Application Tracker.
          </p>
          <div className="asm-dialog-actions">
            <button className="btn btn-primary btn-sm" onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main state ────────────────────────────────────────────────────────────────

  return (
    <div className="asm-dialog-overlay" onKeyDown={handleKeyDown}>
      <div className="asm-dialog asm-dialog-wide" role="dialog" aria-modal="true"
           aria-label="Link to application">

        <h2 className="asm-dialog-title">Link to Application</h2>
        <p className="asm-dialog-body">
          Associate <strong>{documentTitle || 'this CV'}</strong> with a job application.
        </p>

        {/* Mode tabs */}
        <div className="asm-link-tabs">
          <button
            className={`asm-link-tab${mode === 'existing' ? ' active' : ''}`}
            onClick={() => setMode('existing')}
            type="button"
          >
            Link to existing
          </button>
          <button
            className={`asm-link-tab${mode === 'new' ? ' active' : ''}`}
            onClick={() => setMode('new')}
            type="button"
          >
            Create new application
          </button>
        </div>

        {/* ── Existing application ── */}
        {mode === 'existing' && (
          <>
            <input
              ref={searchRef}
              className="asm-dialog-input"
              type="text"
              placeholder="Search by job title or employer…"
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="asm-app-list">
              {filteredApps.length === 0 && (
                <p className="asm-app-list-empty">
                  {searchQuery ? 'No applications match.' : 'No applications yet.'}
                </p>
              )}
              {filteredApps.map(app => {
                const alreadyLinked = app.cv_document_id === documentId;
                return (
                  <button
                    key={app.id}
                    className={`asm-app-item${selectedId === app.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(app.id)}
                    type="button"
                  >
                    <span className="asm-app-item-title">{app.job_title || '(No title)'}</span>
                    <span className="asm-app-item-employer">{app.employer || '(No employer)'}</span>
                    {alreadyLinked && (
                      <span className="asm-app-item-tag asm-app-item-linked">Already linked</span>
                    )}
                    {!alreadyLinked && app.cv_document_id && (
                      <span className="asm-app-item-tag asm-app-item-warning">Has another CV</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── New application ── */}
        {mode === 'new' && (
          <>
            <label className="asm-dialog-label">
              Employer
              <input
                className="asm-dialog-input"
                value={newEmployer}
                onChange={e => setEmployer(e.target.value)}
                placeholder="e.g. Acme Corp"
                autoFocus
              />
            </label>
            <label className="asm-dialog-label">
              Job title
              <input
                className="asm-dialog-input"
                value={newJobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Product Manager"
                onKeyDown={e => e.key === 'Enter' && handleLink()}
              />
            </label>
            <p className="asm-dialog-hint">
              Fill in the rest of the details (URL, job ad, status…) in the Tracker later.
            </p>
          </>
        )}

        <div className="asm-dialog-actions">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleLink}
            disabled={!canSave}
          >
            {saving
              ? 'Linking…'
              : mode === 'existing' ? 'Link' : 'Create and link'}
          </button>
        </div>

      </div>
    </div>
  );
}
