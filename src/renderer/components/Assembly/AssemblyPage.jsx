import { useState, useEffect, useRef, useCallback } from 'react';
import TurndownService from 'turndown';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import AssemblyEditor          from './AssemblyEditor.jsx';
import AssemblyToolbar         from './AssemblyToolbar.jsx';
import PoolDrawer              from './PoolDrawer.jsx';
import AIChatPanel             from './AIChatPanel.jsx';
import StartNewCVDialog        from './StartNewCVDialog.jsx';
import SaveToApplicationModal  from './SaveToApplicationModal.jsx';
import { useAssemblyStore } from '../../stores/assemblyStore.js';
import { usePoolStore }     from '../../stores/poolStore.js';
import { cvDocumentAPI, settingsAPI, profileAPI, taskAPI, exportAPI, applicationAPI } from '../../services/ipc.js';
import { findJobIdForPosition, getAllPlainItems } from './tiptapUtils.js';
import { useToast }        from '../../contexts/ToastContext.jsx';
import './Assembly.css';

// Builds a compact description of the document's heading structure for the AI.
// Includes [jobId:N] labels so the AI can reference specific sections in
// [[SUGGESTION jobId="N": ...]] blocks.  No task content is included (the AI
// already has the full pool; we just need the skeleton here).
function buildDocumentStructure(html) {
  if (!html || !html.trim()) return '(Empty document)';
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const lines = [];
  for (const el of doc.body.children) {
    if (el.tagName === 'H1') {
      lines.push('[Name heading]');
    } else if (el.tagName === 'H2') {
      lines.push(`\nSection: ${el.textContent.trim()}`);
    } else if (el.tagName === 'H3') {
      const jobId = el.getAttribute('data-job-id');
      lines.push(jobId
        ? `  [jobId:${jobId}] ${el.textContent.trim()}`
        : `  ${el.textContent.trim()}`);
    }
  }
  return lines.join('\n').trim() || '(No headings found)';
}

// AssemblyPage owns the overall layout and document lifecycle.
// The Tiptap editor lives inside AssemblyEditor; formatting commands reach it via
// editorInstance (retrieved once from the ref after the editor is ready).
//
// Props:
//   openDocumentId       — open this cv_document directly (no start dialog)
//   newDocument          — show the start dialog (true when coming from CV Library)
//   preselectedProfileId — pre-select this profile in the start dialog
//   registerNavGuard     — App.jsx hook: registers a function that intercepts nav away
//   onNavigate           — App.jsx navigate() for redirecting after dialog cancel

