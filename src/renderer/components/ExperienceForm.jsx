import { useState, useEffect } from 'react';
import { taskAPI } from '../services/ipc';
import { Icon } from '../utils/icons';
import InfoTip from './InfoTip';
import './ExperienceForm.css';

export default function ExperienceForm({ formMode, selectedJob, targetTaskId, editingJob, editingVersion, existingVersions = [], onSave, onCancel }) {
  const baseVersion = formMode === 'add-version' && existingVersions.length > 0
    ? (existingVersions.find(v => v.is_default) || existingVersions[0])
    : null;

  const [jobs, setJobs] = useState([]);
  const [formData, setFormData] = useState({
    jobId: selectedJob?.id || '',
    employer: editingJob?.employer || selectedJob?.employer || '',
    jobTitle: editingJob?.job_title || selectedJob?.job_title || '',
    startDate: editingJob?.start_date || selectedJob?.start_date || '',
    endDate: editingJob?.end_date || selectedJob?.end_date || '',
    location: editingJob?.location || selectedJob?.location || '',
    notes: editingJob?.notes || selectedJob?.notes || '',
    description: editingVersion?.description || baseVersion?.description || '',
    tags: editingVersion?.tags || [],
    rolePriorities: editingVersion?.role_priorities || [],
  });
  const [selectedBaseId, setSelectedBaseId] = useState(baseVersion?.id ?? null);

  const [allTags, setAllTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [allRoles, setAllRoles] = useState([]);
  const [roleInput, setRoleInput] = useState('');
  const [rankInput, setRankInput] = useState('');
  const [showJobForm, setShowJobForm] = useState(!selectedJob && formMode === 'new-task');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      if (formMode === 'new-task' || formMode === 'edit-job') {
        const jobsData = await taskAPI.getAllJobs();
        setJobs(jobsData);
      }

      const tags = await taskAPI.getAllTags();
      setAllTags(tags);
      const roles = await taskAPI.getAllRoles();
      setAllRoles(roles);
    } catch (err) {
      setError(err.message);
    }
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setTagInput('');
    }
  }

  function removeTag(tag) {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  }

  function addRolePriority() {
    const role = roleInput.trim().toLowerCase();
    const rank = parseInt(rankInput);
    if (!role || isNaN(rank) || rank < 1) return;
    if (formData.rolePriorities.some(rp => rp.role === role)) return;
    setFormData(prev => ({
      ...prev,
      rolePriorities: [...prev.rolePriorities, { role, rank }],
    }));
    setRoleInput('');
    setRankInput('');
  }

  function handleBaseVersionChange(versionId) {
    const version = existingVersions.find(v => v.id === versionId);
    setSelectedBaseId(versionId);
    if (version) setFormData(prev => ({ ...prev, description: version.description }));
  }

  function removeRolePriority(role) {
    setFormData(prev => ({
      ...prev,
      rolePriorities: prev.rolePriorities.filter(rp => rp.role !== role),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { employer, jobTitle, startDate, endDate, location, notes, description, tags, rolePriorities, jobId } = formData;

      if (formMode === 'edit-job') {
        // Edit job
        if (!employer.trim() || !jobTitle.trim()) {
          setError('Employer and job title are required');
          setLoading(false);
          return;
        }
        await taskAPI.updateJob(editingJob.id, employer, jobTitle, startDate, endDate, location, notes);
      } else if (formMode === 'new-task') {
        // Create new task + first version
        if (!description.trim()) {
          setError('Description is required');
          setLoading(false);
          return;
        }

        let finalJobId = jobId;
        if (showJobForm) {
          // Creating a new job
          if (!employer.trim() || !jobTitle.trim()) {
            setError('Employer and job title are required');
            setLoading(false);
            return;
          }
          const newJob = await taskAPI.createJob(employer, jobTitle, startDate, endDate, location, notes);
          finalJobId = newJob.id;
        }

        if (!finalJobId) {
          setError('Select or create a job');
          setLoading(false);
          return;
        }

        await taskAPI.createTaskWithVersion(finalJobId, description, tags, rolePriorities);
      } else if (formMode === 'add-version') {
        // Add version to existing task
        if (!description.trim()) {
          setError('Description is required');
          setLoading(false);
          return;
        }
        await taskAPI.createTaskVersion(targetTaskId, description, tags, rolePriorities);
      } else if (formMode === 'edit-version') {
        // Edit existing version
        if (!description.trim()) {
          setError('Description is required');
          setLoading(false);
          return;
        }
        await taskAPI.updateTaskVersion(editingVersion.id, description, tags, rolePriorities);
      }

      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredTags = allTags.filter(tag =>
    tag.includes(tagInput.toLowerCase()) && !formData.tags.includes(tag)
  );

  const filteredRoles = allRoles.filter(role =>
    role.includes(roleInput.toLowerCase()) && !formData.rolePriorities.some(rp => rp.role === role)
  );

  const formTitle = {
    'new-task': 'Add New Task',
    'add-version': 'Add Alternative Wording',
    'edit-version': 'Edit Version',
    'edit-job': 'Edit Job',
  }[formMode];

  return (
    <div className="experience-form-container">
      <div className="form-header">
        <h2>{formTitle}</h2>
        <button className="btn btn-secondary btn-with-icon" onClick={onCancel}>
          <Icon.Back className="icon" />
          Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="experience-form">
        {error && <div className="error-message">{error}</div>}

        {/* Job section - only shown for 'new-task' and 'edit-job' modes */}
        {(formMode === 'new-task' || formMode === 'edit-job') && (showJobForm || formMode === 'edit-job') && (
            <fieldset className="form-section">
              <legend>Job Details</legend>
              <div className="form-group">
                <label>Employer *</label>
                <input
                  type="text"
                  value={formData.employer}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, employer: e.target.value }))
                  }
                  placeholder="Company name"
                />
              </div>

              <div className="form-group">
                <label>Job Title *</label>
                <input
                  type="text"
                  value={formData.jobTitle}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, jobTitle: e.target.value }))
                  }
                  placeholder="E.g., Software Engineer"
                />
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="e.g. Vienna, Austria"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Optional context about this role"
                  rows="2"
                />
              </div>

              {formMode === 'new-task' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowJobForm(false)}
                >
                  Use Existing Job
                </button>
              )}
            </fieldset>
        )}

        {(formMode === 'new-task' && !showJobForm) && (
          <fieldset className="form-section">
            <legend>Select Job</legend>
            <div className="form-group">
              <label>Job *</label>
              <select
                value={formData.jobId}
                onChange={(e) => {
                  const job = jobs.find(j => j.id === parseInt(e.target.value));
                  if (job) {
                    setFormData(prev => ({
                      ...prev,
                      jobId: job.id,
                      employer: job.employer,
                      jobTitle: job.job_title,
                    }));
                  }
                }}
              >
                <option value="">Select a job...</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.job_title} @ {job.employer}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowJobForm(true)}
            >
              Create New Job
            </button>
          </fieldset>
        )}

        {/* Description section - only for 'new-task', 'add-version', 'edit-version' modes */}
        {(formMode === 'new-task' || formMode === 'add-version' || formMode === 'edit-version') && (
          <fieldset className="form-section">
            <legend>
              {formMode === 'edit-version' ? 'Version Details' : 'Task Description'}
            </legend>

            {formMode === 'add-version' && selectedJob && (
              <div className="form-context">
                <p><strong>Job:</strong> {selectedJob.job_title} @ {selectedJob.employer}</p>
              </div>
            )}

            {formMode === 'add-version' && existingVersions.length > 1 && (
              <div className="form-group">
                <label>Base this version on</label>
                <select
                  value={selectedBaseId ?? ''}
                  onChange={e => handleBaseVersionChange(parseInt(e.target.value))}
                >
                  {existingVersions.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.is_default ? '● Default' : '○ Alt'}: {v.description.length > 80 ? v.description.slice(0, 80) + '…' : v.description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, description: e.target.value }))
                }
                placeholder="Describe the task or accomplishment..."
                rows="4"
              />
            </div>

            <div className="form-group">
              <label>Tags</label>
              <div className="tag-input-container">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Type a tag and press Enter or select from below"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addTag}
                >
                  Add Tag
                </button>
              </div>

              {filteredTags.length > 0 && (
                <div className="tag-suggestions">
                  {filteredTags.slice(0, 5).map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className="tag-suggestion"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          tags: [...prev.tags, tag],
                        }));
                        setTagInput('');
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {formData.tags.length > 0 && (
                <div className="tags">
                  {formData.tags.map(tag => (
                    <span key={tag} className="tag tag-removable">
                      {tag}
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() => removeTag(tag)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>
                Role Priorities
                <InfoTip text="Tag this version with a role (e.g. 'engineering', 'management') and a rank from 1 to 5, where 1 means this task is most central to that role. The Filter mode in CV Assembly uses these to narrow down tasks relevant to a specific role." />
              </label>
              <div className="role-priority-input-row">
                <div className="role-priority-field">
                  <span className="field-sub-label">Role</span>
                  <input
                    type="text"
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRolePriority(); } }}
                    placeholder="e.g. engineering"
                    autoComplete="off"
                  />
                </div>
                <div className="role-priority-field rank-field">
                  <span className="field-sub-label">Rank</span>
                  <input
                    type="number"
                    value={rankInput}
                    onChange={(e) => setRankInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRolePriority(); } }}
                    placeholder="1"
                    min="1"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm role-priority-add-btn"
                  onClick={addRolePriority}
                >
                  Add
                </button>
              </div>

              {filteredRoles.length > 0 && roleInput && (
                <div className="tag-suggestions">
                  {filteredRoles.slice(0, 5).map(role => (
                    <button
                      key={role}
                      type="button"
                      className="tag-suggestion"
                      onClick={() => setRoleInput(role)}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              )}

              {formData.rolePriorities.length > 0 && (
                <div className="tags">
                  {formData.rolePriorities.map(rp => (
                    <span key={rp.role} className="tag tag-removable role-priority-tag">
                      {rp.role} <span className="role-rank">#{rp.rank}</span>
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() => removeRolePriority(rp.role)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        )}

        <div className="form-actions">
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : formMode === 'edit-job' ? 'Save Job' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
