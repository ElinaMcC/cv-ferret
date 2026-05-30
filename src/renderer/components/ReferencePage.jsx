import { useState, useEffect, useRef } from 'react';
import { referenceAPI, taskAPI } from '../services/ipc';
import { useToast } from '../contexts/ToastContext';
import { Icon } from '../utils/icons';
import './ReferencePage.css';

function ReferenceCard({ reference, jobs, onSave, onDelete }) {
  const [jobId, setJobId] = useState(reference.job_id || '');
  const [tags, setTags] = useState(reference.tags || []);
  const [notes, setNotes] = useState(reference.notes || '');
  const [tagInput, setTagInput] = useState('');
  const showToast = useToast();

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags(prev => [...prev, t]);
    setTagInput('');
  }

  function removeTag(t) { setTags(prev => prev.filter(x => x !== t)); }

  function handleSave() {
    onSave(reference.id, jobId ? parseInt(jobId) : null, tags, notes);
    showToast('Saved.');
  }

  return (
    <div className="reference-card">
      <div className="reference-file-row">
        <a
          href={referenceAPI.fileUrl(reference.id)}
          target="_blank"
          rel="noreferrer"
          className="reference-filename"
          title="Open document"
        >
          <Icon.Check className="icon ref-icon" />
          {reference.file_name}
        </a>
        <button
          className="icon-btn delete-btn"
          onClick={() => onDelete(reference.id, reference.file_name)}
          title="Delete"
        >
          <Icon.Delete className="icon" />
        </button>
      </div>

      <div className="reference-fields">
        <div className="ref-form-group">
          <label>Associated job</label>
          <select value={jobId} onChange={e => setJobId(e.target.value)}>
            <option value="">Not associated</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>
                {j.job_title} — {j.employer}
              </option>
            ))}
          </select>
        </div>

        <div className="ref-form-group">
          <label>Tags</label>
          <div className="ref-tag-row">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder="e.g. leadership"
            />
            <button className="btn btn-secondary btn-sm" onClick={addTag}>Add</button>
          </div>
          {tags.length > 0 && (
            <div className="ref-tags">
              {tags.map(t => (
                <span key={t} className="ref-tag">
                  {t}
                  <button className="tag-remove-btn" onClick={() => removeTag(t)}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ref-form-group">
          <label>Notes</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional context"
          />
        </div>
      </div>

      <div className="reference-card-footer">
        <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

export default function ReferencePage() {
  const [references, setReferences] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const showToast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [refs, jobsData] = await Promise.all([
        referenceAPI.getAll(),
        taskAPI.getAllJobs(),
      ]);
      setReferences(refs);
      setJobs(jobsData.sort((a, b) => {
        if (!a.end_date && !b.end_date) return 0;
        if (!a.end_date) return -1;
        if (!b.end_date) return 1;
        return b.end_date.localeCompare(a.end_date);
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSave(id, jobId, tags, notes) {
    try {
      await referenceAPI.update(id, jobId, tags, notes);
      load();
    } catch (err) { setError(err.message); }
  }

  async function handleDelete(id, fileName) {
    if (!window.confirm(`Delete "${fileName}"? This will also remove the stored file.`)) return;
    try {
      await referenceAPI.delete(id);
      load();
      showToast('Deleted.');
    } catch (err) { setError(err.message); }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await referenceAPI.upload(file, null, [], '');
      load();
      showToast('Uploaded.');
    } catch (err) { setError(err.message); }
    e.target.value = '';
  }

  return (
    <div className="reference-page">
      <div className="reference-header">
        <h1>Reference Letters</h1>
        <button
          className="btn btn-primary btn-with-icon"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon.Add className="icon" />
          Add Document
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {error && <div className="ref-error">{error}</div>}

      {references.length === 0 && (
        <p className="ref-empty">No reference documents yet. Click "Add Document" to upload one.</p>
      )}

      <div className="references-list">
        {references.map(ref => (
          <ReferenceCard
            key={ref.id}
            reference={ref}
            jobs={jobs}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
