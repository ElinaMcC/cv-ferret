import { useState, useRef, useCallback } from 'react';
import {
  ArrowDownTrayIcon, DocumentTextIcon, AcademicCapIcon,
  UserIcon, SparklesIcon, CodeBracketIcon,
} from '@heroicons/react/24/outline';
import { importAPI } from '../services/ipc';
import { useAppSettings } from '../contexts/AppSettingsContext';
import ImportPreview from './ImportPreview';
import './ImportPage.css';

// ── JSON templates (for the manual path) ─────────────────────────────────────

const EXPERIENCE_TEMPLATE = JSON.stringify({
  jobs: [{
    employer: "Example Company",
    job_title: "Job Title",
    start_date: "2020-01-15",
    end_date: null,
    location: "City, Country",
    notes: "",
    tasks: [{
      description: "Describe one responsibility or achievement here. Each bullet point becomes a separate task.",
      tags: [],
      role_priorities: [],
    }],
  }],
}, null, 2);

const EDUCATION_TEMPLATE = JSON.stringify({
  education: [{
    institution: "University Name",
    title: "Degree or Qualification",
    end_date: "Jun 2018",
    notes: "",
  }],
  training: [{
    institution: "Training Provider",
    title: "Certificate or Course Name",
    end_date: "Mar 2023",
    notes: "",
  }],
  skills: ["Skill One", "Skill Two"],
  languages: [{ language: "German", level: "C1" }],
}, null, 2);

const ACCEPTED_EXTENSIONS = ['.docx', '.pdf', '.md', '.txt'];

function acceptedFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

// ── Main component ────────────────────────────────────────────────────────────
//
// Step flow:
//   'choose' → user picks AI or manual
//   'input'  → AI: drop/paste + extract button
//   'extracting' → AI: loading screen
//   'preview'  → AI: ImportPreview editable review
//   'manual' → manual JSON import steps
//   'done'   → success summary (AI path only; manual shows inline success)

