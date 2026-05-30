import { useState, useEffect } from 'react';
import { settingsAPI, exportAPI } from '../services/ipc';
import { useToast } from '../contexts/ToastContext';
import { useAppSettings } from '../contexts/AppSettingsContext';
import './Settings.css';

export default function Settings() {
  const { aiEnabled, refresh: refreshAppSettings } = useAppSettings();
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [samplesDir, setSamplesDir] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [cvOrder, setCvOrder] = useState('newest-first');
  const [pageSize, setPageSize] = useState('A4');
  const [cvLocale, setCvLocale] = useState('en-GB');
  const [cvFileName, setCvFileName] = useState('CV');
  const [coverLetterFileName, setCoverLetterFileName] = useState('Cover Letter');
  const [piiExclusions, setPiiExclusions] = useState('');
  const [personas, setPersonas] = useState([]);
  const [newPersonaName, setNewPersonaName] = useState('');
  const [error, setError] = useState('');
  const showToast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const s = await settingsAPI.getSettings();
      setHasKey(s.hasApiKey);
      setSamplesDir(s.coverLetterSamplesDir || '');
      setExportPath(s.exportPath || '');
      setCvOrder(s.cvOrder || 'newest-first');
      setPageSize(s.pageSize || 'A4');
      setCvLocale(s.cvLocale || 'en-GB');
      setCvFileName(s.cvFileName || 'CV');
      setCoverLetterFileName(s.coverLetterFileName || 'Cover Letter');
      setPiiExclusions((s.aiPiiExclusions || []).join('\n'));
      setPersonas(s.aiPersonas || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAiToggle(enabled) {
    try {
      await settingsAPI.updateSettings({ aiEnabled: enabled });
      refreshAppSettings();
      showToast(enabled ? 'AI features enabled.' : 'AI features disabled.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) return;
    try {
      await settingsAPI.updateSettings({ anthropicApiKey: apiKey.trim() });
      setHasKey(true);
      setApiKey('');
      showToast('API key saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleClear() {
    if (!window.confirm('Remove the API key? AI features will stop working.')) return;
    try {
      await settingsAPI.updateSettings({ anthropicApiKey: '' });
      setHasKey(false);
      setApiKey('');
      showToast('API key removed.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      {error && <div className="settings-error" role="alert">{error}</div>}

      {/* AI Features */}
      <div className="settings-card">
        <div className="settings-toggle-header">
          <div>
            <h2>AI Features</h2>
            <p className="settings-description">
              When enabled, Claude (Anthropic) generates role-specific task versions,
              analyses job ads for CV assembly, and writes cover letters.
              An Anthropic API key is required. Disable this to use the app
              entirely offline with no third-party data sharing.
            </p>
          </div>
          <label className="settings-toggle" aria-label="Enable AI features">
            <input
              type="checkbox"
              role="switch"
              checked={aiEnabled}
              onChange={e => handleAiToggle(e.target.checked)}
            />
            <span className="settings-toggle-track" aria-hidden="true">
              <span className="settings-toggle-thumb" />
            </span>
          </label>
        </div>

        {aiEnabled && (
          <div className="settings-ai-sub">
            <h3>Anthropic API Key</h3>
            <p className="settings-description">
              Your key is stored locally on this machine and never sent anywhere except
              Anthropic's API. Get a key at <strong>console.anthropic.com</strong>.
            </p>
            <div className="key-status">
              {hasKey
                ? <span className="key-configured">● API key configured</span>
                : <span className="key-missing">○ No API key set</span>
              }
            </div>
            <div className="key-input-row">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                placeholder={hasKey ? 'Paste new key to replace existing…' : 'Paste your API key here…'}
                aria-label="Anthropic API key"
              />
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => setShowKey(v => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="btn btn-primary btn-sm"
                onClick={handleSave} disabled={!apiKey.trim()}
              >
                Save
              </button>
            </div>
            {hasKey && (
              <button type="button" className="btn btn-secondary btn-sm settings-clear"
                onClick={handleClear}
              >
                Remove key
              </button>
            )}

            <div className="settings-sub-divider" />

            <h3>Cover Letter Style Samples</h3>
            <p className="settings-description">
              Path to a folder of your past cover letters as .docx files. Claude reads
              these to match your writing voice when generating new letters.
            </p>
            <div className="key-input-row">
              <input
                type="text"
                value={samplesDir}
                onChange={e => setSamplesDir(e.target.value)}
                placeholder="e.g. C:\Users\you\Documents\Cover letters"
                onKeyDown={e => { if (e.key === 'Enter') saveSamplesDir(); }}
                aria-label="Cover letter samples directory path"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={saveSamplesDir}>
                Save
              </button>
            </div>
            {samplesDir && <p className="settings-dir-note">● Path configured</p>}

            <div className="settings-sub-divider" />

            <h3>Additional PII Exclusions</h3>
            <p className="settings-description">
              Extra terms to remove from all AI calls in addition to your name and employer
              names. Useful for project names, client names, or other identifying details.
              Enter one term per line.
            </p>
            <textarea
              className="settings-pii-textarea"
              value={piiExclusions}
              onChange={e => setPiiExclusions(e.target.value)}
              placeholder="e.g. Project Falcon&#10;Acme Corp&#10;internal codename"
              rows={4}
              aria-label="PII exclusion terms, one per line"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={savePiiExclusions}
            >
              Save exclusions
            </button>

            <div className="settings-sub-divider" />

            <h3>Saved AI Reviewer Personas</h3>
            <p className="settings-description">
              Saved reviewer perspectives appear as quick-select chips in the AI assistant
              panel. A persona is a short description of the reviewer&apos;s role and focus —
              it is sent directly to the AI as context.
            </p>
            {personas.length > 0 && (
              <ul className="settings-persona-list">
                {personas.map(p => (
                  <li key={p.id} className="settings-persona-item">
                    <span className="settings-persona-name">{p.name}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => deletePersona(p.id)}
                      aria-label={`Delete persona: ${p.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="key-input-row">
              <input
                type="text"
                value={newPersonaName}
                onChange={e => setNewPersonaName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addPersona(); }}
                placeholder="e.g. HR Manager evaluating leadership and communication"
                aria-label="New persona description"
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={addPersona}
                disabled={!newPersonaName.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Export Path */}
      <div className="settings-card">
        <h2>Export Path</h2>
        <p className="settings-description">
          Default folder where exported CV and cover letter files will be saved. A sub-folder
          named after the application is created automatically. You can override this path per
          application at export time.
        </p>
        <div className="key-input-row">
          <input
            type="text"
            value={exportPath}
            onChange={e => setExportPath(e.target.value)}
            placeholder="e.g. C:\Users\you\Documents\Job Applications"
            onKeyDown={e => { if (e.key === 'Enter') saveExportPath(); }}
            aria-label="Default export folder path"
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={saveExportPath}>
            Save
          </button>
        </div>
        {exportPath && <p className="settings-dir-note">● Path configured</p>}
      </div>

      {/* CV Preferences */}
      <div className="settings-card">
        <h2>CV Generation Preferences</h2>

        <div className="settings-pref-row">
          <label htmlFor="cv-order">Experience order</label>
          <select
            id="cv-order"
            value={cvOrder}
            onChange={e => savePref('cvOrder', e.target.value, setCvOrder)}
          >
            <option value="newest-first">Newest first (recommended)</option>
            <option value="oldest-first">Oldest first (chronological)</option>
          </select>
        </div>

        <div className="settings-pref-row">
          <label htmlFor="page-size">Page size</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={e => savePref('pageSize', e.target.value, setPageSize)}
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="letter">US Letter (8.5 × 11 in)</option>
          </select>
        </div>

        <div className="settings-pref-row">
          <label htmlFor="cv-locale">
            Date format in CV
            <span className="settings-pref-hint"> — affects dates in the CV preview and exported files</span>
          </label>
          <select
            id="cv-locale"
            value={cvLocale}
            onChange={e => savePref('cvLocale', e.target.value, setCvLocale)}
          >
            <option value="en-GB">English (UK) — Jan 2024</option>
            <option value="en-US">English (US) — Jan 2024</option>
            <option value="de-DE">German — Jan. 2024</option>
            <option value="fr-FR">French — janv. 2024</option>
            <option value="nl-NL">Dutch — jan 2024</option>
            <option value="es-ES">Spanish — ene 2024</option>
            <option value="pt-PT">Portuguese — jan 2024</option>
            <option value="it-IT">Italian — gen 2024</option>
            <option value="pl-PL">Polish — sty 2024</option>
            <option value="sv-SE">Swedish — jan. 2024</option>
          </select>
        </div>

        <div className="settings-sub-divider" />

        <h3>Export file naming</h3>
        <p className="settings-description">
          Templates for the file names used when exporting. Available tokens:{' '}
          <code>{'{name}'}</code> (your full name),{' '}
          <code>{'{date}'}</code> (today's date, YYYY-MM-DD),{' '}
          <code>{'{employer}'}</code>,{' '}
          <code>{'{role}'}</code>.
          The file extension (.docx / .pdf) is added automatically.
        </p>

        <div className="settings-pref-row">
          <label htmlFor="cv-file-name">CV file name</label>
          <div className="key-input-row">
            <input
              id="cv-file-name"
              type="text"
              value={cvFileName}
              onChange={e => setCvFileName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCvFileName(); }}
              placeholder="e.g. CV or {name} CV or {name}_{date}_CV"
              aria-label="CV export file name template"
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveCvFileName}>
              Save
            </button>
          </div>
        </div>

        <div className="settings-pref-row">
          <label htmlFor="cl-file-name">Cover letter file name</label>
          <div className="key-input-row">
            <input
              id="cl-file-name"
              type="text"
              value={coverLetterFileName}
              onChange={e => setCoverLetterFileName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCoverLetterFileName(); }}
              placeholder="e.g. Cover Letter or {name} Cover Letter"
              aria-label="Cover letter export file name template"
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveCoverLetterFileName}>
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Data Backup */}
      <div className="settings-card">
        <h2>Data Backup</h2>
        <p className="settings-description">
          Export all your data as a JSON file for safe-keeping, or restore from a previous
          export. The app also creates an automatic backup each time it starts (last 10 kept
          in a <code>backups/</code> folder alongside your data file).
        </p>
        <div className="settings-backup-row">
          <button type="button" className="btn btn-secondary" onClick={handleExportBackup}>
            Export backup
          </button>
          <span className="settings-backup-sep">or</span>
          <label className="btn btn-secondary settings-import-label">
            Import backup
            <input type="file" accept=".json" onChange={handleImportBackup} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* About & Privacy */}
      <div className="settings-card settings-about">
        <h2>About &amp; Privacy</h2>

        <h3>Data storage</h3>
        <p className="settings-description">
          Everything you enter — jobs, tasks, personal details, applications, cover letters —
          is saved only to a JSON file on your own machine. Nothing is transmitted to any
          server run by this application.
        </p>

        <h3>What AI features send to Anthropic</h3>
        <p className="settings-description">
          When AI features are enabled and you use them, the following is sent to
          Anthropic's API to generate a response:
        </p>
        <ul className="settings-privacy-list">
          <li><strong>Version generation</strong> — the task description, job title, and tags.</li>
          <li><strong>CV assembly analysis</strong> — all task descriptions and job titles in your pool, plus the pasted job advertisement.</li>
          <li><strong>Cover letter generation</strong> — the target role title, job ad text, selected task descriptions, and up to three writing-sample excerpts (truncated to 250 words each).</li>
          <li><strong>AI assistant chat</strong> — all task descriptions and job titles in your pool (anonymised), the pasted job ad, and the CV&apos;s heading structure. Chat history is ephemeral and never written to disk.</li>
        </ul>
        <p className="settings-description">
          <strong>Never sent:</strong> employer names, your name, contact details, address,
          date of birth, education institution names, or reference documents.
        </p>
        <p className="settings-description">
          Anthropic's API usage policy states that data submitted via the API is not used
          to train their models. See{' '}
          <span className="settings-link-text">anthropic.com/privacy</span> for details.
          Disable AI features above to use this app with no external data sharing at all.
        </p>

        <h3>API costs</h3>
        <p className="settings-description">
          The Anthropic API is a <strong>paid, pay-as-you-go service</strong> — you are charged
          per token (roughly per word) processed. Typical usage in this app costs a few cents per
          generation. New accounts receive a small free credit to get started. Review pricing at{' '}
          <span className="settings-link-text">anthropic.com/pricing</span> before enabling AI
          features. This app has no affiliation with Anthropic.
        </p>

        <h3>Disclaimer</h3>
        <p className="settings-description">
          This software is provided as-is, without warranty of any kind. Use at your own risk.
        </p>

        <h3>Language</h3>
        <p className="settings-description">
          To use this app in another language, use your browser's built-in translation
          feature (right-click anywhere on the page and select Translate) or install the
          Immersive Translate browser extension.
        </p>
      </div>
    </div>
  );

  async function savePref(key, value, setter) {
    setter(value);
    try {
      await settingsAPI.updateSettings({ [key]: value });
      refreshAppSettings();
    } catch (err) {
      setError(err.message);
    }
  }

  async function savePiiExclusions() {
    const terms = piiExclusions
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    try {
      await settingsAPI.updateSettings({ ai_pii_exclusions: terms });
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function addPersona() {
    const name = newPersonaName.trim();
    if (!name) return;
    const updated = [...personas, { id: Date.now(), name }];
    try {
      await settingsAPI.updateSettings({ ai_personas: updated });
      setPersonas(updated);
      setNewPersonaName('');
      showToast('Persona added.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deletePersona(id) {
    const updated = personas.filter(p => p.id !== id);
    try {
      await settingsAPI.updateSettings({ ai_personas: updated });
      setPersonas(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSamplesDir() {
    try {
      await settingsAPI.updateSettings({ coverLetterSamplesDir: samplesDir.trim() });
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveExportPath() {
    try {
      await settingsAPI.updateSettings({ exportPath: exportPath.trim() });
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCvFileName() {
    try {
      await settingsAPI.updateSettings({ cvFileName: cvFileName.trim() || 'CV' });
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCoverLetterFileName() {
    try {
      await settingsAPI.updateSettings({ coverLetterFileName: coverLetterFileName.trim() || 'Cover Letter' });
      showToast('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleExportBackup() {
    try {
      const data = await exportAPI.getBackupData();
      const date = new Date().toISOString().split('T')[0];
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cv-builder-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup downloaded.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleImportBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!window.confirm('This will replace ALL current data with the backup. Are you sure?')) return;
      await exportAPI.restoreBackup(parsed);
      showToast('Data restored. Refresh the page to see the updated data.');
    } catch (err) {
      setError(err.message || 'Failed to restore — is this a valid backup file?');
    }
  }
}
