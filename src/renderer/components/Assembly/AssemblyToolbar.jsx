import {
  DocumentArrowDownIcon, DocumentDuplicateIcon,
  SparklesIcon, Bars3Icon, CheckIcon, LinkIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { useAssemblyStore } from '../../stores/assemblyStore.js';
import { usePoolStore }     from '../../stores/poolStore.js';
import { useAIStore }       from '../../stores/aiStore.js';

// ── Formatting toolbar ────────────────────────────────────────────────────────

function FmtBtn({ onClick, active, title, children }) {
  return (
    <button
      className={`asm-fmt-btn${active ? ' active' : ''}`}
      onClick={onClick}
      title={title}
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
  onExportPdf,
  onExportDocx,
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

          <button className="btn btn-ghost btn-sm btn-with-icon" onClick={onExportDocx} title="Export as DOCX">
            <DocumentArrowDownIcon className="icon" /> DOCX
          </button>

          <button className="btn btn-ghost btn-sm btn-with-icon" onClick={onExportPdf} title="Export as PDF">
            <DocumentArrowDownIcon className="icon" /> PDF
          </button>

          <button
            className={`btn btn-ghost btn-sm btn-with-icon${drawerOpen ? ' active-toggle' : ''}`}
            onClick={toggleDrawer}
            title="Toggle task pool"
          >
            <Bars3Icon className="icon" /> Pool
          </button>

          <button className="btn btn-ghost btn-sm btn-with-icon" onClick={onLinkToApp} title="Link to application">
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