export default function ImportPage({ onNavigate }) {
  const { aiEnabled } = useAppSettings();

  const [step, setStep]               = useState('choose');
  const [fileText, setFileText]       = useState('');
  const [fileName, setFileName]       = useState('');
  const [pasteText, setPasteText]     = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError]     = useState('');
  const [extractError, setExtractError] = useState('');
  const [extracted, setExtracted]     = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging]   = useState(false);

  const fileInputRef = useRef(null);

  const cvText = pasteText.trim() || fileText;

  async function processFile(file) {
    if (!acceptedFile(file)) {
      setFileError('Unsupported file type. Please use .docx, .pdf, .md, or .txt.');
      return;
    }
    setFileError('');
    setFileLoading(true);
    setFileText('');
    setFileName('');
    try {
      const { text } = await importAPI.extractText(file);
      setFileText(text);
      setFileName(file.name);
      setPasteText('');
    } catch (err) {
      setFileError(err.message);
    } finally {
      setFileLoading(false);
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExtract() {
    setExtractError('');
    setStep('extracting');
    try {
      const result = await importAPI.extractWithAI(cvText);
      setExtracted(result);
      setStep('preview');
    } catch (err) {
      setExtractError(err.message);
      setStep('input');
    }
  }

  function handleImportDone(result) {
    setImportResult(result);
    setStep('done');
  }

  function handleStartOver() {
    setStep('choose');
    setFileText(''); setFileName(''); setPasteText('');
    setFileError(''); setExtractError('');
    setExtracted(null); setImportResult(null);
  }

  // ── Render: preview ─────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <ImportPreview
        extracted={extracted}
        onImport={handleImportDone}
        onBack={() => setStep('input')}
      />
    );
  }

  // ── Render: success ─────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="ip-page">
        <div className="ip-done-card">
          <div className="ip-done-icon" aria-hidden="true">✓</div>
          <h1 className="ip-done-title">Import complete</h1>
          <ImportSummary result={importResult} />
          <div className="ip-done-actions">
            {importResult?.jobs > 0 && (
              <button className="btn btn-primary" onClick={() => onNavigate('experience-pool')}>
                Go to Experience Pool
              </button>
            )}
            {(importResult?.education > 0 || importResult?.training > 0 || importResult?.skillsAdded > 0 || importResult?.languages > 0) && (
              <button className="btn btn-secondary" onClick={() => onNavigate('education')}>
                Go to Education &amp; Skills
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleStartOver}>Import another CV</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: extracting ───────────────────────────────────────────────────────
  if (step === 'extracting') {
    return (
      <div className="ip-page">
        <div className="ip-extracting">
          <div className="ip-spinner" aria-hidden="true" />
          <p className="ip-extracting-msg">Extracting your data…</p>
          <p className="ip-extracting-hint">
            This can take 1–2 minutes for longer CVs. Hang tight.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: AI input step ────────────────────────────────────────────────────
  if (step === 'input') {
    return (
      <div className="ip-page">
        <div className="ip-header">
          <button className="btn btn-ghost btn-sm ip-back" onClick={() => setStep('choose')}>← Back</button>
          <h1 className="ip-title">Extract with AI</h1>
          <p className="ip-subtitle">Upload your CV or paste the text, then let Claude extract everything automatically.</p>
        </div>

        <div className="ip-input-card">
          <div
            className={`ip-dropzone${isDragging ? ' ip-dropzone--drag' : ''}${fileName ? ' ip-dropzone--ready' : ''}`}
            onDragEnter={e => { e.preventDefault(); setIsDragging(true); }}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload CV file"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf,.md,.txt"
              className="ip-file-hidden"
              onChange={e => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = ''; }}
              aria-hidden="true"
              tabIndex={-1}
            />
            {fileLoading ? (
              <span className="ip-dropzone-msg">Reading file…</span>
            ) : fileName ? (
              <span className="ip-dropzone-ready">
                <span className="ip-dropzone-tick" aria-hidden="true">✓</span>
                {fileName}
                <button
                  className="ip-dropzone-clear"
                  onClick={e => { e.stopPropagation(); setFileText(''); setFileName(''); setFileError(''); }}
                  aria-label="Remove file"
                >×</button>
              </span>
            ) : (
              <>
                <ArrowDownTrayIcon className="ip-dropzone-icon" aria-hidden="true" />
                <span className="ip-dropzone-msg">Drop a file here or <span className="ip-dropzone-link">browse</span></span>
                <span className="ip-dropzone-hint">.docx · .pdf · .md · .txt</span>
              </>
            )}
          </div>

          {fileError && <p className="ip-error" role="alert">{fileError}</p>}

          <div className="ip-or"><span>or paste your CV text</span></div>

          <textarea
            className="ip-paste"
            placeholder="Paste the text of your CV here…"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={8}
            aria-label="CV text"
          />

          <p className="ip-pii-notice">
            Your CV text will be sent to Claude for extraction. If you want to avoid sending personal details,
            replace them with placeholders before uploading and correct them in the app afterwards.
          </p>

          {extractError && <p className="ip-error" role="alert">{extractError}</p>}

          <div className="ip-input-actions">
            <button className="btn btn-primary" onClick={handleExtract} disabled={!cvText}>
              Extract with AI
            </button>
            {!cvText && <span className="ip-hint">Upload a file or paste your CV text above to continue.</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: manual path ──────────────────────────────────────────────────────
  if (step === 'manual') {
    return (
      <div className="ip-page">
        <div className="ip-header">
          <button className="btn btn-ghost btn-sm ip-back" onClick={() => setStep('choose')}>← Back</button>
          <h1 className="ip-title">Import manually</h1>
          <p className="ip-subtitle">Download the JSON templates, prepare your data, and upload a file for each section.</p>
        </div>
        <ManualPath onNavigate={onNavigate} />
      </div>
    );
  }

  // ── Render: choose path (default) ────────────────────────────────────────────
  return (
    <div className="ip-page">
      <div className="ip-header">
        <h1 className="ip-title">Import your CV</h1>
        <p className="ip-subtitle">Choose how you'd like to bring your data into CV Ferret.</p>
      </div>

      <div className="ip-path-tiles">

        <button
          className={`ip-path-tile${!aiEnabled ? ' ip-path-tile--disabled' : ''}`}
          onClick={() => aiEnabled && setStep('input')}
          disabled={!aiEnabled}
          aria-disabled={!aiEnabled}
        >
          <SparklesIcon className="ip-path-tile-icon" aria-hidden="true" />
          <span className="ip-path-tile-title">Extract with AI</span>
          <span className="ip-path-tile-desc">
            Upload your CV or paste the text and Claude will extract everything automatically — jobs, tasks, education, skills, and personal details in one go.
          </span>
          {!aiEnabled && (
            <span className="ip-path-tile-disabled-note">Enable AI in Settings to use this option.</span>
          )}
        </button>

        <button
          className="ip-path-tile"
          onClick={() => setStep('manual')}
        >
          <CodeBracketIcon className="ip-path-tile-icon" aria-hidden="true" />
          <span className="ip-path-tile-title">Import manually</span>
          <span className="ip-path-tile-desc">
            Download JSON templates, prepare your data using any tool you like, and upload the files section by section.
          </span>
        </button>

      </div>
    </div>
  );
}

// ── Manual path ───────────────────────────────────────────────────────────────

function ManualPath({ onNavigate }) {
  return (
    <div className="ip-manual">
      <div className="ip-manual-step">
        <div className="ip-manual-step-icon" aria-hidden="true"><UserIcon /></div>
        <div className="ip-manual-step-body">
          <h3 className="ip-manual-step-title">Personal details</h3>
          <p className="ip-manual-step-desc">Fill in your personal details directly in the app.</p>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('personal')}>
            Go to Personal Details
          </button>
        </div>
      </div>

      <div className="ip-manual-step">
        <div className="ip-manual-step-icon" aria-hidden="true"><DocumentTextIcon /></div>
        <div className="ip-manual-step-body">
          <h3 className="ip-manual-step-title">Work experience</h3>
          <p className="ip-manual-step-desc">
            Use a tool of your choice to build or convert your CV in the JSON format below,
            then upload the file here.
          </p>
          <TemplateDownload label="Download experience template" filename="experience-template.json" content={EXPERIENCE_TEMPLATE} />
          <ManualJsonImport type="experience" />
        </div>
      </div>

      <div className="ip-manual-step">
        <div className="ip-manual-step-icon" aria-hidden="true"><AcademicCapIcon /></div>
        <div className="ip-manual-step-body">
          <h3 className="ip-manual-step-title">Education &amp; skills</h3>
          <p className="ip-manual-step-desc">
            Use the same approach for education, training, skills, and languages.
          </p>
          <TemplateDownload label="Download education template" filename="education-template.json" content={EDUCATION_TEMPLATE} />
          <ManualJsonImport type="education" />
        </div>
      </div>
    </div>
  );
}

// ── Template download ─────────────────────────────────────────────────────────

function TemplateDownload({ label, filename, content }) {
  function download() {
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button className="btn btn-ghost btn-sm ip-template-btn" onClick={download}>{label}</button>
  );
}

// ── Manual JSON import ────────────────────────────────────────────────────────

function ManualJsonImport({ type }) {
  const isExperience = type === 'experience';
  const [parsed, setParsed]           = useState(null);
  const [parseError, setParseError]   = useState('');
  const [importing, setImporting]     = useState(false);
  const [importError, setImportError] = useState('');
  const [success, setSuccess]         = useState('');

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParsed(null); setParseError(''); setImportError(''); setSuccess('');
    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        setParsed({ data, summary: buildManualSummary(data, isExperience) });
      } catch {
        setParseError('Could not parse this file as JSON. Validate it at jsonlint.com to find the issue.');
      }
    });
    e.target.value = '';
  }

  async function handleImport() {
    if (!parsed) return;
    setImporting(true); setImportError('');
    try {
      const result = isExperience
        ? await importAPI.importExperience(parsed.data.jobs)
        : await importAPI.importEducation(parsed.data);
      setSuccess(buildSuccessMsg(result, isExperience));
      setParsed(null);
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="ip-manual-json">
      <label className="ip-manual-json-label">
        Upload JSON file
        <input type="file" accept=".json" onChange={handleFile} className="ip-file-input" />
      </label>
      {parseError  && <p className="ip-error">{parseError}</p>}
      {importError && <p className="ip-error">{importError}</p>}
      {success     && <p className="ip-success">{success}</p>}
      {parsed && (
        <div className="ip-manual-json-ready">
          <span className="ip-manual-json-summary">✓ {parsed.summary}</span>
          <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      )}
    </div>
  );
}

