import { useState, useEffect, useRef } from 'react';
import {
  HomeIcon, BriefcaseIcon, AcademicCapIcon, UserIcon,
  BookOpenIcon, DocumentTextIcon, EnvelopeOpenIcon,
  ClipboardDocumentListIcon, Cog6ToothIcon, ArrowDownTrayIcon,
  ChevronLeftIcon, ChevronRightIcon, SunIcon, MoonIcon,
} from '@heroicons/react/24/outline';

import ExperiencePool     from './components/ExperiencePool';
import EducationPage      from './components/EducationPage';
import PersonalDetails    from './components/PersonalDetails';
import ReferencePage      from './components/ReferencePage';
import AssemblyPage       from './components/Assembly/AssemblyPage';
import Settings           from './components/Settings';
import ApplicationTracker from './components/ApplicationTracker';
import Dashboard          from './components/Dashboard';
import CVLibrary          from './components/CVLibrary';
import ImportPage         from './components/ImportPage';
import { ToastProvider }       from './contexts/ToastContext';
import { AppSettingsProvider } from './contexts/AppSettingsContext';
import './App.css';

const NAV = [
  { id: 'home',            label: 'Home',                Icon: HomeIcon },
  { id: 'experience-pool', label: 'Experience Pool',     Icon: BriefcaseIcon },
  { id: 'education',       label: 'Education & Skills',  Icon: AcademicCapIcon },
  { id: 'personal',        label: 'Personal Details',    Icon: UserIcon },
  { id: 'cv-library',      label: 'CV Library',          Icon: BookOpenIcon },
  { id: 'assembly',        label: 'Assembly',            Icon: DocumentTextIcon },
  { id: 'references',      label: 'Reference Letters',   Icon: EnvelopeOpenIcon },
  { id: 'applications',    label: 'Application Tracker', Icon: ClipboardDocumentListIcon },
  { id: 'import',          label: 'Import',              Icon: ArrowDownTrayIcon },
  { id: 'settings',        label: 'Settings',            Icon: Cog6ToothIcon },
];

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [navContext, setNavContext]   = useState(null);

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [navCollapsed, setNavCollapsed] = useState(() => {
    const saved = localStorage.getItem('navCollapsed');
    if (saved !== null) return saved === 'true';
    return window.innerWidth < 1100;
  });

  // The Assembly registers a guard function here when it has unsaved changes.
  // navigate() calls the guard before switching views.
  const navGuardRef = useRef(null);

  function registerNavGuard(fn) {
    navGuardRef.current = fn;
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('navCollapsed', String(navCollapsed));
  }, [navCollapsed]);

  function navigate(view, ctx = null) {
    // If a guard is registered (Assembly has unsaved changes), let it decide.
    if (navGuardRef.current) {
      navGuardRef.current(
        () => { navGuardRef.current = null; setCurrentView(view); setNavContext(ctx); },
        () => { /* user chose Stay — do nothing */ }
      );
      return;
    }
    setCurrentView(view);
    setNavContext(ctx);
  }

  return (
    <AppSettingsProvider>
      <ToastProvider>
        <div className="app">
          <nav className={`sidebar${navCollapsed ? ' collapsed' : ''}`} aria-label="Main navigation">

            {navCollapsed
              ? <img src="./logo.svg" alt="CV Ferret" className="sidebar-logo-icon" />
              : <img src="./logo.svg" alt="CV Ferret" className="sidebar-logo" />
            }

            <div className="sidebar-nav">
              {NAV.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  className={`nav-btn${currentView === id ? ' active' : ''}`}
                  onClick={() => navigate(id)}
                  aria-current={currentView === id ? 'page' : undefined}
                  aria-label={navCollapsed ? label : undefined}
                  title={navCollapsed ? label : undefined}
                >
                  <Icon className="nav-icon" aria-hidden="true" />
                  {!navCollapsed && <span className="nav-label">{label}</span>}
                </button>
              ))}
            </div>

            <div className="sidebar-footer">
              <button
                className="nav-btn collapse-toggle"
                onClick={() => setNavCollapsed(c => !c)}
                aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {navCollapsed
                  ? <ChevronRightIcon className="nav-icon" aria-hidden="true" />
                  : <><ChevronLeftIcon className="nav-icon" aria-hidden="true" /><span className="nav-label">Collapse</span></>
                }
              </button>

              <button
                className="nav-btn theme-btn"
                onClick={() => setDarkMode(d => !d)}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={navCollapsed ? (darkMode ? 'Light mode' : 'Dark mode') : undefined}
              >
                {darkMode
                  ? <><SunIcon  className="nav-icon" aria-hidden="true" />{!navCollapsed && <span className="nav-label">Light mode</span>}</>
                  : <><MoonIcon className="nav-icon" aria-hidden="true" />{!navCollapsed && <span className="nav-label">Dark mode</span>}</>
                }
              </button>
            </div>

          </nav>

          <main className="content" id="main-content">
            {currentView === 'home'            && <Dashboard onNavigate={navigate} />}
            {currentView === 'experience-pool' && <ExperiencePool onNavigate={navigate} />}
            {currentView === 'education'       && <EducationPage onNavigate={navigate} />}
            {currentView === 'personal'        && <PersonalDetails />}
            {currentView === 'cv-library'      && <CVLibrary onNavigate={navigate} />}
            {currentView === 'assembly'        && (
              <AssemblyPage
                openDocumentId={navContext?.documentId}
                newDocument={navContext?.newDocument}
                preselectedProfileId={navContext?.profileId}
                fromApplicationId={navContext?.fromApplicationId ?? null}
                fromEmployer={navContext?.fromEmployer ?? null}
                fromJobTitle={navContext?.fromJobTitle ?? null}
                registerNavGuard={registerNavGuard}
                onNavigate={navigate}
              />
            )}
            {currentView === 'references'      && <ReferencePage />}
            {currentView === 'import'          && <ImportPage onNavigate={navigate} />}
            {currentView === 'settings'        && <Settings />}
            {currentView === 'applications'    && (
              <ApplicationTracker
                onNavigate={navigate}
                initialSelectedId={navContext?.selectedId ?? null}
              />
            )}
          </main>
        </div>
      </ToastProvider>
    </AppSettingsProvider>
  );
}
