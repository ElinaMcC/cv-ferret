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

const WHAT_YOU_CAN_DO = [
  {
    num: 3,
    title: 'Experience Pool',
    desc: 'Review your imported tasks and create multiple versions of each bullet point, each tailored to a different type of role.',
    view: 'experience-pool',
  },
  {
    num: 4,
    title: 'CV Library & Assembly',
    desc: 'Select tasks from your pool, arrange them, and export your CV as PDF or DOCX.',
    view: 'cv-library',
  },
  {
    num: 5,
    title: 'Application Tracker',
    desc: 'Log applications, write a cover letter per application, and track your status.',
    view: 'applications',
  },
];

export default function Dashboard({ onNavigate }) {
  const { aiEnabled } = useAppSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    dashboardAPI.getSummary()
      .then(d => {
        setData(d);
        if (d.stats.jobCount === 0 && d.stats.cvDocumentCount === 0) setShowGuide(true);
      })
      .catch(err => setError(err.message));
  }, []);

  if (error) return <div className="db-page"><p className="db-error">{error}</p></div>;
  if (!data) return <div className="db-page db-loading">Loading…</div>;

  const { stats } = data;
  const isNew = stats.jobCount === 0 && stats.cvDocumentCount === 0;

  return (
    <div className="db-page">
      <div className="db-header">
        <h1>CV Ferret</h1>
        <p className="db-tagline">
          A local, privacy-first tool for building tailored CVs, writing cover letters,
          and tracking job applications — all on your own machine.
        </p>
      </div>

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

      {/* Getting started guide */}
      <section className="db-card" aria-labelledby="guide-heading">
        <div className="db-flow-header">
          <h2 id="guide-heading">Getting started</h2>
          <button
            className="db-toggle-btn"
            onClick={() => setShowGuide(v => !v)}
            aria-expanded={showGuide}
            aria-controls="guide-steps"
          >
            {showGuide ? 'Hide' : 'Show'}
          </button>
        </div>

        {showGuide && (
          <ol className="db-flow-steps" id="guide-steps">

            {/* Step 1: Get your data in */}
            <li className="db-flow-step">
              <span className="db-step-num" aria-hidden="true">1</span>
              <div className="db-step-body">
                <strong>Get your data in</strong>
                <p className="db-step-desc">
                  Upload your existing CV and CV Ferret will extract your work history,
                  education, skills, and personal details automatically.
                </p>
                <button className="btn btn-primary db-step-cta" onClick={() => onNavigate('import')}>
                  Import your CV →
                </button>
                <p className="db-step-hint">
                  Prefer to start fresh? Add everything manually via the{' '}
                  <button className="db-inline-link" onClick={() => onNavigate('experience-pool')}>Experience Pool</button>,{' '}
                  <button className="db-inline-link" onClick={() => onNavigate('education')}>Education &amp; Skills</button>, and{' '}
                  <button className="db-inline-link" onClick={() => onNavigate('personal')}>Personal Details</button> pages.
                </p>
              </div>
            </li>

            {/* Step 2: Set up before you export */}
            <li className="db-flow-step">
              <span className="db-step-num" aria-hidden="true">2</span>
              <div className="db-step-body">
                <strong>Set up before you export</strong>
                <ul className="db-prereq-list">
                  <li>
                    Set your <strong>Export path</strong> in{' '}
                    <button className="db-inline-link" onClick={() => onNavigate('settings')}>Settings</button>
                    {' '}— the folder where exported CVs and cover letters will be saved.
                  </li>
                  {aiEnabled && (
                    <li>
                      Add your <strong>Anthropic API key</strong> in{' '}
                      <button className="db-inline-link" onClick={() => onNavigate('settings')}>Settings</button>
                      {' '}to enable AI features. CV Ferret uses Anthropic's pay-as-you-go API —
                      check <span className="db-text-note">anthropic.com/pricing</span> before enabling.
                      New accounts include a small free credit.
                    </li>
                  )}
                </ul>
              </div>
            </li>

            {/* Steps 3–5: What you can do */}
            {WHAT_YOU_CAN_DO.map(step => (
              <li key={step.num} className="db-flow-step">
                <span className="db-step-num" aria-hidden="true">{step.num}</span>
                <div className="db-step-body">
                  <strong>{step.title}</strong>
                  <span className="db-step-desc"> — {step.desc}</span>
                </div>
                <button className="db-check-btn" onClick={() => onNavigate(step.view)}>
                  Go →
                </button>
              </li>
            ))}

          </ol>
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
