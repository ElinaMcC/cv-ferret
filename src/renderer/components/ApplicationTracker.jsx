import { useState, useEffect, useRef } from 'react';
import { applicationAPI, cvDocumentAPI, referenceAPI, coverLetterAPI, settingsAPI, exportAPI } from '../services/ipc';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import InfoTip from './InfoTip';
import { useToast } from '../contexts/ToastContext';
import { Icon } from '../utils/icons';
import './ApplicationTracker.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Closed'];

const STATUS_COLORS = {
  Saved:        { bg: '#f0f0f0', text: '#555' },
  Applied:      { bg: '#dbeafe', text: '#1d4ed8' },
  Interviewing: { bg: '#fef3c7', text: '#92400e' },
  Offer:        { bg: '#dcfce7', text: '#166534' },
  Closed:       { bg: '#f3f4f6', text: '#374151' },
};

const STATUSES_WITH_DATE = ['Applied', 'Interviewing', 'Offer', 'Closed'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function emptyForm() {
  return {
    employer:       '',
    job_title:      '',
    url:            '',
    job_ad_text:    '',
    status:         'Saved',
    cv_document_id: null,
    reference_ids:  [],
    notes:          [],
    applied_at:     null,
  };
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || { bg: '#eee', text: '#555' };
  return (
    <span className="at-status-badge" style={{ background: colors.bg, color: colors.text }}>
      {status}
    </span>
  );
}

// ── Application card ──────────────────────────────────────────────────────────

function AppCard({ app, isSelected, onClick }) {
  const dateLabel = app.applied_at
    ? formatDate(app.applied_at)
    : formatDate(app.created_at.split('T')[0]);

  return (
    <button
      className={`at-card ${isSelected ? 'at-card-selected' : ''}`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      <div className="at-card-main">
        <span className="at-card-title">{app.job_title || '(No title)'}</span>
        <span className="at-card-employer">{app.employer || '(No employer)'}</span>
      </div>
      <div className="at-card-meta">
        <StatusBadge status={app.status} />
        <span className="at-card-date">{dateLabel}</span>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ApplicationTracker({ onNavigate, initialSelectedId = null }) {
  const { aiEnabled } = useAppSettings();
  const exportModalRef = useRef(null);
  const [applications, setApplications] = useState([]);
  const [cvDocuments, setCvDocuments]   = useState([]);
  const [cvSourceMode, setCvSourceMode] = useState('none');
  const [fileMissing,  setFileMissing]  = useState(false);
  const [browsing,     setBrowsing]     = useState(false);
  const [autoSaving, setAutoSaving]     = useState(false);
  const saveTimerRef = useRef(null);
  const formRef      = useRef(null);
  const [references, setReferences] = useState([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [showAdText, setShowAdText] = useState(false);
  const [noteInput, setNoteInput] = useState({ date: todayStr(), text: '' });
  const [clStyle, setClStyle] = useState('formal');
  const [clText, setClText] = useState('');
  const [clMeta, setClMeta] = useState({ salutation: '', closing: '', locale: 'en-GB' });
  const [clGenerating, setClGenerating] = useState(false);
  const [exportPathDefault, setExportPathDefault] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFolder, setExportFolder] = useState('');
  const [copyRefs, setCopyRefs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  useFocusTrap(showExportModal, exportModalRef);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const showToast = useToast();

  useEffect(() => { load(); }, []);

  // Keep formRef current so doAutoSave always reads the latest values.
  formRef.current = form;

  // Debounced autosave — fires 700 ms after any form field changes for existing apps.
  useEffect(() => {
    if (!form || !selectedId || selectedId === 'new') return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doAutoSave(selectedId), 700);
    return () => clearTimeout(saveTimerRef.current);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      setLoading(true);
      const [apps, cvDocs, refs, settings] = await Promise.all([
        applicationAPI.list(),
        cvDocumentAPI.list(),
        referenceAPI.getAll(),
        settingsAPI.getSettings(),
      ]);
      setApplications(apps);
      setCvDocuments(cvDocs);
      setReferences(refs);
      setExportPathDefault(settings.exportPath || '');
      // If navigated back from Assembly, pre-select the originating application.
      if (initialSelectedId) {
        const app = apps.find(a => a.id === initialSelectedId);
        if (app) selectApp(app);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadApps() {
    const apps = await applicationAPI.list();
    setApplications(apps);
    return apps;
  }

  function startNew() {
    // Flush any pending autosave before leaving the current app.
    clearTimeout(saveTimerRef.current);
    if (selectedId && selectedId !== 'new') doAutoSave(selectedId);

    setSelectedId('new');
    setForm(emptyForm());
    setCvSourceMode('none');
    setFileMissing(false);
    setShowAdText(false);
    setNoteInput({ date: todayStr(), text: '' });
    setClStyle('formal');
    setClText('');
    setClMeta({ salutation: '', closing: '', locale: 'en-GB' });
  }

  function selectApp(app) {
    // Flush any pending autosave before switching apps.
    clearTimeout(saveTimerRef.current);
    if (selectedId && selectedId !== 'new') doAutoSave(selectedId);

    setSelectedId(app.id);
    setForm({ ...app });
    setCvSourceMode(
      app.cv_document_id ? 'cv-document' :
      app.cv_file_path   ? 'file'         :
                           'none'
    );
    setFileMissing(false);
    setShowAdText(false);
    // Check if the external file still exists (async, non-blocking).
    if (app.cv_file_path) {
      applicationAPI.checkFiles(app.id)
        .then(r => setFileMissing(!!r.cv_file_missing))
        .catch(() => {});
    }
    setNoteInput({ date: todayStr(), text: '' });
    setClStyle(app.cover_letter?.style || 'formal');
    setClText(app.cover_letter?.text || '');
    setClMeta({
      salutation: app.cover_letter?.salutation || '',
      closing: app.cover_letter?.closing || '',
      locale: app.cover_letter?.locale || 'en-GB',
    });
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleReference(refId) {
    setForm(prev => {
      const ids = prev.reference_ids || [];
      return {
        ...prev,
        reference_ids: ids.includes(refId) ? ids.filter(id => id !== refId) : [...ids, refId],
      };
    });
  }

  // Creates a brand-new application record (only called from the "new" form).
  async function handleCreate() {
    if (!form.employer.trim() && !form.job_title.trim()) {
      setError('Please enter at least an employer or job title.');
      return;
    }
    setError('');
    try {
      const id = await applicationAPI.create({
        employer:      form.employer,
        jobTitle:      form.job_title,
        url:           form.url,
        jobAdText:     form.job_ad_text,
        status:        form.status,
        cvDocumentId:  form.cv_document_id,
        referenceIds:  form.reference_ids,
      });
      const apps = await reloadApps();
      setSelectedId(id);
      setForm(apps.find(a => a.id === id) || form);
      showToast('Application created.');
    } catch (err) {
      setError(err.message);
    }
  }

  // Autosaves the current form fields for an existing application.
  // Does NOT include cover_letter (saved explicitly) or notes (saved per-action).
  async function doAutoSave(appId) {
    const f = formRef.current;
    if (!f || !appId || appId === 'new') return;
    setAutoSaving(true);
    try {
      await applicationAPI.update(appId, {
        employer:       f.employer,
        job_title:      f.job_title,
        url:            f.url,
        job_ad_text:    f.job_ad_text,
        status:         f.status,
        cv_document_id: f.cv_document_id,
        cv_file_path:   f.cv_file_path   ?? null,
        reference_ids:  f.reference_ids,
        applied_at:     f.applied_at     || null,
      });
      setApplications(prev => prev.map(a =>
        a.id === appId
          ? { ...a, employer: f.employer, job_title: f.job_title, status: f.status }
          : a
      ));
    } catch (err) {
      showToast('Autosave failed: ' + err.message, 'error');
    } finally {
      setAutoSaving(false);
    }
  }

  async function handleAddNote() {
    if (!noteInput.text.trim() || selectedId === 'new') return;
    const newNote = { date: noteInput.date, text: noteInput.text.trim() };
    const updatedNotes = [...(form.notes || []), newNote]
      .sort((a, b) => a.date.localeCompare(b.date));
    try {
      await applicationAPI.update(selectedId, { notes: updatedNotes });
      setForm(prev => ({ ...prev, notes: updatedNotes }));
      setApplications(prev => prev.map(a => a.id === selectedId ? { ...a, notes: updatedNotes } : a));
      setNoteInput({ date: todayStr(), text: '' });
      showToast('Note added.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteNote(idx) {
    const updatedNotes = (form.notes || []).filter((_, i) => i !== idx);
    try {
      await applicationAPI.update(selectedId, { notes: updatedNotes });
      setForm(prev => ({ ...prev, notes: updatedNotes }));
      setApplications(prev => prev.map(a => a.id === selectedId ? { ...a, notes: updatedNotes } : a));
      showToast('Deleted.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this application?')) return;
    try {
      await applicationAPI.delete(selectedId);
      setApplications(prev => prev.filter(a => a.id !== selectedId));
      setSelectedId(null);
      setForm(null);
      showToast('Deleted.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGenerateCoverLetter() {
    if (selectedId === 'new') return;
    setClGenerating(true);
    setError('');
    try {
      const result = await coverLetterAPI.generate(selectedId, clStyle);
      setClText(result.text);
      setClMeta({
        salutation: result.salutation || '',
        closing: result.closing || '',
        locale: result.locale || 'en-GB',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setClGenerating(false);
    }
  }

  async function handleSaveCoverLetter() {
    if (!clText.trim() || selectedId === 'new') return;
    const coverLetter = { style: clStyle, text: clText, ...clMeta };
    try {
      await applicationAPI.update(selectedId, { cover_letter: coverLetter });
      setForm(prev => ({ ...prev, cover_letter: coverLetter }));
      setApplications(prev => prev.map(a => a.id === selectedId ? { ...a, cover_letter: coverLetter } : a));
      showToast('Cover letter saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  function handleLoadFromPrevious(appId) {
    const app = applications.find(a => a.id === parseInt(appId));
    if (app?.cover_letter) {
      setClStyle(app.cover_letter.style || 'formal');
      setClText(app.cover_letter.text || '');
      setClMeta({
        salutation: app.cover_letter.salutation || '',
        closing: app.cover_letter.closing || '',
        locale: app.cover_letter.locale || 'en-GB',
      });
    }
  }

  function openExportModal() {
    setExportFolder(exportPathDefault);
    setCopyRefs(false);
    setExportResult(null);
    setShowExportModal(true);
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const result = await exportAPI.exportApplication(selectedId, exportFolder.trim(), copyRefs);
      setExportResult(result);
      showToast(`Exported to ${result.folderPath}`);
      await applicationAPI.update(selectedId, { export_folder_path: result.folderPath });
      setForm(prev => ({ ...prev, export_folder_path: result.folderPath }));
      setApplications(prev => prev.map(a =>
        a.id === selectedId ? { ...a, export_folder_path: result.folderPath } : a
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const filtered = filterStatus === 'All'
    ? applications
    : applications.filter(a => a.status === filterStatus);

  const prevCoverLetters = applications.filter(a => a.id !== selectedId && a.cover_letter?.text);

  const selectedCvDocument = form?.cv_document_id
    ? cvDocuments.find(d => d.id === form.cv_document_id)
    : null;

  async function handleBrowseFile() {
    if (browsing) return;
    setBrowsing(true);
    try {
      const { path } = await exportAPI.browseFile();
      if (path) {
        setForm(prev => ({ ...prev, cv_file_path: path }));
        setFileMissing(false);
      }
    } catch (err) {
      showToast('Could not open file picker: ' + err.message, 'error');
    } finally {
      setBrowsing(false);
    }
  }

  async function handleOpenFile() {
    if (!form?.cv_file_path) return;
    try {
      await exportAPI.openFile(form.cv_file_path);
    } catch {
      showToast('File not found — it may have been moved or deleted.', 'error');
      setFileMissing(true);
    }
  }

  function setCvSource(src) {
    setCvSourceMode(src);
    if (src !== 'cv-document') setForm(prev => ({ ...prev, cv_document_id: null }));
    if (src !== 'file')        setForm(prev => ({ ...prev, cv_file_path: null }));
    setFileMissing(false);
  }

  if (loading) return <div className="at-loading">Loading…</div>;

  return (
    <div className="at-page">

      {/* ── Left: list panel ── */}
      <div className="at-list-panel">
        <div className="at-list-header">
          <h2>Applications</h2>
          <button className="btn btn-primary btn-sm btn-with-icon" onClick={startNew}>
            <Icon.Add className="icon" /> New
          </button>
        </div>

        <div className="at-status-tabs">
          {['All', ...STATUSES].map(s => {
            const count = s === 'All' ? applications.length : applications.filter(a => a.status === s).length;
            return (
              <button
                key={s}
                className={`at-status-tab ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(s)}
              >
                {s} <span className="at-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="at-error">
            {error}
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        <div className="at-list">
          {filtered.length === 0 && (
            <p className="at-list-empty">
              {filterStatus === 'All' ? 'No applications yet.' : `No "${filterStatus}" applications.`}
            </p>
          )}
          {filtered.map(app => (
            <AppCard
              key={app.id}
              app={app}
              isSelected={selectedId === app.id}
              onClick={() => selectApp(app)}
            />
          ))}
        </div>
      </div>

      {/* ── Export modal ── */}
      {showExportModal && (
        <div
          className="at-modal-overlay"
          onClick={() => setShowExportModal(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowExportModal(false); }}
        >
          <div
            className="at-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
            ref={exportModalRef}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="export-modal-title">Export Files</h3>
            <p className="at-modal-desc">
              Saves CV and cover letter as DOCX and PDF into a new sub-folder named after this
              application. The CV uses the linked composition; the cover letter uses the saved text.
              <br /><br />
              <strong>Tip:</strong> Set a default folder once in <strong>Settings → Export Path</strong> so you don't have to enter it each time.
            </p>
            <div className="at-form-group">
              <label>Export folder</label>
              <input
                type="text"
                className="at-field"
                value={exportFolder}
                onChange={e => setExportFolder(e.target.value)}
                placeholder="e.g. C:\Users\you\Documents\Job Applications"
              />
            </div>
            {form.reference_ids?.length > 0 && (
              <label className="at-modal-check-label">
                <input
                  type="checkbox"
                  checked={copyRefs}
                  onChange={e => setCopyRefs(e.target.checked)}
                />
                Copy {form.reference_ids.length} selected reference letter{form.reference_ids.length !== 1 ? 's' : ''} to this folder
              </label>
            )}
            {exportResult ? (
              <div className="at-modal-result">
                <p>Saved to: <code>{exportResult.folderPath}</code></p>
                <ul>
                  {exportResult.files.map(f => <li key={f}>{f}</li>)}
                </ul>
                <button
                  className="btn btn-secondary btn-sm at-open-folder-btn"
                  onClick={() => exportAPI.openFolder(exportResult.folderPath)}
                >
                  Open folder ↗
                </button>
              </div>
            ) : null}
            <div className="at-modal-actions">
              {exportResult ? (
                <>
                  <button className="btn btn-primary" onClick={() => setShowExportModal(false)}>
                    Done
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleExport}
                    disabled={exporting || !exportFolder.trim()}
                  >
                    {exporting ? 'Exporting…' : 'Export again'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleExport}
                    disabled={exporting || !exportFolder.trim()}
                  >
                    {exporting ? 'Exporting…' : 'Export'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowExportModal(false)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Right: detail panel ── */}
      <div className="at-detail-panel">
        {!form ? (
          <div className="at-empty-detail">
            <p>Select an application from the list, or create a new one.</p>
          </div>
        ) : (
          <div className="at-detail">

            {/* Header */}
            <div className="at-detail-header">
              <div className="at-detail-title-row">
                <input
                  className="at-field-title"
                  value={form.job_title}
                  onChange={e => set('job_title', e.target.value)}
                  placeholder="Job title"
                />
                <input
                  className="at-field-employer"
                  value={form.employer}
                  onChange={e => set('employer', e.target.value)}
                  placeholder="Employer"
                />
              </div>
              <div className="at-detail-header-actions">
                <select
                  className="at-status-select"
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                  style={{
                    borderColor: STATUS_COLORS[form.status]?.text || '#ccc',
                    color: STATUS_COLORS[form.status]?.text || '#333',
                  }}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                {selectedId === 'new' ? (
                  <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                    Create application
                  </button>
                ) : (
                  autoSaving && (
                    <span className="at-autosave-indicator">Saving…</span>
                  )
                )}

                {selectedId !== 'new' && (
                  <button className="btn btn-secondary btn-sm at-delete-btn" onClick={handleDelete}>Delete</button>
                )}
                {selectedId !== 'new' && (
                  <button className="btn btn-secondary btn-sm" onClick={openExportModal} title="Export CV and cover letter as DOCX and PDF">
                    Export
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="at-detail-body">

              {selectedId !== 'new' && (
                <p className="at-created-date">
                  Created {formatDate(form.created_at?.split('T')[0])}
                </p>
              )}

              {form.export_folder_path && (
                <p className="at-export-folder">
                  <span>Last exported to: <code>{form.export_folder_path}</code></span>
                  <button
                    className="at-inline-link"
                    onClick={() => exportAPI.openFolder(form.export_folder_path)}
                  >
                    Open folder ↗
                  </button>
                </p>
              )}

              {/* URL */}
              <div className="at-form-group">
                <label>Job ad URL</label>
                <input
                  type="url"
                  className="at-field"
                  value={form.url || ''}
                  onChange={e => set('url', e.target.value)}
                  placeholder="https://…"
                />
              </div>

              {/* Applied date */}
              {STATUSES_WITH_DATE.includes(form.status) && (
                <div className="at-form-group">
                  <label>Date applied</label>
                  <input
                    type="date"
                    className="at-field at-field-date"
                    value={form.applied_at || ''}
                    onChange={e => set('applied_at', e.target.value || null)}
                  />
                </div>
              )}

              {/* Job ad text */}
              <div className="at-form-group">
                <button className="at-toggle-btn" onClick={() => setShowAdText(v => !v)}>
                  {showAdText ? '▾' : '▸'} Job ad text
                  {form.job_ad_text ? ' ✓' : ''}
                </button>
                {showAdText && (
                  <textarea
                    className="at-field at-ad-textarea"
                    value={form.job_ad_text || ''}
                    onChange={e => set('job_ad_text', e.target.value)}
                    placeholder="Paste or edit the job ad text here…"
                    rows={8}
                  />
                )}
              </div>

              {/* CV source */}
              <div className="at-form-group">
                <label>CV for this application</label>

                {fileMissing && (
                  <div className="at-file-missing-banner">
                    CV file not found — it may have been moved or deleted.
                    <button
                      className="at-inline-link"
                      onClick={handleBrowseFile}
                      disabled={browsing}
                    >
                      {browsing ? 'Opening…' : 'Re-link'}
                    </button>
                    <button
                      className="at-inline-link"
                      onClick={() => { setForm(prev => ({ ...prev, cv_file_path: null })); setCvSource('none'); }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="at-cv-source-tabs">
                  {[
                    { id: 'cv-document', label: 'Library CV' },
                    { id: 'file',        label: 'External file' },
                    { id: 'none',        label: 'None' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      className={`at-cv-source-tab${cvSourceMode === id ? ' active' : ''}`}
                      onClick={() => setCvSource(id)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {cvSourceMode === 'cv-document' && (
                  <div className="at-composition-row">
                    <select
                      className="at-field at-composition-select"
                      value={form.cv_document_id || ''}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        cv_document_id: e.target.value ? parseInt(e.target.value) : null,
                      }))}
                    >
                      <option value="">— None —</option>
                      {cvDocuments.map(d => (
                        <option key={d.id} value={d.id}>{d.title || 'Untitled CV'}</option>
                      ))}
                    </select>
                    {form.cv_document_id && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onNavigate('assembly', {
                          documentId:        form.cv_document_id,
                          fromApplicationId: selectedId,
                          fromEmployer:      form.employer,
                          fromJobTitle:      form.job_title,
                        })}
                        title="Open in Assembly"
                      >
                        Open in Assembly
                      </button>
                    )}
                  </div>
                )}
                {cvSourceMode === 'cv-document' && selectedCvDocument && (
                  <p className="at-composition-hint">
                    Using: <strong>{selectedCvDocument.title || 'Untitled CV'}</strong>
                  </p>
                )}

                {cvSourceMode === 'file' && (
                  <div className="at-file-row">
                    {form.cv_file_path ? (
                      <>
                        <span className="at-file-name" title={form.cv_file_path}>
                          {form.cv_file_path.split(/[\\/]/).pop()}
                        </span>
                        <span className="at-file-path">{form.cv_file_path}</span>
                        <div className="at-file-actions">
                          <button className="btn btn-secondary btn-sm" onClick={handleOpenFile}>
                            Open file
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={handleBrowseFile} disabled={browsing}>
                            {browsing ? 'Opening…' : 'Change…'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={handleBrowseFile} disabled={browsing}>
                        {browsing ? 'Opening…' : 'Browse…'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Reference letters */}
              <div className="at-form-group">
                <label>Reference letters</label>
                {references.length === 0 ? (
                  <p className="at-empty-note">No reference letters uploaded yet.</p>
                ) : (
                  <div className="at-refs-list">
                    {references.map(ref => (
                      <label key={ref.id} className="at-ref-item">
                        <input
                          type="checkbox"
                          checked={(form.reference_ids || []).includes(ref.id)}
                          onChange={() => toggleReference(ref.id)}
                        />
                        <span className="at-ref-name">{ref.file_name}</span>
                        {ref.job_title && (
                          <span className="at-ref-job">— {ref.job_title}, {ref.employer}</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity notes */}
              <div className="at-form-group">
                <label>Activity log</label>
                {selectedId === 'new' ? (
                  <p className="at-empty-note">Save the application first to add notes.</p>
                ) : (
                  <>
                    <div className="at-notes-list">
                      {(form.notes || []).length === 0 && (
                        <p className="at-empty-note">No notes yet.</p>
                      )}
                      {(form.notes || []).map((note, i) => (
                        <div key={i} className="at-note">
                          <span className="at-note-date">{formatDate(note.date)}</span>
                          <span className="at-note-text">{note.text}</span>
                          <button
                            className="at-note-delete"
                            onClick={() => handleDeleteNote(i)}
                            aria-label="Delete note"
                          >×</button>
                        </div>
                      ))}
                    </div>
                    <div className="at-note-add">
                      <input
                        type="date"
                        className="at-note-date-input"
                        value={noteInput.date}
                        onChange={e => setNoteInput(prev => ({ ...prev, date: e.target.value }))}
                      />
                      <input
                        type="text"
                        className="at-note-text-input"
                        value={noteInput.text}
                        onChange={e => setNoteInput(prev => ({ ...prev, text: e.target.value }))}
                        placeholder="e.g. Had phone screen with Sarah"
                        onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleAddNote}
                        disabled={!noteInput.text.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Cover letter */}
              <div className="at-form-group at-cl-section">
                <label>
                  Cover Letter
                  <InfoTip text="The generated cover letter body is wrapped with a date, salutation, and closing when exported. The language of these matches the letter body automatically." />
                </label>

                <div className="at-cl-controls">
                  <div className="at-cl-style-radios">
                    <label className="at-cl-radio">
                      <input type="radio" value="formal" checked={clStyle === 'formal'} onChange={() => setClStyle('formal')} />
                      Formal letter
                    </label>
                    <label className="at-cl-radio">
                      <input type="radio" value="short" checked={clStyle === 'short'} onChange={() => setClStyle('short')} />
                      Short note
                    </label>
                  </div>
                  <div className="at-cl-actions">
                    {prevCoverLetters.length > 0 && (
                      <select
                        className="at-cl-load-select"
                        value=""
                        onChange={e => { if (e.target.value) handleLoadFromPrevious(e.target.value); }}
                        aria-label="Load cover letter from a previous application"
                      >
                        <option value="">Load from previous…</option>
                        {prevCoverLetters.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.job_title || '(No title)'} — {a.employer || '(No employer)'}
                          </option>
                        ))}
                      </select>
                    )}
                    {aiEnabled && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleGenerateCoverLetter}
                        disabled={clGenerating || selectedId === 'new'}
                      >
                        {clGenerating ? 'Generating…' : clText ? 'Regenerate' : 'Generate'}
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  className="at-cl-textarea"
                  value={clText}
                  onChange={e => setClText(e.target.value)}
                  placeholder={
                    selectedId === 'new'
                      ? 'Save the application first to generate a cover letter.'
                      : 'Click Generate to create a cover letter, or start typing directly…'
                  }
                  rows={18}
                  disabled={selectedId === 'new'}
                />

                {clText && (
                  <div className="at-cl-footer">
                    <span className="at-cl-wordcount">
                      {clText.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveCoverLetter}>
                      Save cover letter
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
