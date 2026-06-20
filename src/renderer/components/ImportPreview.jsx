import { useState, useEffect } from 'react';
import { TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { importAPI, personalAPI } from '../services/ipc';
import './ImportPreview.css';

const CEFR_LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'];

const PERSONAL_FIELDS = [
  { key: 'first_name',     label: 'First name' },
  { key: 'last_name',      label: 'Last name' },
  { key: 'email',          label: 'Email' },
  { key: 'phone',          label: 'Phone' },
  { key: 'address',        label: 'Address' },
  { key: 'date_of_birth',  label: 'Date of birth' },
  { key: 'place_of_birth', label: 'Place of birth' },
  { key: 'gender',         label: 'Gender' },
];

export default function ImportPreview({ extracted, onImport, onBack }) {
  const [data, setData]                   = useState(() => deepClone(extracted));
  const [existingPersonal, setExistingPersonal] = useState(null);
  const [overwritePersonal, setOverwritePersonal] = useState(false);
  const [openSections, setOpenSections]   = useState({ personal: true, jobs: true, edu: true });
  const [openJobs, setOpenJobs]           = useState({});
  const [importing, setImporting]         = useState(false);
  const [importError, setImportError]     = useState('');

  useEffect(() => {
    personalAPI.getPersonal()
      .then(p => {
        const hasData = PERSONAL_FIELDS.some(({ key }) => p[key] && String(p[key]).trim());
        setExistingPersonal(hasData ? p : null);
      })
      .catch(() => {});
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleSection(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  function toggleJob(idx) {
    setOpenJobs(s => ({ ...s, [idx]: !(s[idx] ?? true) }));
  }

  function setPersonal(key, value) {
    setData(d => ({ ...d, personalDetails: { ...d.personalDetails, [key]: value } }));
  }

  function setJobField(jobIdx, key, value) {
    setData(d => {
      const jobs = d.jobs.map((j, i) => i === jobIdx ? { ...j, [key]: value } : j);
      return { ...d, jobs };
    });
  }

  function setTaskDesc(jobIdx, taskIdx, value) {
    setData(d => {
      const jobs = d.jobs.map((j, ji) => {
        if (ji !== jobIdx) return j;
        const tasks = j.tasks.map((t, ti) => ti === taskIdx ? { ...t, description: value } : t);
        return { ...j, tasks };
      });
      return { ...d, jobs };
    });
  }

  function deleteTask(jobIdx, taskIdx) {
    setData(d => {
      const jobs = d.jobs.map((j, ji) => {
        if (ji !== jobIdx) return j;
        return { ...j, tasks: j.tasks.filter((_, ti) => ti !== taskIdx) };
      });
      return { ...d, jobs };
    });
  }

  function deleteJob(jobIdx) {
    setData(d => ({ ...d, jobs: d.jobs.filter((_, i) => i !== jobIdx) }));
  }

  function setEduField(section, idx, key, value) {
    setData(d => {
      const list = d[section].map((e, i) => i === idx ? { ...e, [key]: value } : e);
      return { ...d, [section]: list };
    });
  }

  function deleteEduEntry(section, idx) {
    setData(d => ({ ...d, [section]: d[section].filter((_, i) => i !== idx) }));
  }

  function setSkill(idx, value) {
    setData(d => {
      const skills = d.skills.map((s, i) => i === idx ? value : s);
      return { ...d, skills };
    });
  }

  function deleteSkill(idx) {
    setData(d => ({ ...d, skills: d.skills.filter((_, i) => i !== idx) }));
  }

  function addSkill() {
    setData(d => ({ ...d, skills: [...d.skills, ''] }));
  }

  function setLanguageField(idx, key, value) {
    setData(d => {
      const languages = d.languages.map((l, i) => i === idx ? { ...l, [key]: value } : l);
      return { ...d, languages };
    });
  }

  function deleteLanguage(idx) {
    setData(d => ({ ...d, languages: d.languages.filter((_, i) => i !== idx) }));
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true);
    setImportError('');
    try {
      const result = await importAPI.importAll({
        personalDetails:  data.personalDetails,
        jobs:             data.jobs.filter(j => j.employer || j.job_title),
        education:        data.education,
        training:         data.training,
        skills:           data.skills.filter(s => s.trim()),
        languages:        data.languages.filter(l => l.language),
        overwritePersonal,
      });
      onImport(result);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // ── Counts (for section badges) ───────────────────────────────────────────

  const jobCount  = data.jobs.length;
  const taskCount = data.jobs.reduce((n, j) => n + (j.tasks || []).length, 0);
  const eduCount  = data.education.length + data.training.length;
  const skillsCount = data.skills.filter(s => s.trim()).length + data.languages.filter(l => l.language).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ipr-page">

      <div className="ipr-topbar">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← Back
        </button>
        <div className="ipr-topbar-title">Review before importing</div>
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import into CV Ferret'}
        </button>
      </div>

      <p className="ipr-intro">
        Review the data below. Edit or delete anything that looks wrong, then click Import.
      </p>

      {importError && <p className="ipr-error" role="alert">{importError}</p>}

      {/* ── Personal details ─────────────────────────────────────────── */}
      <section className="ipr-section">
        <button
          className="ipr-section-header"
          onClick={() => toggleSection('personal')}
          aria-expanded={openSections.personal}
        >
          {openSections.personal
            ? <ChevronDownIcon className="ipr-chevron" aria-hidden="true" />
            : <ChevronRightIcon className="ipr-chevron" aria-hidden="true" />}
          <span className="ipr-section-title">Personal details</span>
        </button>

        {openSections.personal && (
          <div className="ipr-section-body">

            {existingPersonal ? (
              <>
                <p className="ipr-section-note">
                  You already have personal details saved. The extracted data is shown alongside your current data.
                </p>
                <div className="ipr-personal-grid">
                  <div className="ipr-personal-col-head">Current</div>
                  <div className="ipr-personal-col-head">Extracted</div>
                  {PERSONAL_FIELDS.map(({ key, label }) => {
                    const cur = existingPersonal[key] || '—';
                    return (
                      <div key={key} className="ipr-personal-row">
                        <div className="ipr-personal-label">{label}</div>
                        <div className="ipr-personal-current">{Array.isArray(cur) ? cur.join(', ') : cur}</div>
                        <input
                          className="ipr-input"
                          value={data.personalDetails[key] || ''}
                          onChange={e => setPersonal(key, e.target.value)}
                          placeholder={label}
                          aria-label={`Extracted ${label}`}
                        />
                      </div>
                    );
                  })}
                  {/* Links row */}
                  <div className="ipr-personal-row">
                    <div className="ipr-personal-label">Links</div>
                    <div className="ipr-personal-current">
                      {(existingPersonal.links || []).length ? existingPersonal.links.join(', ') : '—'}
                    </div>
                    <input
                      className="ipr-input"
                      value={(data.personalDetails.links || []).join(', ')}
                      onChange={e => setPersonal('links', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      placeholder="https://linkedin.com/in/…"
                      aria-label="Extracted links"
                    />
                  </div>
                </div>
                <label className="ipr-personal-overwrite">
                  <input
                    type="checkbox"
                    checked={overwritePersonal}
                    onChange={e => setOverwritePersonal(e.target.checked)}
                  />
                  Replace my current personal details with the extracted data
                </label>
              </>
            ) : (
              <div className="ipr-personal-simple">
                {PERSONAL_FIELDS.map(({ key, label }) => (
                  <label key={key} className="ipr-field-label">
                    {label}
                    <input
                      className="ipr-input"
                      value={data.personalDetails[key] || ''}
                      onChange={e => setPersonal(key, e.target.value)}
                      placeholder={label}
                    />
                  </label>
                ))}
                <label className="ipr-field-label">
                  Links (comma-separated)
                  <input
                    className="ipr-input"
                    value={(data.personalDetails.links || []).join(', ')}
                    onChange={e => setPersonal('links', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="https://linkedin.com/in/…"
                  />
                </label>
                <label className="ipr-personal-overwrite">
                  <input
                    type="checkbox"
                    checked={overwritePersonal}
                    onChange={e => setOverwritePersonal(e.target.checked)}
                  />
                  Save these personal details
                </label>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Work history ─────────────────────────────────────────────── */}
      <section className="ipr-section">
        <button
          className="ipr-section-header"
          onClick={() => toggleSection('jobs')}
          aria-expanded={openSections.jobs}
        >
          {openSections.jobs
            ? <ChevronDownIcon className="ipr-chevron" aria-hidden="true" />
            : <ChevronRightIcon className="ipr-chevron" aria-hidden="true" />}
          <span className="ipr-section-title">Work history</span>
          <span className="ipr-badge">{jobCount} job{jobCount !== 1 ? 's' : ''} · {taskCount} task{taskCount !== 1 ? 's' : ''}</span>
        </button>

        {openSections.jobs && (
          <div className="ipr-section-body">
            {data.jobs.length === 0 && (
              <p className="ipr-empty">No jobs were extracted.</p>
            )}
            {data.jobs.map((job, jobIdx) => {
              const isOpen = openJobs[jobIdx] ?? true;
              return (
                <div key={jobIdx} className="ipr-job">
                  <button
                    className="ipr-job-header"
                    onClick={() => toggleJob(jobIdx)}
                    aria-expanded={isOpen}
                  >
                    {isOpen
                      ? <ChevronDownIcon className="ipr-chevron" aria-hidden="true" />
                      : <ChevronRightIcon className="ipr-chevron" aria-hidden="true" />}
                    <span className="ipr-job-title">
                      {job.job_title || 'Untitled role'}{job.employer ? ` — ${job.employer}` : ''}
                    </span>
                    <span className="ipr-job-dates">
                      {formatDate(job.start_date)} – {job.end_date ? formatDate(job.end_date) : 'Present'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="ipr-job-body">
                      <div className="ipr-job-fields">
                        <label className="ipr-field-label">
                          Job title
                          <input className="ipr-input" value={job.job_title || ''} onChange={e => setJobField(jobIdx, 'job_title', e.target.value)} />
                        </label>
                        <label className="ipr-field-label">
                          Employer
                          <input className="ipr-input" value={job.employer || ''} onChange={e => setJobField(jobIdx, 'employer', e.target.value)} />
                        </label>
                        <label className="ipr-field-label">
                          Start date
                          <input className="ipr-input" type="date" value={job.start_date || ''} onChange={e => setJobField(jobIdx, 'start_date', e.target.value || null)} />
                        </label>
                        <label className="ipr-field-label">
                          End date <span className="ipr-field-hint">(leave blank if current role)</span>
                          <input className="ipr-input" type="date" value={job.end_date || ''} onChange={e => setJobField(jobIdx, 'end_date', e.target.value || null)} />
                        </label>
                        <label className="ipr-field-label">
                          Location
                          <input className="ipr-input" value={job.location || ''} onChange={e => setJobField(jobIdx, 'location', e.target.value)} />
                        </label>
                      </div>

                      {job.notes && (
                        <p className="ipr-job-notes">
                          <strong>Note from extraction:</strong> {job.notes}
                        </p>
                      )}

                      <div className="ipr-tasks">
                        <div className="ipr-tasks-label">Tasks ({job.tasks.length})</div>
                        {job.tasks.map((task, taskIdx) => (
                          <div key={taskIdx} className="ipr-task">
                            <textarea
                              className="ipr-task-input"
                              value={task.description}
                              onChange={e => setTaskDesc(jobIdx, taskIdx, e.target.value)}
                              rows={2}
                              aria-label={`Task ${taskIdx + 1}`}
                            />
                            <button
                              className="ipr-delete-btn"
                              onClick={() => deleteTask(jobIdx, taskIdx)}
                              aria-label="Delete task"
                            >
                              <TrashIcon className="ipr-delete-icon" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        className="ipr-delete-job"
                        onClick={() => deleteJob(jobIdx)}
                      >
                        <TrashIcon className="ipr-delete-icon" aria-hidden="true" />
                        Delete this job
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Education & Skills ───────────────────────────────────────── */}
      <section className="ipr-section">
        <button
          className="ipr-section-header"
          onClick={() => toggleSection('edu')}
          aria-expanded={openSections.edu}
        >
          {openSections.edu
            ? <ChevronDownIcon className="ipr-chevron" aria-hidden="true" />
            : <ChevronRightIcon className="ipr-chevron" aria-hidden="true" />}
          <span className="ipr-section-title">Education &amp; skills</span>
          <span className="ipr-badge">{eduCount + skillsCount} item{(eduCount + skillsCount) !== 1 ? 's' : ''}</span>
        </button>

        {openSections.edu && (
          <div className="ipr-section-body">

            {/* Education */}
            {data.education.length > 0 && (
              <div className="ipr-edu-group">
                <div className="ipr-edu-group-label">Education</div>
                {data.education.map((e, i) => (
                  <EduRow key={i} entry={e} onChange={(k, v) => setEduField('education', i, k, v)} onDelete={() => deleteEduEntry('education', i)} />
                ))}
              </div>
            )}

            {/* Training */}
            {data.training.length > 0 && (
              <div className="ipr-edu-group">
                <div className="ipr-edu-group-label">Training &amp; certifications</div>
                {data.training.map((t, i) => (
                  <EduRow key={i} entry={t} onChange={(k, v) => setEduField('training', i, k, v)} onDelete={() => deleteEduEntry('training', i)} />
                ))}
              </div>
            )}

            {/* Skills */}
            {data.skills.length > 0 && (
              <div className="ipr-edu-group">
                <div className="ipr-edu-group-label">Skills</div>
                <div className="ipr-skills">
                  {data.skills.map((skill, i) => (
                    <div key={i} className="ipr-skill-chip">
                      <input
                        className="ipr-skill-input"
                        value={skill}
                        onChange={e => setSkill(i, e.target.value)}
                        aria-label={`Skill ${i + 1}`}
                      />
                      <button className="ipr-delete-btn" onClick={() => deleteSkill(i)} aria-label="Delete skill">
                        <TrashIcon className="ipr-delete-icon" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={addSkill}>+ Add skill</button>
                </div>
              </div>
            )}

            {/* Languages */}
            {data.languages.length > 0 && (
              <div className="ipr-edu-group">
                <div className="ipr-edu-group-label">Languages</div>
                {data.languages.map((lang, i) => (
                  <div key={i} className="ipr-lang-row">
                    <input
                      className="ipr-input"
                      value={lang.language}
                      onChange={e => setLanguageField(i, 'language', e.target.value)}
                      placeholder="Language"
                      aria-label="Language"
                    />
                    <select
                      className="ipr-input ipr-level-select"
                      value={lang.level || ''}
                      onChange={e => setLanguageField(i, 'level', e.target.value)}
                      aria-label="Level"
                    >
                      <option value="">Level unknown</option>
                      {CEFR_LEVELS.filter(l => l).map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <button className="ipr-delete-btn" onClick={() => deleteLanguage(i)} aria-label="Delete language">
                      <TrashIcon className="ipr-delete-icon" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {eduCount === 0 && skillsCount === 0 && (
              <p className="ipr-empty">No education, skills, or languages were extracted.</p>
            )}
          </div>
        )}
      </section>

      {/* ── Bottom import bar ───────────────────────────────────────── */}
      <div className="ipr-bottom-bar">
        {importError && <p className="ipr-error" role="alert">{importError}</p>}
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import into CV Ferret'}
        </button>
      </div>

    </div>
  );
}

// ── Education / training row ──────────────────────────────────────────────────

function EduRow({ entry, onChange, onDelete }) {
  return (
    <div className="ipr-edu-row">
      <div className="ipr-edu-fields">
        <input
          className="ipr-input"
          value={entry.institution || ''}
          onChange={e => onChange('institution', e.target.value)}
          placeholder="Institution"
          aria-label="Institution"
        />
        <input
          className="ipr-input"
          value={entry.title || ''}
          onChange={e => onChange('title', e.target.value)}
          placeholder="Qualification / course title"
          aria-label="Title"
        />
        <input
          className="ipr-input ipr-date-short"
          value={entry.end_date || ''}
          onChange={e => onChange('end_date', e.target.value)}
          placeholder="e.g. Jun 2018"
          aria-label="End date"
        />
      </div>
      <button className="ipr-delete-btn" onClick={onDelete} aria-label="Delete entry">
        <TrashIcon className="ipr-delete-icon" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1)
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