function buildManualSummary(data, isExperience) {
  if (isExperience) {
    const jobs  = Array.isArray(data.jobs) ? data.jobs : [];
    const tasks = jobs.reduce((n, j) => n + (Array.isArray(j.tasks) ? j.tasks.length : 0), 0);
    return `${jobs.length} job${jobs.length !== 1 ? 's' : ''}, ${tasks} task${tasks !== 1 ? 's' : ''}`;
  }
  const parts = [];
  if ((data.education  || []).length) parts.push(`${data.education.length} education`);
  if ((data.training   || []).length) parts.push(`${data.training.length} training`);
  if ((data.skills     || []).length) parts.push(`${data.skills.length} skills`);
  if ((data.languages  || []).length) parts.push(`${data.languages.length} languages`);
  return parts.join(', ') || 'nothing recognised';
}

function buildSuccessMsg(result, isExperience) {
  if (isExperience) {
    return `Imported ${result.jobs} job${result.jobs !== 1 ? 's' : ''} with ${result.tasks} task${result.tasks !== 1 ? 's' : ''}.`;
  }
  const parts = [];
  if (result.education)   parts.push(`${result.education} education`);
  if (result.training)    parts.push(`${result.training} training`);
  if (result.skillsAdded) parts.push(`${result.skillsAdded} skill${result.skillsAdded !== 1 ? 's' : ''}`);
  if (result.languages)   parts.push(`${result.languages} language${result.languages !== 1 ? 's' : ''}`);
  return `Imported: ${parts.join(', ') || 'nothing new'}.`;
}

// ── Import summary (success screen) ──────────────────────────────────────────

function ImportSummary({ result }) {
  if (!result) return null;
  const lines = [];
  if (result.personal === 'saved') lines.push('Personal details updated');
  if (result.jobs)                 lines.push(`${result.jobs} job${result.jobs !== 1 ? 's' : ''} added to Experience Pool`);
  if (result.tasks)                lines.push(`${result.tasks} task${result.tasks !== 1 ? 's' : ''} added`);
  if (result.education)            lines.push(`${result.education} education entr${result.education !== 1 ? 'ies' : 'y'} added`);
  if (result.training)             lines.push(`${result.training} training entr${result.training !== 1 ? 'ies' : 'y'} added`);
  if (result.skillsAdded)          lines.push(`${result.skillsAdded} new skill${result.skillsAdded !== 1 ? 's' : ''} added`);
  if (result.languages)            lines.push(`${result.languages} language${result.languages !== 1 ? 's' : ''} added`);
  return (
    <ul className="ip-done-summary">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  );
}
