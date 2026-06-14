import { useState, useEffect, useRef } from 'react';
import { taskAPI, generationAPI } from '../services/ipc';
import { useToast } from '../contexts/ToastContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import ExperienceForm from './ExperienceForm';
import ConfirmDialog from './ConfirmDialog';
import { Icon } from '../utils/icons';
import './ExperiencePool.css';

export default function ExperiencePool({ onNavigate }) {
  const { aiEnabled } = useAppSettings();
  const [jobs, setJobs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [formMode, setFormMode] = useState(null); // 'new-task' | 'add-version' | 'edit-version' | 'edit-job'
  const [selectedJob, setSelectedJob] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [editingVersion, setEditingVersion] = useState(null);
  const [targetTaskId, setTargetTaskId] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const [pendingVersions, setPendingVersions] = useState({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type:'task'|'version', id, label }
  const [generateConfirm, setGenerateConfirm] = useState(null); // { count } | null
  const savedScroll = useRef(0);
  const showToast = useToast();

  useEffect(() => {
    loadJobs();
  }, []);

  function saveScroll() {
    const el = document.querySelector('.content');
    savedScroll.current = el ? el.scrollTop : 0;
  }

  function restoreScroll() {
    setTimeout(() => {
      const el = document.querySelector('.content');
      if (el) el.scrollTop = savedScroll.current;
    }, 0);
  }

  async function loadJobs(restoreAfter = false) {
    try {
      setLoading(true);
      const jobsWithTasks = await taskAPI.getAllJobsWithTasks();

      jobsWithTasks.sort((a, b) => {
        if (!a.end_date && !b.end_date) return 0;
        if (!a.end_date) return -1;
        if (!b.end_date) return 1;
        return b.end_date.localeCompare(a.end_date);
      });

      setJobs(jobsWithTasks);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (restoreAfter) restoreScroll();
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      loadJobs();
      return;
    }

    try {
      setLoading(true);
      const results = await taskAPI.searchTasks(searchQuery);

      // Group by job, then by task
      const jobsMap = new Map();
      results.forEach(version => {
        if (!jobsMap.has(version.job_id)) {
          jobsMap.set(version.job_id, {
            id: version.job_id,
            employer: version.employer,
            job_title: version.job_title,
            tasks: [],
          });
        }

        const jobTasks = jobsMap.get(version.job_id).tasks;
        let task = jobTasks.find(t => t.id === version.task_id);
        if (!task) {
          task = {
            id: version.task_id,
            job_id: version.job_id,
            created_at: version.created_at,
            versions: [],
          };
          jobTasks.push(task);
        }
        task.versions.push(version);
      });

      setJobs(Array.from(jobsMap.values()));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTask(taskId, description) {
    setConfirmDelete({ type: 'task', id: taskId, label: description || 'this task' });
  }

  async function handleDeleteVersion(versionId, description) {
    setConfirmDelete({ type: 'version', id: versionId, label: description || 'this version' });
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'task') {
        await taskAPI.deleteTask(confirmDelete.id);
      } else {
        await taskAPI.deleteTaskVersion(confirmDelete.id);
      }
      setConfirmDelete(null);
      loadJobs();
      showToast('Deleted.');
    } catch (err) {
      setError(err.message);
      setConfirmDelete(null);
    }
  }

  async function handleSetDefault(versionId) {
    try {
      await taskAPI.setDefaultVersion(versionId);
      loadJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleToggleExpand(taskId) {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  }

  async function handleDragStart(e, taskId) {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e, targetTaskId, jobId) {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      setDraggedTaskId(null);
      return;
    }

    const job = jobs.find(j => j.id === jobId);
    if (!job || !job.tasks) return;

    const taskIds = job.tasks.map(t => t.id);
    const draggedIndex = taskIds.indexOf(draggedTaskId);
    const targetIndex = taskIds.indexOf(targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder array
    const newTaskIds = [...taskIds];
    newTaskIds.splice(draggedIndex, 1);
    newTaskIds.splice(targetIndex, 0, draggedTaskId);

    try {
      await taskAPI.reorderTasks(jobId, newTaskIds);
      loadJobs();
    } catch (err) {
      setError(err.message);
    }

    setDraggedTaskId(null);
  }

  async function handleGenerate(task, job) {
    const defaultVersion = task.versions.find(v => v.is_default);
    if (!defaultVersion) return;
    setGeneratingIds(prev => new Set([...prev, task.id]));
    setError('');
    try {
      const result = await generationAPI.generateVersions(
        task.id, defaultVersion.description, job.job_title, defaultVersion.tags || []
      );
      if (result.saved) {
        loadJobs();
      } else {
        setPendingVersions(prev => ({ ...prev, [task.id]: result.versions }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingIds(prev => { const next = new Set(prev); next.delete(task.id); return next; });
    }
  }

  async function handleGenerateAll() {
    const eligible = jobs.reduce((n, j) =>
      n + (j.tasks || []).filter(t => !t.versions.some(v => v.role_priorities && v.role_priorities.length > 0)).length, 0);
    if (eligible === 0) { showToast('All tasks already have role-specific versions.'); return; }
    setGenerateConfirm({ count: eligible });
  }

  async function confirmGenerateAll() {
    setGenerateConfirm(null);
    setBatchResult(null);
    setError('');
    try {
      const result = await generationAPI.generateVersionsBatch();
      setBatchResult(result);
      loadJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBatchRunning(false);
    }
  }

  function updatePendingVersion(taskId, idx, description) {
    setPendingVersions(prev => ({
      ...prev,
      [taskId]: prev[taskId].map((pv, i) => i === idx ? { ...pv, description } : pv),
    }));
  }

  function removePendingVersion(taskId, idx) {
    setPendingVersions(prev => ({
      ...prev,
      [taskId]: prev[taskId].filter((_, i) => i !== idx),
    }));
  }

  function clearPendingVersions(taskId) {
    setPendingVersions(prev => { const next = { ...prev }; delete next[taskId]; return next; });
  }

  async function savePendingVersions(taskId) {
    const versions = pendingVersions[taskId];
    if (!versions || versions.length === 0) { clearPendingVersions(taskId); return; }
    try {
      for (const v of versions) {
        await taskAPI.createTaskVersion(taskId, v.description, [], [{ role: v.role, rank: v.rank }]);
      }
      clearPendingVersions(taskId);
      loadJobs();
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (formMode) {
    const targetTask = formMode === 'add-version' && targetTaskId
      ? jobs.flatMap(j => j.tasks || []).find(t => t.id === targetTaskId)
      : null;

    return (
      <ExperienceForm
        formMode={formMode}
        selectedJob={selectedJob}
        targetTaskId={targetTaskId}
        editingJob={editingJob}
        editingVersion={editingVersion}
        existingVersions={targetTask?.versions || []}
        onSave={() => {
          setFormMode(null);
          setSelectedJob(null);
          setEditingJob(null);
          setEditingVersion(null);
          setTargetTaskId(null);
          loadJobs(true);
          showToast('Saved.');
        }}
        onCancel={() => {
          setFormMode(null);
          setSelectedJob(null);
          setEditingJob(null);
          setEditingVersion(null);
          setTargetTaskId(null);
          restoreScroll();
        }}
      />
    );
  }

  return (
    <>
    <div className="experience-pool">
      <div className="experience-header">
        <h2>Experience Pool</h2>
        <div className="header-actions">
          {aiEnabled && (
            <button
              className="btn btn-secondary btn-with-icon"
              onClick={handleGenerateAll}
              disabled={batchRunning}
            >
              <Icon.Sparkles className="icon" />
              {batchRunning ? 'Generating…' : 'Generate All'}
            </button>
          )}
          <button
            className="btn btn-secondary btn-with-icon"
            onClick={() => onNavigate('import')}
          >
            <Icon.Import className="icon" />
            Import →
          </button>
          <button
            className="btn btn-primary btn-with-icon"
            onClick={() => {
              saveScroll();
              setFormMode('new-task');
              setSelectedJob(null);
            }}
          >
            <Icon.Add className="icon" />
            Add New Task
          </button>
        </div>
      </div>

      <p className="page-subtitle">Your complete work history — all jobs and duties, unfiltered. Each task can have <strong>multiple versions</strong>: alternate wordings for different roles or audiences. Use the <strong>+</strong> button on any task to add one. CV Assembly lets you pick and combine them into a targeted CV.</p>

      {aiEnabled && batchResult && (
        <div className="batch-result">
          <span>
            Generated versions for <strong>{batchResult.processed}</strong> task{batchResult.processed !== 1 ? 's' : ''}.
            {batchResult.skipped > 0 && ` ${batchResult.skipped} skipped (already had role-specific versions).`}
            {batchResult.errors.length > 0 && ` ${batchResult.errors.length} failed — check the error log.`}
          </span>
          <button onClick={() => setBatchResult(null)}>×</button>
        </div>
      )}

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by employer, job title, description, or tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
        />
        <button className="btn btn-secondary" onClick={handleSearch}>
          Search
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {loading && <div className="loading">Loading...</div>}

      {!loading && jobs.length === 0 && (
        <div className="empty-state">No jobs found. Add your first task!</div>
      )}

      {!loading && jobs.map((job) => (
        <div key={job.id} className="job-card">
          <div className="job-header">
            <div>
              <h3>{job.job_title}</h3>
              <p className="employer">{job.employer}</p>
              <p className="dates">
                {job.start_date} {job.end_date && `— ${job.end_date}`}
                {job.location && ` · ${job.location}`}
              </p>
            </div>
            <div className="job-actions">
              <button
                className="icon-btn"
                onClick={() => {
                  saveScroll();
                  setFormMode('edit-job');
                  setEditingJob(job);
                }}
                title="Edit job details"
                aria-label="Edit job details"
              >
                <Icon.Edit className="icon" />
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  saveScroll();
                  setFormMode('new-task');
                  setSelectedJob(job);
                }}
                title="Add task to this job"
                aria-label="Add task to this job"
              >
                <Icon.Add className="icon" />
              </button>
            </div>
          </div>

          <div className="tasks-list">
            {job.tasks && job.tasks.length > 0 ? (
              job.tasks.map((task, taskIndex) => {
                const defaultVersion = task.versions.find(v => v.is_default);
                const isExpanded = expandedTasks.has(task.id);
                const hasMultipleVersions = task.versions.length > 1;
                const isLastTask = taskIndex === job.tasks.length - 1;

                return (
                  <div key={task.id} className={`task-row ${draggedTaskId === task.id ? 'dragging' : ''}`}>
                    <div
                      className="task-drag-handle"
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, task.id, job.id)}
                      title="Drag to reorder"
                    >
                      <Icon.DragHandle className="icon" />
                    </div>

                    <div className="task-content">
                      {defaultVersion && (
                        <p className="task-description">{defaultVersion.description}</p>
                      )}
                      {defaultVersion && defaultVersion.tags && defaultVersion.tags.length > 0 && (
                        <div className="tags">
                          {defaultVersion.tags.map((tag) => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      )}
                      {defaultVersion && defaultVersion.role_priorities && defaultVersion.role_priorities.length > 0 && (
                        <div className="role-priorities">
                          {defaultVersion.role_priorities.map((rp) => (
                            <span key={rp.role} className="role-priority-badge">
                              {rp.role} <span className="role-rank">#{rp.rank}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="task-inline-actions">
                      {!hasMultipleVersions && defaultVersion && (
                        <button
                          className="icon-btn"
                          onClick={() => {
                            saveScroll();
                            setFormMode('edit-version');
                            setEditingVersion(defaultVersion);
                          }}
                          title="Edit task"
                          aria-label="Edit task"
                        >
                          <Icon.Edit className="icon" />
                        </button>
                      )}
                      {hasMultipleVersions && (
                        <button
                          className="icon-btn"
                          onClick={() => handleToggleExpand(task.id)}
                          title={isExpanded ? 'Collapse versions' : 'Expand versions'}
                          aria-label={isExpanded ? 'Collapse versions' : 'Expand versions'}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? (
                            <Icon.ChevronDown className="icon" />
                          ) : (
                            <Icon.ChevronRight className="icon" />
                          )}
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        onClick={() => {
                          saveScroll();
                          setFormMode('add-version');
                          setTargetTaskId(task.id);
                        }}
                        title="Add alternative wording"
                        aria-label="Add alternative wording"
                      >
                        <Icon.Add className="icon" />
                      </button>
                      {aiEnabled && defaultVersion && !pendingVersions[task.id] && (
                        <button
                          className={`icon-btn ${generatingIds.has(task.id) ? 'generating' : ''}`}
                          onClick={() => handleGenerate(task, job)}
                          disabled={generatingIds.has(task.id) || batchRunning}
                          title={generatingIds.has(task.id) ? 'Generating…' : 'Generate role-specific versions'}
                          aria-label={generatingIds.has(task.id) ? 'Generating versions…' : 'Generate role-specific versions with AI'}
                        >
                          <Icon.Sparkles className="icon" />
                        </button>
                      )}
                      <button
                        className="icon-btn delete-btn"
                        onClick={() => handleDeleteTask(task.id, defaultVersion?.description)}
                        title="Delete task"
                        aria-label="Delete task"
                      >
                        <Icon.Delete className="icon" />
                      </button>
                    </div>

                    <div className="task-separator" />

                    {pendingVersions[task.id] && (
                      <div className="generation-review">
                        <div className="generation-review-header">
                          <h4>Review generated versions</h4>
                          <span className="generation-review-count">
                            {pendingVersions[task.id].length} version{pendingVersions[task.id].length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="generation-review-list">
                          {pendingVersions[task.id].map((pv, idx) => (
                            <div key={idx} className="pending-version-card">
                              <div className="pending-version-meta">
                                <span className="role-priority-badge">
                                  {pv.role} <span className="role-rank">#{pv.rank}</span>
                                </span>
                                <button
                                  className="icon-btn delete-btn"
                                  onClick={() => removePendingVersion(task.id, idx)}
                                  title="Remove this version"
                                  aria-label="Remove this version"
                                >
                                  <Icon.Delete className="icon" />
                                </button>
                              </div>
                              <textarea
                                className="pending-version-textarea"
                                value={pv.description}
                                onChange={e => updatePendingVersion(task.id, idx, e.target.value)}
                                rows={4}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="generation-review-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => savePendingVersions(task.id)}
                            disabled={pendingVersions[task.id].length === 0}
                          >
                            Save {pendingVersions[task.id].length} version{pendingVersions[task.id].length !== 1 ? 's' : ''}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => clearPendingVersions(task.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {isExpanded && hasMultipleVersions && !pendingVersions[task.id] && (
                      <div className="versions-list">
                        {task.versions.map((version) => (
                          <div key={version.id} className="version-item">
                            <div className="version-header">
                              <span className={`badge ${version.is_default ? 'badge-default' : 'badge-alt'}`}>
                                {version.is_default ? '● DEFAULT' : '○ ALT'}
                              </span>
                              <p className="version-description">{version.description}</p>
                            </div>

                            {version.tags && version.tags.length > 0 && (
                              <div className="tags">
                                {version.tags.map((tag) => (
                                  <span key={tag} className="tag">{tag}</span>
                                ))}
                              </div>
                            )}
                            {version.role_priorities && version.role_priorities.length > 0 && (
                              <div className="role-priorities">
                                {version.role_priorities.map((rp) => (
                                  <span key={rp.role} className="role-priority-badge">
                                    {rp.role} <span className="role-rank">#{rp.rank}</span>
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="version-actions">
                              <button
                                className="icon-btn"
                                onClick={() => {
                                  saveScroll();
                                  setFormMode('edit-version');
                                  setEditingVersion(version);
                                }}
                                title="Edit version"
                                aria-label="Edit version"
                              >
                                <Icon.Edit className="icon" />
                              </button>
                              {!version.is_default && (
                                <button
                                  className="icon-btn"
                                  onClick={() => handleSetDefault(version.id)}
                                  title="Set as default"
                                  aria-label="Set as default version"
                                >
                                  <Icon.SetDefault className="icon" />
                                </button>
                              )}
                              <button
                                className="icon-btn delete-btn"
                                onClick={() => handleDeleteVersion(version.id, version.description)}
                                title="Delete version"
                                aria-label="Delete version"
                              >
                                <Icon.Delete className="icon" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No tasks for this job. Click "Add Task" to create one.</div>
            )}
          </div>
        </div>
      ))}
    </div>

    {confirmDelete && (
      <ConfirmDialog
        title={confirmDelete.type === 'task' ? 'Delete task?' : 'Delete version?'}
        body={confirmDelete.type === 'task'
          ? 'This will delete the task and all its versions. This cannot be undone.'
          : 'This will permanently delete this version.'}
        confirmLabel="Delete"
        onConfirm={confirmDeleteAction}
        onCancel={() => setConfirmDelete(null)}
      />
    )}

    {generateConfirm && (
      <ConfirmDialog
        title={`Generate versions for ${generateConfirm.count} task${generateConfirm.count !== 1 ? 's' : ''}?`}
        body={`This will call the Anthropic API once per task. Depending on your usage it may incur a small cost. Existing role-specific versions won't be affected.`}
        confirmLabel="Generate"
        danger={false}
        onConfirm={confirmGenerateAll}
        onCancel={() => setGenerateConfirm(null)}
      />
    )}
    </>
  );
}
