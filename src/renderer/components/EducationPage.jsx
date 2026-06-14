import { useState, useEffect } from 'react';
import { educationAPI } from '../services/ipc';
import { useToast } from '../contexts/ToastContext';
import { Icon } from '../utils/icons';
import './EducationPage.css';

const CEFR_LEVELS = [
  { value: 'A1', label: 'A1 – Beginner',           description: 'Can understand and use familiar everyday expressions and very basic phrases.' },
  { value: 'A2', label: 'A2 – Elementary',          description: 'Can communicate in simple, routine tasks on familiar topics.' },
  { value: 'B1', label: 'B1 – Intermediate',        description: 'Can deal with most situations likely to arise while travelling. Can describe experiences and events.' },
  { value: 'B2', label: 'B2 – Upper Intermediate',  description: 'Can interact with fluency with native speakers. Can produce clear, detailed text on a wide range of subjects.' },
  { value: 'C1', label: 'C1 – Advanced',            description: 'Can express ideas fluently and spontaneously. Can use language flexibly for social, academic and professional purposes.' },
  { value: 'C2', label: 'C2 – Proficient',          description: 'Can understand virtually everything heard or read. Can express themselves spontaneously with great precision.' },
  { value: 'Native', label: 'Native / Mother tongue', description: 'Language acquired from birth or early childhood.' },
];

const WORLD_LANGUAGES = [
  'Afrikaans', 'Albanian', 'Amharic', 'Arabic', 'Armenian', 'Azerbaijani',
  'Basque', 'Belarusian', 'Bengali', 'Bosnian', 'Bulgarian',
  'Catalan', 'Chinese (Mandarin)', 'Chinese (Cantonese)', 'Croatian', 'Czech',
  'Danish', 'Dutch',
  'English', 'Estonian',
  'Finnish', 'French',
  'Galician', 'Georgian', 'German', 'Greek', 'Gujarati',
  'Hebrew', 'Hindi', 'Hungarian',
  'Icelandic', 'Indonesian', 'Irish', 'Italian',
  'Japanese',
  'Kannada', 'Kazakh', 'Korean',
  'Latvian', 'Lithuanian',
  'Macedonian', 'Malay', 'Malayalam', 'Maltese', 'Marathi', 'Mongolian',
  'Nepali', 'Norwegian',
  'Pashto', 'Persian (Farsi)', 'Polish', 'Portuguese', 'Punjabi',
  'Romanian', 'Russian',
  'Serbian', 'Sinhala', 'Slovak', 'Slovenian', 'Somali', 'Spanish', 'Swahili', 'Swedish',
  'Tamil', 'Telugu', 'Thai', 'Turkish',
  'Ukrainian', 'Urdu', 'Uzbek',
  'Vietnamese',
  'Welsh',
  'Xhosa', 'Yoruba',
  'Zulu',
];

// ── Entry form (inline, used by Education and Training sections) ──────────────

function EntryForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    institution: initial?.institution || '',
    title: initial?.title || '',
    end_date: initial?.end_date || '',
    notes: initial?.notes || '',
  });

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  return (
    <div className="edu-entry-form">
      <div className="edu-form-row">
        <div className="edu-form-group">
          <label>Institution</label>
          <input
            type="text"
            value={form.institution}
            onChange={e => set('institution', e.target.value)}
            placeholder="e.g. University of Edinburgh"
            autoFocus
          />
        </div>
        <div className="edu-form-group">
          <label>Title / Qualification</label>
          <input
            type="text"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g. BSc Computer Science"
          />
        </div>
        <div className="edu-form-group edu-form-group-narrow">
          <label>End Date <span className="optional">(e.g. Jun 2025)</span></label>
          <input
            type="text"
            value={form.end_date}
            onChange={e => set('end_date', e.target.value)}
            placeholder="Jun 2025"
          />
        </div>
      </div>
      <div className="edu-form-group">
        <label>Notes <span className="optional">(optional)</span></label>
        <input
          type="text"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="e.g. First class honours"
        />
      </div>
      <div className="edu-form-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onSave(form)}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EntrySection({ title, entries, onCreate, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  return (
    <section className="edu-section">
      <div className="edu-section-header">
        <h2>{title}</h2>
        {!adding && (
          <button
            className="btn btn-primary btn-sm btn-with-icon"
            onClick={() => setAdding(true)}
          >
            <Icon.Add className="icon" /> Add
          </button>
        )}
      </div>

      {adding && (
        <EntryForm
          onSave={async (form) => { await onCreate(form); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="entries-list">
        {entries.length === 0 && !adding && (
          <p className="edu-empty">No entries yet.</p>
        )}
        {entries.map(entry => (
          <div key={entry.id} className="entry-card">
            {editingId === entry.id ? (
              <EntryForm
                initial={entry}
                onSave={async (form) => { await onUpdate(entry.id, form); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="entry-view">
                <div className="entry-main">
                  <span className="entry-title">{entry.title}</span>
                  <span className="entry-institution">{entry.institution}</span>
                  {entry.notes && <span className="entry-notes">{entry.notes}</span>}
                </div>
                <div className="entry-meta">
                  {entry.end_date && <span className="entry-date">{entry.end_date}</span>}
                  <div className="entry-actions">
                    <button className="icon-btn" onClick={() => setEditingId(entry.id)} title="Edit">
                      <Icon.Edit className="icon" />
                    </button>
                    <button className="icon-btn delete-btn" onClick={() => onDelete(entry.id)} title="Delete">
                      <Icon.Delete className="icon" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Skills section ────────────────────────────────────────────────────────────

function SkillsSection({ skills, onAdd, onRemove }) {
  const [input, setInput] = useState('');

  function handleAdd() {
    const skill = input.trim();
    if (!skill || skills.includes(skill)) return;
    onAdd(skill);
    setInput('');
  }

  return (
    <section className="edu-section">
      <div className="edu-section-header">
        <h2>Skills</h2>
      </div>
      <div className="skill-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="e.g. Microsoft SharePoint administration"
        />
        <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
      </div>
      {skills.length > 0 && (
        <div className="skills-list">
          {skills.map(skill => (
            <span key={skill} className="skill-chip">
              {skill}
              <button className="skill-remove" onClick={() => onRemove(skill)} title="Remove">×</button>
            </span>
          ))}
        </div>
      )}
      {skills.length === 0 && <p className="edu-empty">No skills added yet.</p>}
    </section>
  );
}

// ── Languages section ─────────────────────────────────────────────────────────

function LanguagesSection({ languages, onAdd, onRemove }) {
  const [langInput, setLangInput] = useState('');
  const [levelInput, setLevelInput] = useState('');

  const selectedLevel = CEFR_LEVELS.find(l => l.value === levelInput);

  function handleAdd() {
    if (!langInput || !levelInput) return;
    if (languages.some(l => l.language === langInput)) return;
    onAdd({ language: langInput, level: levelInput });
    setLangInput('');
    setLevelInput('');
  }

  return (
    <section className="edu-section">
      <div className="edu-section-header">
        <h2>Languages</h2>
      </div>
      <div className="lang-input-row">
        <div className="lang-field">
          <label className="lang-label">Language</label>
          <select value={langInput} onChange={e => setLangInput(e.target.value)}>
            <option value="">Select a language…</option>
            {WORLD_LANGUAGES.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
        <div className="lang-field lang-level-field">
          <label className="lang-label">Proficiency</label>
          <select value={levelInput} onChange={e => setLevelInput(e.target.value)}>
            <option value="">Select level…</option>
            {CEFR_LEVELS.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary btn-sm lang-add-btn"
          onClick={handleAdd}
          disabled={!langInput || !levelInput}
        >
          Add
        </button>
      </div>
      {selectedLevel && (
        <p className="cefr-description">{selectedLevel.description}</p>
      )}
      {languages.length > 0 && (
        <div className="languages-list">
          {languages.map(entry => {
            const level = CEFR_LEVELS.find(l => l.value === entry.level);
            return (
              <div key={entry.language} className="language-entry">
                <span className="lang-name">{entry.language}</span>
                <span className="lang-level-badge">{level ? level.label : entry.level}</span>
                <button className="icon-btn delete-btn" onClick={() => onRemove(entry.language)} title="Remove">
                  <Icon.Delete className="icon" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {languages.length === 0 && <p className="edu-empty">No languages added yet.</p>}
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EducationPage({ onNavigate }) {
  const [education, setEducation] = useState([]);
  const [training, setTraining] = useState([]);
  const [skills, setSkills] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [error, setError] = useState('');
  const showToast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [edu, trn, skl, lng] = await Promise.all([
        educationAPI.getAllEducation(),
        educationAPI.getAllTraining(),
        educationAPI.getSkills(),
        educationAPI.getLanguages(),
      ]);
      setEducation(edu);
      setTraining(trn);
      setSkills(skl);
      setLanguages(lng);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateEducation(form) {
    try {
      await educationAPI.createEducation(form.institution, form.title, form.end_date, form.notes);
      load();
      showToast('Saved.');
    } catch (err) { setError(err.message); }
  }

  async function handleUpdateEducation(id, form) {
    try {
      await educationAPI.updateEducation(id, form.institution, form.title, form.end_date, form.notes);
      load();
      showToast('Saved.');
    } catch (err) { setError(err.message); }
  }

  async function handleDeleteEducation(id) {
    if (!window.confirm('Delete this entry?')) return;
    try { await educationAPI.deleteEducation(id); load(); showToast('Deleted.'); } catch (err) { setError(err.message); }
  }

  async function handleCreateTraining(form) {
    try {
      await educationAPI.createTraining(form.institution, form.title, form.end_date, form.notes);
      load();
      showToast('Saved.');
    } catch (err) { setError(err.message); }
  }

  async function handleUpdateTraining(id, form) {
    try {
      await educationAPI.updateTraining(id, form.institution, form.title, form.end_date, form.notes);
      load();
      showToast('Saved.');
    } catch (err) { setError(err.message); }
  }

  async function handleDeleteTraining(id) {
    if (!window.confirm('Delete this entry?')) return;
    try { await educationAPI.deleteTraining(id); load(); showToast('Deleted.'); } catch (err) { setError(err.message); }
  }

  async function handleAddSkill(skill) {
    const updated = [...skills, skill];
    try { await educationAPI.updateSkills(updated); setSkills(updated); showToast('Saved.'); } catch (err) { setError(err.message); }
  }

  async function handleRemoveSkill(skill) {
    const updated = skills.filter(s => s !== skill);
    try { await educationAPI.updateSkills(updated); setSkills(updated); showToast('Deleted.'); } catch (err) { setError(err.message); }
  }

  async function handleAddLanguage(entry) {
    const updated = [...languages, entry];
    try { await educationAPI.updateLanguages(updated); setLanguages(updated); showToast('Saved.'); } catch (err) { setError(err.message); }
  }

  async function handleRemoveLanguage(language) {
    const updated = languages.filter(l => l.language !== language);
    try { await educationAPI.updateLanguages(updated); setLanguages(updated); showToast('Deleted.'); } catch (err) { setError(err.message); }
  }

  return (
    <div className="education-page">
      <div className="edu-page-header">
        <h1>Education &amp; Skills</h1>
        <button className="btn btn-secondary btn-sm btn-with-icon" onClick={() => onNavigate('import')}>
          <Icon.Import className="icon" />
          Import →
        </button>
      </div>
      {error && <div className="edu-error">{error}</div>}

      <EntrySection
        title="Education"
        entries={education}
        onCreate={handleCreateEducation}
        onUpdate={handleUpdateEducation}
        onDelete={handleDeleteEducation}
      />

      <EntrySection
        title="Training &amp; Certifications"
        entries={training}
        onCreate={handleCreateTraining}
        onUpdate={handleUpdateTraining}
        onDelete={handleDeleteTraining}
      />

      <SkillsSection
        skills={skills}
        onAdd={handleAddSkill}
        onRemove={handleRemoveSkill}
      />

      <LanguagesSection
        languages={languages}
        onAdd={handleAddLanguage}
        onRemove={handleRemoveLanguage}
      />

    </div>
  );
}
