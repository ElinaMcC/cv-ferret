import { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/ipc';
import { useAppSettings } from '../contexts/AppSettingsContext';
import './Dashboard.css';

function formatRelativeDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const FLOW_STEPS = [
  {
    num: 1,
    title: 'Personal Details',
    desc: 'Add your name, contact information, and links.',
    view: 'personal',
  },
  {
    num: 2,
    title: 'Experience Pool',
    desc: 'Add your jobs and task bullet points. Each task can have multiple versions tailored to different roles.',
    view: 'experience-pool',
  },
  {
    num: 3,
    title: 'Education & Skills',
    desc: 'Add your education, training, certifications, skills, and languages.',
    view: 'education',
  },
  {
    num: 4,
    title: 'CV Library & Assembly',
    desc: 'Organise CVs into profiles, or start a new one in the Assembly. Select tasks from your pool, choose versions, write freely, and export as PDF or DOCX.',
    view: 'cv-library',
  },
  {
    num: 5,
    title: 'Application Tracker',
    desc: 'Log each application, write cover letters, track your status, and export finished documents.',
    view: 'applications',
  },
];

export default function Dashboard({ onNavigate }) {
  const { aiEnabled } = useAppSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showFlow, setShowFlow] = useState(false);
  const [importInviteDismissed, setImportInviteDismissed] = useState(
    () => localStorage.getItem('importInviteDismissed') === 'true'
  );

  function dismissImportInvite() {
    localStorage.setItem('importInviteDismissed', 'true');
    setImportInviteDismissed(true);
  }

  useEffect(() => {
    dashboardAPI.getSummary()
      .then(d => {
        setData(d);
        // Expand the flow guide automatically for brand-new users.
        if (d.stats.jobCount === 0 && d.stats.cvDocumentCount === 0) setShowFlow(true);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div className="db-page"><p className="db-error">{error}</p></div>;
  if (!data) return <div className="db-page db-loading">Loading…</div>;

  const { setup, stats } = data;
  const isNew = stats.jobCount === 0 && stats.cvDocumentCount === 0;

  const checklist = [
    {
      id: 'personal',
      done: setup.hasPersonalDetails,
      label: 'Personal details',
      detail: 'Add your name and contact information',
      view: 'personal',
    },
    ...(setup.aiEnabled ? [{
      id: 'apikey',
      done: setup.hasApiKey,
      label: 'Anthropic API key',
      detail: setup.hasApiKey
        ? 'API key configured'
        : 'AI features are on but will fail without a key — add one in Settings, or turn AI off',
      view: 'settings',
    }] : []),
    {
      id: 'export',
      done: setup.hasExportPath,
      label: 'Export path',
      detail: 'Where exported CV and cover letter files are saved',
      view: 'settings',
    },
    {
      id: 'jobs',
      done: setup.hasJobs,
      label: 'Experience added',
      detail: 'Add at least one job to your experience pool',
      view: 'experience-pool',
    },
  ];

  const incomplete = checklist.filter(c => !c.done);

  return (
    <div className="db-page">
      <div className="db-header">
        <h1>CV Ferret</h1>
        <p className="db-tagline">
          A local, privacy-first tool for building tailored CVs, writing cover letters,
          and tracking job applications — all on your own machine.
        </p>
      </div>

      {/* Import invitation — shown until the user has added any experience */}
      {stats.jobCount === 0 && !importInviteDismissed && (
        <section className="db-card db-import-invite" aria-labelledby="import-invite-heading">
          <button
            className="db-import-invite-dismiss"
            onClick={dismissImportInvite}
            aria-label="Dismiss"
          >×</button>
          <h2 id="import-invite-heading">Already have a CV?</h2>
          <p className="db-import-invite-text">
            Get started in minutes — upload your existing CV and CV Ferret will pull out your
            jobs, education, and skills automatically.
          </p>
          <button className="btn btn-primary" onClick={() => onNavigate('import')}>
            Import your CV →
          </button>
        </section>
      )}

      {/* Setup checklist — shown while any item is incomplete */}
      {incomplete.length > 0 && (
        <section className="db-card db-setup" aria-labelledby="setup-heading">
          <h2 id="setup-heading">Getting started</h2>
          <p className="db-setup-intro">
            Complete these steps to get the most out of the app:
          </p>
          <ul className="db-checklist">
            {checklist.map(item => (
              <li key={item.id} className={`db-check-item ${item.done ? 'done' : ''}`}>
                <span className="db-check-icon" aria-hidden="true">
                  {item.done ? '✓' : '○'}
                </span>
                <span className="db-check-text">
                  <strong>{item.label}</strong>
                  <span className="db-check-detail"> — {item.detail}</span>
                </span>
                {!item.done && (
                  <button
                    className="db-check-btn"
                    onClick={() => onNavigate(item.view)}
                  >
                    Set up →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stats summary — shown once data exists */}
      {!isNew && (
        <section className="db-card db-stats" aria-labelledby="stats-heading">
          <h2 id="stats-heading">Your data</h2>
          <div className="db-stat-grid">
            <button className="db-stat" onClick={() => onNavigate('experience-pool')}>
              <span className="db-stat-value">{stats.jobCount}</span>
              <span className="db-stat-label">past and present job{stats.jobCount !== 1 ? 's' : ''}</span>
            </button>
            <button className="db-stat" onClick={() => onNavigate('cv-library')}>
              <span className="db-stat-value">{stats.cvDocumentCount}</span>
              <span className="db-stat-label">CV{stats.cvDocumentCount !== 1 ? 's' : ''} across {stats.profileCount} profile{stats.profileCount !== 1 ? 's' : ''}</span>
            </button>
            <button className="db-stat" onClick={() => onNavigate('applications')}>
              <span className="db-stat-value">{stats.applicationCount}</span>
              <span className="db-stat-label">job application{stats.applicationCount !== 1 ? 's' : ''}</span>
            </button>
          </div>
        </section>
      )}

      {/* Recent CVs — shown once at least one cv_document exists */}
      {stats.recentCvs && stats.recentCvs.length > 0 && (
        <section className="db-card db-recent-cvs" aria-labelledby="recent-cvs-heading">
          <div className="db-recent-cvs-header">
            <h2 id="recent-cvs-heading">Recent CVs</h2>
            <button className="db-toggle-btn" onClick={() => onNavigate('cv-library')}>
              View all →
            </button>
          </div>
          <ul className="db-cv-list">
            {stats.recentCvs.map(cv => (
              <li key={cv.id} className="db-cv-item">
                <span className="db-cv-title">{cv.title || 'Untitled CV'}</span>
                <span className="db-cv-date">{formatRelativeDate(cv.updated_at)}</span>
                <button
                  className="db-check-btn"
                  onClick={() => onNavigate('assembly', { documentId: cv.id })}
                >
                  Open →
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recommended flow */}
      <section className="db-card" aria-labelledby="flow-heading">
        <div className="db-flow-header">
          <h2 id="flow-heading">How it works</h2>
          <button
            className="db-toggle-btn"
            onClick={() => setShowFlow(v => !v)}
            aria-expanded={showFlow}
            aria-controls="flow-steps"
          >
            {showFlow ? 'Hide' : 'Show'}
          </button>
        </div>

        {showFlow && (
          <div id="flow-steps">
            <div className="db-prereqs">
              <strong>Before you start</strong>
              <ul className="db-prereq-list">
                <li>
                  Go to <button className="db-inline-link" onClick={() => onNavigate('personal')}>Personal Details</button> and add your name and contact information — these appear in every CV header.
                </li>
                <li>
                  Go to <button className="db-inline-link" onClick={() => onNavigate('settings')}>Settings</button> and set your <strong>Export Path</strong> — the folder where CV and cover letter files will be saved.
                </li>
                <li>
                  <strong>AI features are off by default.</strong> To enable them, go to Settings, turn on <strong>AI Features</strong>, and add your <strong>Anthropic API key</strong>. Without the key the Generate buttons will appear but won't work.{' '}
                  <strong>Note:</strong> the Anthropic API is a paid, pay-as-you-go service — typical usage costs a few cents per generation, but review{' '}
                  <span className="db-text-note">anthropic.com/pricing</span> before enabling. New accounts include a small free credit to get started. If you prefer to work without AI, leave the toggle off — all manual features work independently.
                </li>
              </ul>
            </div>
            <ol className="db-flow-steps">
            {FLOW_STEPS.map(step => (
              <li key={step.num} className={`db-flow-step${step.isSplit ? ' db-flow-step-split' : ''}`}>
                <span className="db-step-num" aria-hidden="true">{step.num}</span>
                {step.isSplit ? (
                  <div className="db-step-body">
                    <strong>{step.title}</strong>
                    <div className="db-step-options">
                      {step.options.map(opt => (
                        <div key={opt.view} className="db-step-option">
                          <div className="db-step-option-text">
                            <strong>{opt.title}</strong>
                            <span className="db-step-desc"> — {opt.desc}</span>
                          </div>
                          <button className="db-check-btn" onClick={() => onNavigate(opt.view)}>
                            Go →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="db-step-body">
                      <strong>{step.title}</strong>
                      <span className="db-step-desc"> — {step.desc}</span>
                    </div>
                    <button
                      className="db-check-btn"
                      onClick={() => onNavigate(step.view)}
                    >
                      Go →
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="db-card db-actions" aria-labelledby="actions-heading">
        <h2 id="actions-heading">Quick actions</h2>
        <div className="db-action-row">
          <button className="db-action-btn" onClick={() => onNavigate('assembly', { newDocument: true })}>
            New CV
          </button>
          <button className="db-action-btn" onClick={() => onNavigate('cv-library')}>
            CV Library
          </button>
          <button className="db-action-btn" onClick={() => onNavigate('experience-pool')}>
            Experience Pool
          </button>
          <button className="db-action-btn" onClick={() => onNavigate('applications')}>
            Application Tracker
          </button>
          <button className="db-action-btn db-action-btn-secondary" onClick={() => onNavigate('settings')}>
            Settings
          </button>
        </div>
      </section>

      <p className="db-translation-note">
        To use this app in another language, right-click anywhere and choose your browser's
        Translate option, or install the Immersive Translate extension.
      </p>
    </div>
  );
}
