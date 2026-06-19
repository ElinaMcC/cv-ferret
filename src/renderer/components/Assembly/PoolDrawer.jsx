import { useState, useEffect, useRef, useMemo } from 'react';
import {
  XMarkIcon, ArrowPathIcon, MagnifyingGlassIcon,
  ChevronDownIcon, ChevronRightIcon,
  PencilIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import { usePoolStore } from '../../stores/poolStore.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { taskAPI } from '../../services/ipc.js';

// ── PoolDrawer ────────────────────────────────────────────────────────────────
// Slides in from the left, overlaying the editor.
// The editorRef prop gives access to insertTask / removeTask / changeTaskVersion
// on the AssemblyEditor imperative handle.

export default function PoolDrawer({ editorRef }) {
  const {
    drawerOpen, jobs, loadingJobs, insertedVersionMap, activeTaskItem, filterState,
    loadJobs, toggleDrawer, setFilterState,
  } = usePoolStore();

  const { showToast } = useToast();

  const [drawerWidth, setDrawerWidth]   = useState(420);
  const resizingRef   = useRef(false);
  const startXRef     = useRef(0);
  const startWidthRef = useRef(420);
  const activeRowRef  = useRef(null);

  // Fetch pool data the first time the drawer opens; clear search when it closes.
  useEffect(() => {
    if (drawerOpen && jobs.length === 0 && !loadingJobs) {
      loadJobs();
    }
    if (!drawerOpen) {
      setFilterState({ query: '' });
    }
  }, [drawerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll the drawer to show the active task whenever the cursor moves into a bullet.
  useEffect(() => {
    if (activeTaskItem && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTaskItem?.taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter jobs/tasks by the search query.
  const filteredJobs = useMemo(() => {
    const q = filterState.query.toLowerCase().trim();
    if (!q) return jobs;
    return jobs.flatMap(job => {
      const jobMatches =
        job.job_title.toLowerCase().includes(q) ||
        job.employer.toLowerCase().includes(q);
      const matchedTasks = (job.tasks || []).filter(task =>
        jobMatches || task.versions.some(v => v.description.toLowerCase().includes(q))
      );
      return matchedTasks.length ? [{ ...job, tasks: matchedTasks }] : [];
    });
  }, [jobs, filterState.query]);

  // ── Resize drag ─────────────────────────────────────────────────────────────

  function handleResizeStart(e) {
    e.preventDefault();
    resizingRef.current   = true;
    startXRef.current     = e.clientX;
    startWidthRef.current = drawerWidth;

    function onMove(ev) {
      if (!resizingRef.current) return;
      const w = Math.max(280, Math.min(680, startWidthRef.current + (ev.clientX - startXRef.current)));
      setDrawerWidth(w);
    }
    function onUp() {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── Task toggle / version change ────────────────────────────────────────────

  function handleToggleTask(task, job, versionForInsert) {
    const isInDoc = Object.prototype.hasOwnProperty.call(insertedVersionMap, String(task.id));
    if (isInDoc) {
      const ok = editorRef.current?.removeTask(String(task.id));
      if (ok === false) showToast('Task not found in document', 'error');
    } else {
      const ok = editorRef.current?.insertTask(task, job, versionForInsert);
      if (ok === false) {
        showToast(`No "${job.job_title}" section found in the document`, 'error');
      }
    }
  }

  function handleVersionChange(task, newVersionId) {
    const newVersion = task.versions.find(v => String(v.id) === String(newVersionId));
    if (!newVersion) return;
    const ok = editorRef.current?.changeTaskVersion(String(task.id), newVersion);
    if (ok === false) showToast('Could not change version', 'error');
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className={`pool-drawer${drawerOpen ? ' open' : ''}`}
        style={{ width: `${drawerWidth}px` }}
        aria-label="Task pool"
        aria-hidden={!drawerOpen}
      >
        {/* Header */}
        <div className="pool-drawer-header">
          <span className="pool-drawer-title">Task Pool</span>
          <div className="pool-drawer-header-actions">
            <button
              className="icon-btn"
              onClick={loadJobs}
              title="Refresh pool"
              aria-label="Refresh pool"
              disabled={loadingJobs}
            >
              <ArrowPathIcon className={`pool-icon${loadingJobs ? ' spinning' : ''}`} />
            </button>
            <button
              className="icon-btn"
              onClick={toggleDrawer}
              title="Close"
              aria-label="Close pool drawer"
            >
              <XMarkIcon className="pool-icon" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="pool-search-bar">
          <MagnifyingGlassIcon className="pool-search-icon" />
          <input
            className="pool-search-input"
            type="text"
            placeholder="Search tasks…"
            value={filterState.query}
            onChange={e => setFilterState({ query: e.target.value })}
          />
          {filterState.query && (
            <button
              className="pool-search-clear"
              onClick={() => setFilterState({ query: '' })}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="pool-drawer-body">
          {!loadingJobs && jobs.length > 0 && (
            <p className="pool-drawer-usage-hint">
              Tick a task to insert it into your CV. Untick to remove.
            </p>
          )}
          {loadingJobs && <p className="pool-status-msg">Loading…</p>}
          {!loadingJobs && filteredJobs.length === 0 && (
            <p className="pool-status-msg">
              {filterState.query ? 'No tasks match.' : 'No tasks in pool.'}
            </p>
          )}
          {filteredJobs.map(job => (
            <JobSection
              key={job.id}
              job={job}
              insertedVersionMap={insertedVersionMap}
              activeTaskItem={activeTaskItem}
              activeRowRef={activeRowRef}
              onToggleTask={handleToggleTask}
              onVersionChange={handleVersionChange}
            />
          ))}

          {!loadingJobs && jobs.length > 0 && (
            <p className="pool-drawer-tip">
              For AI generation, bulk edits, and reordering, use the Experience Pool page —
              you can open it in a separate browser tab while Assembly stays open here.
            </p>
          )}
        </div>
      </div>

      {/* Resize handle — overlaps the editor at the right edge of the drawer */}
      {drawerOpen && (
        <div
          className="pool-resize-handle"
          style={{ left: `${drawerWidth}px` }}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      )}
    </>
  );
}

// ── JobSection ────────────────────────────────────────────────────────────────

function JobSection({ job, insertedVersionMap, activeTaskItem, activeRowRef, onToggleTask, onVersionChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const tasks = job.tasks || [];
  const inDocCount = tasks.filter(t =>
    Object.prototype.hasOwnProperty.call(insertedVersionMap, String(t.id))
  ).length;

  return (
    <div className="pool-job-section">
      <button
        className="pool-job-header"
        onClick={() => setCollapsed(c => !c)}
        type="button"
        aria-expanded={!collapsed}
      >
        <span className="pool-job-chevron" aria-hidden="true">
          {collapsed
            ? <ChevronRightIcon className="pool-chevron-icon" />
            : <ChevronDownIcon  className="pool-chevron-icon" />}
        </span>
        <span className="pool-job-info">
          <span className="pool-job-title">{job.job_title}</span>
          <span className="pool-job-employer">{job.employer}</span>
        </span>
        {inDocCount > 0 && (
          <span className="pool-job-badge" title={`${inDocCount} of ${tasks.length} tasks in document`}>
            {inDocCount}/{tasks.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="pool-job-tasks">
          {tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              job={job}
              insertedVersionMap={insertedVersionMap}
              activeTaskItem={activeTaskItem}
              activeRowRef={activeRowRef}
              onToggle={(versionForInsert) => onToggleTask(task, job, versionForInsert)}
              onVersionChange={(vid) => onVersionChange(task, vid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────

function TaskRow({ task, insertedVersionMap, activeTaskItem, activeRowRef, onToggle, onVersionChange }) {
  const { loadJobs } = usePoolStore();
  const { showToast } = useToast();

  const taskIdStr      = String(task.id);
  const isInDoc        = Object.prototype.hasOwnProperty.call(insertedVersionMap, taskIdStr);
  const isActive       = Boolean(activeTaskItem && String(activeTaskItem.taskId) === taskIdStr);
  const defaultVersion = task.versions.find(v => v.is_default) || task.versions[0];
  const docVersionId   = isInDoc ? insertedVersionMap[taskIdStr] : null;

  const [draftVersionId,   setDraftVersionId]   = useState(String(defaultVersion?.id ?? ''));
  const [versionsOpen,     setVersionsOpen]      = useState(false);
  const [savingVersion,    setSavingVersion]     = useState(false);
  // Pool edit/delete state
  const [editingVersionId, setEditingVersionId]  = useState(null); // String(versionId) | null
  const [editText,         setEditText]          = useState('');
  const [confirmDeleteId,  setConfirmDeleteId]   = useState(null); // String(versionId) | 'task' | null
  const [busy,             setBusy]              = useState(false);

  const displayVersionId = isInDoc ? String(docVersionId ?? '') : draftVersionId;
  const displayVersion   = task.versions.find(v => String(v.id) === displayVersionId) || defaultVersion;

  const currentDocText = isActive && isInDoc ? activeTaskItem.currentText : null;
  const textIsModified = currentDocText !== null &&
                         currentDocText.trim() !== (displayVersion?.description ?? '').trim();

  // ── Version selection ──────────────────────────────────────────────────────

  function handleVersionSelect(versionId) {
    if (isInDoc) onVersionChange(versionId);
    else setDraftVersionId(versionId);
    setVersionsOpen(false);
  }

  // ── Save as new version (from edited document bullet) ─────────────────────

  async function handleSaveAsNewVersion() {
    if (!currentDocText || savingVersion) return;
    setSavingVersion(true);
    try {
      await taskAPI.createTaskVersion(task.id, currentDocText.trim(), [], []);
      await loadJobs();
      showToast('Saved as new version');
    } catch (err) {
      showToast('Failed to save version: ' + err.message, 'error');
    } finally {
      setSavingVersion(false);
    }
  }

  // ── Pool edit ──────────────────────────────────────────────────────────────

  function startEdit(version) {
    setEditingVersionId(String(version.id));
    setEditText(version.description);
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingVersionId(null);
    setEditText('');
  }

  async function handleSaveEdit(version) {
    if (!editText.trim() || busy) return;
    setBusy(true);
    try {
      await taskAPI.updateTaskVersion(
        version.id, editText.trim(),
        version.tags || [], version.role_priorities || [],
      );
      await loadJobs();
      setEditingVersionId(null);
      setEditText('');
      showToast('Saved to pool');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // ── Pool delete ────────────────────────────────────────────────────────────

  async function handleDeleteVersion(versionId) {
    if (busy) return;
    setBusy(true);
    try {
      await taskAPI.deleteTaskVersion(versionId);
      await loadJobs();
      setConfirmDeleteId(null);
      showToast('Version deleted from pool');
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTask() {
    if (busy) return;
    setBusy(true);
    try {
      await taskAPI.deleteTask(task.id);
      await loadJobs();
      setConfirmDeleteId(null);
      showToast('Task deleted from pool');
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`pool-task-row${isInDoc ? ' in-doc' : ''}${isActive ? ' active' : ''}`}
      ref={isActive ? activeRowRef : null}
    >
      <input
        type="checkbox"
        className="pool-task-checkbox"
        checked={isInDoc}
        onChange={() => {
          if (isInDoc) onToggle(null);
          else {
            const v = task.versions.find(v2 => String(v2.id) === draftVersionId) || defaultVersion;
            onToggle(v);
          }
        }}
        title={isInDoc ? 'Remove from document' : 'Add to document'}
        aria-label={displayVersion?.description}
      />

      <div className="pool-task-body">

        {/* ── Single-version task: text + hover action icons ── */}
        {task.versions.length === 1 ? (
          <>
            <div className="pool-task-single-header">
              <p className="pool-task-text">{displayVersion?.description ?? '(no description)'}</p>
              {!editingVersionId && confirmDeleteId !== 'task' && (
                <div className="pool-version-actions">
                  <button className="pool-action-btn" type="button"
                          onClick={() => startEdit(defaultVersion)} title="Edit in pool"
                          aria-label="Edit in pool">
                    <PencilIcon className="pool-action-icon" />
                  </button>
                  <button className="pool-action-btn pool-action-btn-danger" type="button"
                          onClick={() => setConfirmDeleteId('task')} title="Delete task"
                          aria-label="Delete task">
                    <TrashIcon className="pool-action-icon" />
                  </button>
                </div>
              )}
            </div>
            {editingVersionId && (
              <PoolInlineEdit
                text={editText}
                onChange={setEditText}
                onSave={() => handleSaveEdit(defaultVersion)}
                onCancel={cancelEdit}
                busy={busy}
              />
            )}
            {confirmDeleteId === 'task' && (
              <PoolDeleteConfirm
                message="Delete this task from the pool?"
                onConfirm={handleDeleteTask}
                onCancel={() => setConfirmDeleteId(null)}
                busy={busy}
              />
            )}
          </>
        ) : (
          <p className="pool-task-text">{displayVersion?.description ?? '(no description)'}</p>
        )}

        {/* ── Multi-version task: picker with per-version edit / delete ── */}
        {task.versions.length > 1 && (
          <div className="pool-version-picker">
            <button
              className="pool-versions-toggle"
              onClick={() => setVersionsOpen(o => !o)}
              type="button"
              aria-expanded={versionsOpen}
            >
              {versionsOpen
                ? <ChevronDownIcon  className="pool-toggle-icon" />
                : <ChevronRightIcon className="pool-toggle-icon" />}
              {task.versions.length} versions
            </button>

            {versionsOpen && (
              <div className="pool-versions-list">
                {task.versions.map(v => {
                  const vIdStr        = String(v.id);
                  const isCurrent     = vIdStr === displayVersionId;
                  const hasRoles      = v.role_priorities?.length > 0;
                  const isEditingThis = editingVersionId === vIdStr;
                  const isConfirming  = confirmDeleteId  === vIdStr;
                  return (
                    <div key={v.id} className={`pool-version-item${isCurrent ? ' current' : ''}`}>

                      {/* Tags row + action icons */}
                      <div className="pool-version-item-header">
                        <div className="pool-version-tags">
                          {hasRoles
                            ? v.role_priorities.map(rp => (
                                <span key={rp.role} className="pool-version-tag">{rp.role} #{rp.rank}</span>
                              ))
                            : <span className="pool-version-tag pool-version-tag-default">Default</span>
                          }
                          {isCurrent && (
                            <span className="pool-version-tag pool-version-tag-in-use">
                              {isInDoc ? 'in document' : 'selected'}
                            </span>
                          )}
                        </div>
                        <div className="pool-version-actions">
                          <button className="pool-action-btn" type="button"
                                  onClick={() => startEdit(v)} title="Edit in pool"
                                  aria-label="Edit in pool" disabled={busy}>
                            <PencilIcon className="pool-action-icon" />
                          </button>
                          <button className="pool-action-btn pool-action-btn-danger" type="button"
                                  onClick={() => { setConfirmDeleteId(vIdStr); setEditingVersionId(null); }}
                                  title="Delete version" aria-label="Delete version" disabled={busy}>
                            <TrashIcon className="pool-action-icon" />
                          </button>
                        </div>
                      </div>

                      {/* Content: edit form | delete confirm | selectable description */}
                      {isEditingThis ? (
                        <PoolInlineEdit
                          text={editText}
                          onChange={setEditText}
                          onSave={() => handleSaveEdit(v)}
                          onCancel={cancelEdit}
                          busy={busy}
                        />
                      ) : isConfirming ? (
                        <PoolDeleteConfirm
                          message="Delete this version from the pool?"
                          onConfirm={() => handleDeleteVersion(v.id)}
                          onCancel={() => setConfirmDeleteId(null)}
                          busy={busy}
                        />
                      ) : (
                        <button className="pool-version-text-btn" type="button"
                                onClick={() => handleVersionSelect(vIdStr)}>
                          <p className="pool-version-text">{v.description}</p>
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Delete entire task at foot of expanded list */}
                {confirmDeleteId === 'task' ? (
                  <PoolDeleteConfirm
                    message={`Delete this task and all ${task.versions.length} versions from the pool?`}
                    onConfirm={handleDeleteTask}
                    onCancel={() => setConfirmDeleteId(null)}
                    busy={busy}
                    className="pool-delete-task-confirm"
                  />
                ) : (
                  <button className="pool-delete-task-btn" type="button"
                          onClick={() => { setConfirmDeleteId('task'); setEditingVersionId(null); }}>
                    <TrashIcon className="pool-action-icon" /> Delete task
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Save-as-new-version panel — cursor in modified bullet */}
        {textIsModified && (
          <div className="pool-edit-panel">
            <span className="pool-edit-label">Edited in document:</span>
            <p className="pool-edit-text">{currentDocText}</p>
            <button className="btn btn-primary btn-sm pool-save-btn" type="button"
                    onClick={handleSaveAsNewVersion} disabled={savingVersion}>
              {savingVersion ? 'Saving…' : 'Save as new version'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared inline sub-components ─────────────────────────────────────────────

function PoolInlineEdit({ text, onChange, onSave, onCancel, busy }) {
  return (
    <div className="pool-inline-edit">
      <textarea
        className="pool-inline-edit-textarea"
        value={text}
        onChange={e => onChange(e.target.value)}
        rows={3}
        autoFocus
      />
      <div className="pool-inline-edit-actions">
        <button className="btn btn-primary btn-sm" type="button"
                onClick={onSave} disabled={busy || !text.trim()}>
          {busy ? 'Saving…' : 'Save to Pool'}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PoolDeleteConfirm({ message, onConfirm, onCancel, busy, className = '' }) {
  return (
    <div className={`pool-delete-confirm${className ? ' ' + className : ''}`}>
      <span className="pool-delete-confirm-text">{message}</span>
      <div className="pool-delete-confirm-actions">
        <button className="btn btn-danger btn-sm" type="button"
                onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