export default function AssemblyPage({ openDocumentId, newDocument, preselectedProfileId, registerNavGuard, onNavigate, fromApplicationId, fromEmployer, fromJobTitle }) {
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showNavGuard, setShowNavGuard]       = useState(false);
  const [guardCallbacks, setGuardCallbacks]   = useState(null);
  const [saving, setSaving]                   = useState(false);
  const [exporting, setExporting]             = useState(false);
  const [aiEnabled, setAiEnabled]             = useState(false);
  const [showLinkModal, setShowLinkModal]       = useState(false);
  const [showSaveAsModal, setShowSaveAsModal]   = useState(false);
  const [deleteConfirm, setDeleteConfirm]       = useState(null);
  const [deleting, setDeleting]                 = useState(false);
  const [exportNotification, setExportNotification] = useState(null);
  const [exportPathMissing, setExportPathMissing]   = useState(false);
  const [buildingBlockItems, setBuildingBlockItems] = useState(null);
  const [profiles, setProfiles]               = useState([]);
  // The Tiptap editor instance, retrieved once after AssemblyEditor signals ready.
  const [editorInstance, setEditorInstance]   = useState(null);

  const editorRef         = useRef(null);
  // Content to set on the editor once it mounts.  When a new document is
  // created the AssemblyEditor hasn't rendered yet (it's inside the
  // {documentId && …} gate), so we can't call setContent immediately.
  const pendingContentRef = useRef(null);
  const titleSaveTimer    = useRef(null);

  const {
    documentId, title, isDirty, profileId,
    loadDocument, reset, markClean, setProfileId,
  } = useAssemblyStore();

  const { setActiveTaskItem, loadJobs } = usePoolStore();
  const showToast = useToast();

  const getDocumentStructure = useCallback(
    () => buildDocumentStructure(editorRef.current?.getHTML() ?? ''),
    [],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Sets editor content: applies immediately if the editor is already
  // mounted, otherwise queues it for handleEditorReady.
  function setEditorContent(html) {
    if (editorRef.current) {
      editorRef.current.setContent(html);
    } else {
      pendingContentRef.current = html;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    settingsAPI.getSettings()
      .then(s => setAiEnabled(s.aiEnabled !== false))
      .catch(() => {});

    profileAPI.list()
      .then(setProfiles)
      .catch(() => {});

    // Load pool data so the AI panel can match suggestions to pool versions
    // even if the pool drawer has never been opened this session.
    loadJobs().catch(() => {});

    if (openDocumentId) {
      openDocument(openDocumentId);
    } else if (newDocument || !documentId) {
      setShowStartDialog(true);
    }

    return () => { reset(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave on title changes. Content-only autosave lives in AssemblyEditor;
  // this covers the gap where a title edit never touches the editor body.
  useEffect(() => {
    if (!documentId) return;
    clearTimeout(titleSaveTimer.current);
    titleSaveTimer.current = setTimeout(async () => {
      const html = editorRef.current?.getHTML() ?? '';
      try {
        await cvDocumentAPI.update(documentId, { title, content_html: html });
        markClean();
      } catch { /* silent — next save retries */ }
    }, 1500);
    return () => clearTimeout(titleSaveTimer.current);
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Called by AssemblyEditor once Tiptap has initialised its view.
  function handleEditorReady() {
    setEditorInstance(editorRef.current?.getEditor() ?? null);
    // Apply any content that was queued before the editor existed.
    if (pendingContentRef.current !== null) {
      editorRef.current?.setContent(pendingContentRef.current);
      pendingContentRef.current = null;
    }
  }

  // ── Browser tab / window close guard ────────────────────────────────────────

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ── Navigation guard ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!registerNavGuard) return;
    if (isDirty) {
      registerNavGuard((proceed, cancel) => {
        setGuardCallbacks({ proceed, cancel });
        setShowNavGuard(true);
      });
    } else {
      registerNavGuard(null);
    }
    return () => registerNavGuard(null);
  }, [isDirty, registerNavGuard]);

  // ── Document open / create ───────────────────────────────────────────────────

  async function openDocument(id) {
    try {
      const doc = await cvDocumentAPI.get(id);
      loadDocument({ id: doc.id, title: doc.title, profileId: doc.profile_id, jobAdText: doc.job_ad_text });
      setEditorContent(doc.content_html ?? '');
    } catch (err) {
      showToast('Failed to open document: ' + err.message, 'error');
      setShowStartDialog(true);
    }
  }

  async function handleDocumentCreated(id, docTitle, profileId) {
    try {
      const doc = await cvDocumentAPI.get(id);
      loadDocument({ id: doc.id, title: docTitle, profileId, jobAdText: '' });
      setEditorContent(doc.content_html ?? '');
      setShowStartDialog(false);
    } catch (err) {
      showToast('Failed to load new document: ' + err.message, 'error');
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!documentId || saving) return;
    setSaving(true);
    try {
      const html = editorRef.current?.getHTML() ?? '';
      await cvDocumentAPI.update(documentId, { title, content_html: html });
      markClean();
      showToast('Saved');

      // Detect text that could be saved as pool building blocks.
      //
      // Case 1 — <li> without data-task-id: plain bullet inside a list.
      //
      // Case 2 — <p> paragraphs in job sections (H3 → next H2/H3):
      //   The FIRST <p> after an H3 is always the employer/date line — skip it.
      //   Every subsequent <p> before the next heading is a task the user typed.
      //   Content before any H3 (contact info, intro) is excluded entirely.
      const plainTexts = [];
      {
        const parser = new DOMParser();
        const parsed  = parser.parseFromString(html, 'text/html');

        // Only collect from pool-linked job sections: H3 with data-job-id.
        // Education, Skills, Languages etc. have H3s without data-job-id
        // and are excluded entirely.
        let inJobSection = false;
        let skipNextP    = false;

        Array.from(parsed.body.children).forEach(el => {
          const tag = el.tagName;

          if (tag === 'H1' || tag === 'H2') {
            inJobSection = false;
            skipNextP    = false;
            return;
          }
          if (tag === 'H3') {
            inJobSection = el.hasAttribute('data-job-id');
            skipNextP    = true; // skip employer/date line
            return;
          }
          if (!inJobSection) return;

          if (tag === 'UL' || tag === 'OL') {
            // Plain <li> within a pool job section = new task typed in the list.
            // Skip texts the AI panel just inserted — the user already accepted them.
            const aiTexts = useAssemblyStore.getState().aiInsertedTexts;
            el.querySelectorAll('li:not([data-task-id])').forEach(li => {
              const text = (li.textContent || '').trim();
              if (text && !aiTexts.includes(text)) plainTexts.push(text);
            });
            skipNextP = false; // paragraph after a list = new task typed below
            return;
          }

          if (tag === 'P' && !el.closest('li')) {
            if (skipNextP) { skipNextP = false; return; }
            const text = (el.textContent || '').trim();
            if (text) plainTexts.push(text);
          }
        });
      }

      if (plainTexts.length > 0) {
        // Try to enrich with ProseMirror positions for promoteToPoolItem
        const pmDoc = editorRef.current?.getEditor()?.state?.doc;
        const pmItems = pmDoc ? getAllPlainItems(pmDoc) : [];

        const items = plainTexts.map(text => {
          const pm = pmItems.find(p => p.text === text);
          return {
            text,
            nodePos:     pm?.nodePos      ?? null,
            nearestJobId: pm && pmDoc
              ? findJobIdForPosition(pmDoc, pm.nodePos)
              : null,
          };
        });
        setBuildingBlockItems(items);
      }
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Profile change ──────────────────────────────────────────────────────────

  async function handleProfileChange(newProfileId) {
    setProfileId(newProfileId);
    try {
      await cvDocumentAPI.update(documentId, { profile_id: newProfileId });
    } catch (err) {
      showToast('Failed to update profile: ' + err.message, 'error');
    }
  }

  // ── Save as ─────────────────────────────────────────────────────────────────

  async function handleSaveAs(newTitle, newProfileId) {
    const html = editorRef.current?.getHTML() ?? '';
    try {
      const { id } = await cvDocumentAPI.create({
        title:        newTitle,
        content_html: html,
        profile_id:   newProfileId ?? null,
      });
      setShowSaveAsModal(false);
      await openDocument(id);
      showToast('New draft created');
    } catch (err) {
      showToast('Save as failed: ' + err.message, 'error');
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDeleteClick() {
    let linkedApps = 0;
    try {
      const apps = await applicationAPI.list();
      linkedApps = apps.filter(a => a.cv_document_id === documentId).length;
    } catch { /* show dialog without the warning if this fails */ }
    setDeleteConfirm({ linkedApps });
  }

  async function handleConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await cvDocumentAPI.delete(documentId);
      markClean();
      showToast('CV deleted');
      onNavigate('cv-library');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  async function handleExport(format) {
    if (!documentId || exporting) return;
    await editorRef.current?.flushSave();

    if (format === 'md') {
      const html = editorRef.current?.getHTML() ?? '';
      const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
      const markdown = td.turndown(html);
      const safeTitle = (title || 'CV').replace(/[\\/:*?"<>|]/g, '-');
      const blob = new Blob([markdown], { type: 'text/markdown; charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported as Markdown');
      return;
    }

    setExporting(true);
    try {
      const result = format === 'pdf'
        ? await cvDocumentAPI.exportPdf(documentId)
        : await cvDocumentAPI.exportDocx(documentId);
      const sep = result.filePath.includes('\\') ? '\\' : '/';
      const lastSep = Math.max(result.filePath.lastIndexOf('\\'), result.filePath.lastIndexOf('/'));
      const folderPath = result.filePath.substring(0, lastSep);
      const fileName   = result.filePath.substring(lastSep + 1);
      showToast(`Exported: ${fileName}`);
      setExportNotification({ fileName, folderPath });
    } catch (err) {
      if (err.message.includes('Export path not set')) {
        setExportPathMissing(true);
      } else {
        showToast('Export failed: ' + err.message, 'error');
      }
    } finally {
      setExporting(false);
    }
  }

  // ── Nav guard responses ──────────────────────────────────────────────────────

  async function handleSaveAndLeave() {
    await handleSave();
    setShowNavGuard(false);
    guardCallbacks?.proceed();
  }
  function handleDiscardAndLeave() {
    setShowNavGuard(false);
    guardCallbacks?.proceed();
  }
  function handleStay() {
    setShowNavGuard(false);
    guardCallbacks?.cancel();
  }

  // ── Building blocks ─────────────────────────────────────────────────────────

  async function handleBuildingBlockConfirm(decisions) {
    let savedCount = 0;
    for (const d of decisions) {
      try {
        let finalTaskId, finalVersionId;
        if (d.mode === 'new') {
          const r = await taskAPI.createTaskWithVersion(parseInt(d.jobId), d.text, []);
          finalTaskId   = r.taskId;
          finalVersionId = r.versionId;
        } else {
          const r = await taskAPI.createTaskVersion(parseInt(d.taskId), d.text, []);
          finalTaskId   = parseInt(d.taskId);
          finalVersionId = r.id;
        }
        if (d.nodePos != null) {
          editorRef.current?.promoteToPoolItem(d.nodePos, finalTaskId, finalVersionId);
        }
        savedCount++;
      } catch (err) {
        console.error('Failed to save building block:', err);
      }
    }
    setBuildingBlockItems(null);
    if (savedCount > 0) {
      await loadJobs();
      showToast(`${savedCount} building block${savedCount !== 1 ? 's' : ''} saved to pool`);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="asm-page">

      {showStartDialog && (
        <StartNewCVDialog
          inline={!documentId}
          preselectedProfileId={preselectedProfileId}
          onCreated={handleDocumentCreated}
          onCancel={() => {
            setShowStartDialog(false);
            if (!documentId) onNavigate?.('home');
          }}
        />
      )}

      {showNavGuard && (
        <NavGuardDialog
          onSaveAndLeave={handleSaveAndLeave}
          onDiscard={handleDiscardAndLeave}
          onStay={handleStay}
        />
      )}

      {buildingBlockItems && (
        <PoolBuildingBlocksDialog
          items={buildingBlockItems}
          onConfirm={handleBuildingBlockConfirm}
          onClose={() => setBuildingBlockItems(null)}
        />
      )}

      {showLinkModal && (
        <SaveToApplicationModal
          documentId={documentId}
          documentTitle={title}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {showSaveAsModal && (
        <SaveAsCvModal
          currentTitle={title}
          currentProfileId={profileId ?? ''}
          profiles={profiles}
          onConfirm={handleSaveAs}
          onClose={() => setShowSaveAsModal(false)}
        />
      )}

      {deleteConfirm && (
        <DeleteCvConfirmDialog
          title={title}
          linkedApps={deleteConfirm.linkedApps}
          deleting={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {documentId && (
        <div className="asm-inner">
          {exportPathMissing && (
            <div className="asm-export-banner asm-export-banner-error">
              <span>No export path set — choose a folder where files will be saved.</span>
              <div className="asm-export-banner-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setExportPathMissing(false); onNavigate('settings'); }}
                >
                  Go to Settings →
                </button>
                <button
                  className="asm-export-banner-dismiss"
                  onClick={() => setExportPathMissing(false)}
                  aria-label="Dismiss"
                >×</button>
              </div>
            </div>
          )}
          {exportNotification && (
            <div className="asm-export-banner">
              <span>Saved to <code className="asm-export-banner-path">{exportNotification.folderPath}</code></span>
              <div className="asm-export-banner-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => exportAPI.openFolder(exportNotification.folderPath)}
                >
                  Open folder ↗
                </button>
                <button
                  className="asm-export-banner-dismiss"
                  onClick={() => setExportNotification(null)}
                  aria-label="Dismiss"
                >×</button>
              </div>
            </div>
          )}
          <AssemblyToolbar
            editor={editorInstance}
            onSave={handleSave}
            onSaveAs={() => setShowSaveAsModal(true)}
            onExport={handleExport}
            onDelete={handleDeleteClick}
            onLinkToApp={() => setShowLinkModal(true)}
            onProfileChange={handleProfileChange}
            profiles={profiles}
            aiEnabled={aiEnabled}
            saving={saving}
            fromApplicationId={fromApplicationId}
            fromEmployer={fromEmployer}
            fromJobTitle={fromJobTitle}
            onBackToApplication={fromApplicationId
              ? () => onNavigate('applications', { selectedId: fromApplicationId })
              : null}
          />
          <div className="asm-content-area">
            <PoolDrawer editorRef={editorRef} />
            <AssemblyEditor
              ref={editorRef}
              onActiveItemChange={setActiveTaskItem}
              onEditorReady={handleEditorReady}
            />
            {aiEnabled && (
              <AIChatPanel
                editorRef={editorRef}
                getDocumentStructure={getDocumentStructure}
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── SaveAsCvModal ─────────────────────────────────────────────────────────────

function SaveAsCvModal({ currentTitle, currentProfileId, profiles, onConfirm, onClose }) {
  const [title,     setTitle]     = useState(currentTitle);
  const [profileId, setProfileId] = useState(currentProfileId ?? '');
  const [saving,    setSaving]    = useState(false);
  const ref = useRef(null);
  useFocusTrap(true, ref);

  async function handleSubmit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onConfirm(title.trim(), profileId !== '' ? parseInt(profileId) : null);
    setSaving(false);
  }

  return (
    <div className="asm-dialog-overlay" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="asm-dialog" role="dialog" aria-modal="true"
           aria-labelledby="save-as-title" ref={ref}>
        <h2 className="asm-dialog-title" id="save-as-title">Save as new draft</h2>
        <p className="asm-dialog-body">
          Creates a new CV with the current content. The original draft is left unchanged.
        </p>

        <label className="asm-dialog-label">
          Title
          <input
            className="asm-dialog-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        </label>

        <label className="asm-dialog-label">
          Profile
          <select
            className="asm-dialog-select"
            value={profileId}
            onChange={e => setProfileId(e.target.value)}
          >
            <option value="">Unorganised</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <div className="asm-dialog-actions">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={!title.trim() || saving}
          >
            {saving ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PoolBuildingBlocksDialog ──────────────────────────────────────────────────
// Shown after Save when the document contains plain (non-pool) bullets.
// The user can tick any or all of them and choose whether to save each as a
// new task or as a new version of an existing task.

function sortJobsByRecency(jobs) {
  return [...jobs].sort((a, b) => {
    const aEnd = a.end_date || '';
    const bEnd = b.end_date || '';
    if (!aEnd && bEnd)  return -1;
    if (aEnd  && !bEnd) return  1;
    if (!aEnd && !bEnd) return  0;
    return bEnd.localeCompare(aEnd);
  });
}

function jobLabel(job) {
  const parts = [job.job_title || 'Untitled role'];
  parts.push(job.end_date ? job.end_date.slice(0, 4) : 'current');
  return parts.join(' · ');
}

function PoolBuildingBlocksDialog({ items, onConfirm, onClose }) {
  const ref = useRef(null);
  useFocusTrap(true, ref);
  const [jobs,      setJobs]      = useState([]);
  const [decisions, setDecisions] = useState(
    items.map(item => ({
      nodePos: item.nodePos,
      text:    item.text,
      save:    false,
      mode:    'new',
      jobId:   item.nearestJobId ? String(item.nearestJobId) : '',
      taskId:  '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    taskAPI.getAllJobsWithTasks()
      .then(list => {
        const sorted = sortJobsByRecency(list);
        setJobs(sorted);
        // Fill in default jobId / taskId for each decision
        setDecisions(prev => prev.map(d => {
          const jobId = d.jobId || (sorted[0] ? String(sorted[0].id) : '');
          const job   = sorted.find(j => String(j.id) === jobId) || sorted[0];
          const first = (job?.tasks || [])[0];
          return { ...d, jobId, taskId: first ? String(first.id) : '' };
        }));
      })
      .catch(() => setError('Could not load jobs.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(idx, patch) {
    setDecisions(prev => prev.map((d, i) => {
      if (i !== idx) return d;
      const next = { ...d, ...patch };
      // When job changes, reset taskId to first task of new job
      if (patch.jobId !== undefined && patch.jobId !== d.jobId) {
        const job   = jobs.find(j => String(j.id) === patch.jobId);
        const first = (job?.tasks || [])[0];
        next.taskId = first ? String(first.id) : '';
      }
      return next;
    }));
  }

  const toSave = decisions.filter(d => d.save);

  async function handleConfirm() {
    if (!toSave.length || saving) return;
    setSaving(true);
    try {
      await onConfirm(toSave);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="asm-dialog-overlay" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="asm-dialog asm-dialog-wide" role="dialog" aria-modal="true"
           aria-labelledby="bb-dialog-title" ref={ref}>
        <h2 className="asm-dialog-title" id="bb-dialog-title">Save as building blocks?</h2>
        <p className="asm-dialog-body">
          {items.length === 1
            ? 'This bullet isn\'t in your experience pool yet.'
            : `${items.length} bullets aren't in your experience pool yet.`
          }{' '}
          Tick any you'd like to save as reusable tasks.
        </p>

        {error && <p className="asm-dialog-error">{error}</p>}

        <div className="bb-list">
          {decisions.map((d, i) => {
            const job   = jobs.find(j => String(j.id) === d.jobId);
            const tasks = job?.tasks || [];
            return (
              <div key={i} className={`bb-item${d.save ? ' bb-item-open' : ''}`}>
                <label className="bb-item-check">
                  <input
                    type="checkbox"
                    checked={d.save}
                    onChange={e => update(i, { save: e.target.checked })}
                  />
                  <span className="bb-item-text">{d.text}</span>
                </label>

                {d.save && (
                  <div className="bb-item-opts">
                    <div className="asm-link-tabs">
                      <button
                        className={`asm-link-tab${d.mode === 'new' ? ' active' : ''}`}
                        onClick={() => update(i, { mode: 'new' })}
                      >
                        New task
                      </button>
                      <button
                        className={`asm-link-tab${d.mode === 'version' ? ' active' : ''}`}
                        onClick={() => update(i, { mode: 'version' })}
                      >
                        Add as version
                      </button>
                    </div>

                    <select
                      className="asm-dialog-select"
                      value={d.jobId}
                      onChange={e => update(i, { jobId: e.target.value })}
                    >
                      {jobs.length === 0
                        ? <option value="">Loading…</option>
                        : jobs.map(j => (
                            <option key={j.id} value={j.id}>{jobLabel(j)}</option>
                          ))
                      }
                    </select>

                    {d.mode === 'version' && (
                      tasks.length > 0
                        ? (
                          <select
                            className="asm-dialog-select"
                            value={d.taskId}
                            onChange={e => update(i, { taskId: e.target.value })}
                          >
                            {tasks.map(t => {
                              const def = (t.versions || []).find(v => v.is_default) || t.versions?.[0];
                              const raw = def?.description || `Task ${t.id}`;
                              return (
                                <option key={t.id} value={t.id}>
                                  {raw.length > 70 ? raw.slice(0, 68) + '…' : raw}
                                </option>
                              );
                            })}
                          </select>
                        )
                        : <p className="asm-dialog-hint">No tasks for this job — use New task instead.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="asm-dialog-actions">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleConfirm}
            disabled={toSave.length === 0 || saving}
          >
            {saving
              ? 'Saving…'
              : `Save ${toSave.length} building block${toSave.length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DeleteCvConfirmDialog ────────────────────────────────────────────────────

function DeleteCvConfirmDialog({ title, linkedApps, deleting, onConfirm, onCancel }) {
  const ref = useRef(null);
  useFocusTrap(true, ref);
  return (
    <div className="asm-dialog-overlay" onKeyDown={e => e.key === 'Escape' && !deleting && onCancel()}>
      <div className="asm-dialog" role="alertdialog" aria-modal="true"
           aria-labelledby="delete-cv-title" ref={ref}>
        <h2 className="asm-dialog-title" id="delete-cv-title">Delete this CV?</h2>
        <p className="asm-dialog-body">
          Delete <strong>{title || 'this CV'}</strong>? This cannot be undone.
        </p>
        {linkedApps > 0 && (
          <p className="asm-dialog-body asm-dialog-warning">
            This CV is linked to {linkedApps} application{linkedApps !== 1 ? 's' : ''}.
            Deleting it will remove the link — the application record will remain but without a CV attached.
          </p>
        )}
        <div className="asm-dialog-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NavGuardDialog ────────────────────────────────────────────────────────────

function NavGuardDialog({ onSaveAndLeave, onDiscard, onStay }) {
  const ref = useRef(null);
  useFocusTrap(true, ref);
  return (
    <div className="asm-dialog-overlay" onKeyDown={e => e.key === 'Escape' && onStay()}>
      <div className="asm-dialog" role="alertdialog" aria-modal="true"
           aria-labelledby="nav-guard-title" ref={ref}>
        <h2 className="asm-dialog-title" id="nav-guard-title">Unsaved changes</h2>
        <p className="asm-dialog-body">
          You have changes that haven't been saved yet. What would you like to do?
        </p>
        <div className="asm-dialog-actions">
          <button className="btn btn-ghost btn-sm"  onClick={onStay}>Stay</button>
          <button className="btn btn-danger btn-sm" onClick={onDiscard}>Discard changes</button>
          <button className="btn btn-primary btn-sm" onClick={onSaveAndLeave}>Save and leave</button>
        </div>
      </div>
    </div>
  );
}
