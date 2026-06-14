import { useState, useEffect, useRef } from 'react';
import {
  DocumentArrowDownIcon, DocumentDuplicateIcon,
  SparklesIcon, Bars3Icon, CheckIcon, LinkIcon,
  ArrowLeftIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import { useAssemblyStore } from '../../stores/assemblyStore.js';
import { usePoolStore }     from '../../stores/poolStore.js';
import { useAIStore }       from '../../stores/aiStore.js';

function ExportDropdown({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function select(format) {
    setOpen(false);
    onExport(format);
  }

  return (
    <div className="asm-export-dropdown" ref={ref}>
      <button
        className="btn btn-ghost btn-sm btn-with-icon"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={e => e.key === 'Escape' && setOpen(false)}
      >
        <DocumentArrowDownIcon className="icon" /> Export
      </button>
      {open && (
        <div className="asm-export-menu" role="menu">
          <button role="menuitem" onClick={() => select('md')}>Markdown (.md)</button>
          <button role="menuitem" onClick={() => select('docx')}>Word (.docx)</button>
          <button role="menuitem" onClick={() => select('pdf')}>PDF (.pdf)</button>
        </div>
      )}
    </div>
  );
}

// ── Formatting toolbar ────────────────────────────────────────────────────────

function FmtBtn({ onClick, active, title, children }) {
  return (
    <button
      className={`asm-fmt-btn${active ? ' active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      type="button"
    >
      {children}
    </button>
  );
}

function FormattingBar({ editor }) {
  if (!editor) return null;
  return (
    <div className="asm-fmt-bar">
      <FmtBtn onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')} title="Bold">
        <strong>B</strong>
      </FmtBtn>
      <FmtBtn onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')} title="Italic">
        <em>I</em>
      </FmtBtn>
      <span className="asm-fmt-sep" />
      <FmtBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive('heading', { level: 2 })} title="Section heading">
        H2
      </FmtBtn>
      <FmtBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor.isActive('heading', { level: 3 })} title="Job title heading">
        H3
      </FmtBtn>
      <span className="asm-fmt-sep" />
      <FmtBtn onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')} title="Bullet list">
        • List
      </FmtBtn>
      <FmtBtn onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')} title="Numbered list">
        1. List
      </FmtBtn>
      <span className="asm-fmt-sep" />
      <FmtBtn onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Horizontal rule">
        —
      </FmtBtn>
      <span className="asm-fmt-sep" />
      <FmtBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">↩</FmtBtn>
      <FmtBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">↪</FmtBtn>
    </div>
  );
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

export default function AssemblyToolbar({
  editor,
  onSave,
  onSaveAs,
  onExport,
  onDelete,
  onLinkToApp,
  onProfileChange,
  profiles = [],
  aiEnabled,
  saving,
  fromJobTitle,
  fromEmployer,
  onBackToApplication,
}) {
  const { title, isDirty, setTitle, profileId } = useAssemblyStore();
  const { drawerOpen, toggleDrawer } = usePoolStore();
  const { panelOpen, togglePanel }   = useAIStore();

  const currentProfileName = profiles.find(p => p.id === profileId)?.name ?? null;

  function handleProfileSelect(e) {
    const val = e.target.value;
    onProfileChange(val ? parseInt(val) : null);
  }

  const backLabel = fromJobTitle || fromEmployer
    ? [fromJobTitle, fromEmployer ? `at ${fromEmployer}` : ''].filter(Boolean).join(' ')
    : 'Application';

  return (
    <div className="asm-toolbar">

      {/* Back-link row — shown only when navigated from the Application Tracker */}
      {onBackToApplication && (
        <div className="asm-back-row">
          <button className="asm-back-btn" onClick={onBackToApplication}>
            <ArrowLeftIcon className="asm-back-icon" />
            {backLabel}
          </button>
        </div>
      )}

      {/* Top row: title + actions */}
      <div className="asm-toolbar-top">
        <input
          className="asm-title-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          aria-label="CV title"
          placeholder="CV title"
        />

        <div className="asm-toolbar-actions">
          {isDirty
            ? <span className="asm-dirty-badge">Unsaved</span>
            : <span className="asm-saved-badge"><CheckIcon className="asm-check-icon" /> Saved</span>
          }

          <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving} title="Save now">
            {saving ? 'Saving…' : 'Save'}
          </button>

          <button className="btn btn-ghost btn-sm btn-with-icon" onClick={onSaveAs} title="Save as new draft">
            <DocumentDuplicateIcon className="icon" /> Save as
          </button>

          <ExportDropdown onExport={onExport} />

          <button
            className={`btn btn-ghost btn-sm btn-with-icon${drawerOpen ? ' active-toggle' : ''}`}
            onClick={toggleDrawer}
            title="Toggle task pool"
          >
            <Bars3Icon className="icon" /> Pool
          </button>

          <button className="btn btn-ghost btn-sm btn-with-icon" onClick={onLinkToApp} title="Link to application — cover letters are written in the Application Tracker">
            <LinkIcon className="icon" /> Link
          </button>

          {aiEnabled && (
            <button
              className={`btn btn-ghost btn-sm btn-with-icon${panelOpen ? ' active-toggle' : ''}`}
              onClick={togglePanel}
              title="Toggle AI assistant"
            >
              <SparklesIcon className="icon" /> AI
            </button>
          )}

          <button
            className="btn btn-ghost btn-sm btn-with-icon asm-delete-btn"
            onClick={onDelete}
            title="Delete this CV"
            aria-label="Delete this CV"
          >
            <TrashIcon className="icon" /> Delete
          </button>
        </div>
      </div>

      {/* Profile row — small, muted, between title and formatting bar */}
      <div className="asm-profile-row">
        <span className="asm-profile-label">Profile:</span>
        <select
          className="asm-profile-select"
          value={profileId ?? ''}
          onChange={handleProfileSelect}
          aria-label="Change profile"
        >
          <option value="">Unorganised</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Formatting bar */}
      <FormattingBar editor={editor} />
    </div>
  );
}
