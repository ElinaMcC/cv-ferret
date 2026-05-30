import { useState, useRef } from 'react';
import { importAPI } from '../services/ipc';
import { useFocusTrap } from '../hooks/useFocusTrap';
import './ImportModal.css';

// ── Templates ─────────────────────────────────────────────────────────────────

const EXPERIENCE_TEMPLATE = JSON.stringify({
  jobs: [
    {
      employer: "Example Company",
      job_title: "Job Title",
      start_date: "2020-01-15",
      end_date: null,
      location: "City, Country",
      notes: "",
      tasks: [
        {
          description: "Describe one responsibility or achievement here. Each bullet point becomes a separate task.",
          tags: ["optional-tag"],
          role_priorities: []
        }
      ]
    }
  ]
}, null, 2);

const EDUCATION_TEMPLATE = JSON.stringify({
  education: [
    {
      institution: "University Name",
      title: "Degree or Qualification",
      end_date: "Jun 2018",
      notes: ""
    }
  ],
  training: [
    {
      institution: "Training Provider",
      title: "Certificate or Course Name",
      end_date: "Mar 2023",
      notes: ""
    }
  ],
  skills: ["Skill One", "Skill Two", "Skill Three"],
  languages: [
    { language: "German", level: "C1" }
  ]
}, null, 2);

const TEMPLATE_NOTES = {
  experience: [
    'start_date / end_date: use YYYY-MM-DD format (e.g. "2020-01-15"), or null for a current role',
    'Each task becomes one bullet point in your experience pool',
    'tags and role_priorities are optional — leave as empty arrays if unsure',
  ],
  education: [
    'end_date for education and training is free text — "Jun 2018", "2023", etc.',
    'Language level must be one of: A1, A2, B1, B2, C1, C2, Native',
    'All four sections (education, training, skills, languages) are optional — include only what you have',
  ],
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ImportModal({ type, onClose, onSuccess }) {
  const isExperience = type === 'experience';
  const template = isExperience ? EXPERIENCE_TEMPLATE : EDUCATION_TEMPLATE;
  const notes = TEMPLATE_NOTES[type];

  const [showTemplate, setShowTemplate] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [copied, setCopied] = useState(false);

  const containerRef = useRef(null);
  useFocusTrap(true, containerRef);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParsed(null);
    setParseError('');
    setImportError('');

    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        setParsed({ data, summary: buildSummary(data, isExperience) });
      } catch {
        setParseError(
          'Could not parse this file as JSON. Common causes: missing commas, unclosed ' +
          'brackets or braces, unquoted strings. Paste your JSON into a validator ' +
          '(e.g. jsonlint.com) to locate the problem.'
        );
      }
    });
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true);
    setImportError('');
    try {
      const result = isExperience
        ? await importAPI.importExperience(parsed.data.jobs)
        : await importAPI.importEducation(parsed.data);
      onSuccess(result);
    } catch (err) {
      setImportError(err.message);
      setImporting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(template)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  return (
    <div
      className="im-overlay"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="im-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="im-title"
        ref={containerRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="im-header">
          <h3 id="im-title">
            {isExperience ? 'Import Work Experience' : 'Import Education & Skills'}
          </h3>
          <button className="im-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <div className="im-warning" role="alert">
          <strong>Always review after importing.</strong> AI tools can misread dates, merge
          separate roles, split one job into many, or miss details that are not clearly
          formatted in the original document. Check the imported data before using it in
          your CV assembly.
        </div>

        {/* Template */}
        <div className="im-section">
          <button
            className="im-toggle"
            onClick={() => setShowTemplate(v => !v)}
            aria-expanded={showTemplate}
          >
            {showTemplate ? '▾' : '▸'} Show JSON template
          </button>
          {showTemplate && (
            <div className="im-template-box">
              <ul className="im-template-notes">
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <pre className="im-template">{template}</pre>
              <button className="im-copy-btn" onClick={handleCopy}>
                {copied ? 'Copied ✓' : 'Copy template'}
              </button>
            </div>
          )}
        </div>

        {/* File picker */}
        <div className="im-section">
          <label className="im-file-label" htmlFor="im-file">
            Select your JSON file
          </label>
          <input
            id="im-file"
            type="file"
            accept=".json"
            onChange={handleFile}
            className="im-file-input"
          />

          {parseError && <p className="im-error">{parseError}</p>}

          {parsed && (
            <div className="im-preview">
              <span className="im-preview-tick" aria-hidden="true">✓</span>
              <span>
                Found: <strong>{parsed.summary}</strong> — will be added to your existing data.
              </span>
            </div>
          )}
        </div>

        {importError && <p className="im-error im-error-bottom">{importError}</p>}

        <div className="im-actions">
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!parsed || importing}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSummary(data, isExperience) {
  if (isExperience) {
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const tasks = jobs.reduce((n, j) => n + (Array.isArray(j.tasks) ? j.tasks.length : 0), 0);
    return `${jobs.length} job${jobs.length !== 1 ? 's' : ''}, ${tasks} task${tasks !== 1 ? 's' : ''}`;
  }
  const parts = [];
  const edu = (data.education || []).length;
  const trn = (data.training || []).length;
  const skl = (data.skills || []).length;
  const lng = (data.languages || []).length;
  if (edu) parts.push(`${edu} education ${edu === 1 ? 'entry' : 'entries'}`);
  if (trn) parts.push(`${trn} training ${trn === 1 ? 'entry' : 'entries'}`);
  if (skl) parts.push(`${skl} skill${skl !== 1 ? 's' : ''}`);
  if (lng) parts.push(`${lng} language${lng !== 1 ? 's' : ''}`);
  return parts.join(', ') || 'nothing recognised';
}
