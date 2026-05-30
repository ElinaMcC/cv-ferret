import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  XMarkIcon, SparklesIcon,
  ChevronDownIcon, ChevronRightIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { useAIStore }       from '../../stores/aiStore.js';
import { useAssemblyStore } from '../../stores/assemblyStore.js';
import { usePoolStore }     from '../../stores/poolStore.js';
import { aiChatAPI, settingsAPI, cvDocumentAPI, applicationAPI } from '../../services/ipc.js';
import { useToast } from '../../contexts/ToastContext.jsx';

// ── Message parser ─────────────────────────────────────────────────────────────
// Splits an AI message string into typed segments for structured rendering.
// Handles [[SUGGESTION ...]] [[UNGROUNDED: ...]] [[PERSONA: ...]] markers.

const MARKER_SOURCE = /\[\[(SUGGESTION|UNGROUNDED|PERSONA)((?:\s+\w+="[^"]*")*)\s*:\s*([\s\S]*?)\]\]/gi.source;

function parseAIMessage(text) {
  const segments = [];
  const re = new RegExp(MARKER_SOURCE, 'gi');
  let lastIndex = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const blockType = match[1].toUpperCase();
    const attrStr   = match[2];
    const content   = match[3].trim();

    const attrs = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRe.exec(attrStr)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    if (blockType === 'SUGGESTION') {
      segments.push({ type: 'suggestion', jobId: attrs.jobId || null, heading: attrs.heading || null, text: content });
    } else if (blockType === 'UNGROUNDED') {
      segments.push({ type: 'ungrounded', text: content });
    } else if (blockType === 'PERSONA') {
      segments.push({ type: 'persona', name: content });
    } else {
      segments.push({ type: 'text', content: match[0] });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

// Render plain text with basic paragraph/newline structure (no markdown library needed)
function TextContent({ text }) {
  if (!text) return null;
  const paras = text.split(/\n\n+/).filter(p => p.trim());
  if (paras.length === 0) return null;
  return paras.map((para, i) => {
    const lines = para.split('\n');
    const isList = lines.every(l => /^[-•*]\s/.test(l.trim())) && lines.length > 1;
    if (isList) {
      return (
        <ul key={i} className="ai-text-list">
          {lines.map((l, j) => <li key={j}>{l.replace(/^[-•*]\s+/, '')}</li>)}
        </ul>
      );
    }
    return (
      <p key={i} className="ai-text-para">
        {lines.map((line, j) => (
          <span key={j}>{line}{j < lines.length - 1 && <br />}</span>
        ))}
      </p>
    );
  });
}

// ── Section picker (inline within a suggestion block) ─────────────────────────

function SectionPickerInline({ sections, onSelect, onCancel }) {
  if (sections.length === 0) {
    return (
      <div className="ai-picker-empty">
        <span>No matching section found in the document.</span>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Dismiss</button>
      </div>
    );
  }
  return (
    <div className="ai-section-picker">
      <p className="ai-picker-label">Choose where to insert this:</p>
      <div className="ai-picker-options">
        {sections.map((s, i) => (
          <button key={i} className={`ai-picker-option level-${s.level}`} onClick={() => onSelect(s)}>
            {s.heading}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost btn-sm ai-picker-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// ── Pool match helper ─────────────────────────────────────────────────────────
// Returns { task, job, version } if bulletText exactly matches a pool version,
// so the insert can stamp task/version IDs instead of creating a plain bullet.

function findPoolMatch(text, jobs) {
  const norm = t => t.trim().replace(/\s+/g, ' ').toLowerCase();
  const needle = norm(text);
  for (const job of jobs) {
    for (const task of (job.tasks || [])) {
      for (const version of (task.versions || [])) {
        if (norm(version.description || '') === needle) {
          return { task, job, version };
        }
      }
    }
  }
  return null;
}

// ── Individual message components ─────────────────────────────────────────────

function UserBubble({ content }) {
  return (
    <div className="ai-msg ai-msg-user">
      <p className="ai-msg-text">{content}</p>
    </div>
  );
}

function AssistantMessage({
  content, msgIdx,
  appliedSet,
  pickerFor, pickerSections,
  onApply, onApplyWithSection, onCancelPicker, onAcceptUngrounded,
}) {
  const segments = parseAIMessage(content).filter(s => s.type !== 'persona');

  const ungroundedKeys = segments
    .map((s, si) => s.type === 'ungrounded' ? `${msgIdx}:${si}` : null)
    .filter(Boolean);
  const unappliedCount = ungroundedKeys.filter(k => !appliedSet.has(k)).length;

  const suggestionItems = segments
    .map((s, si) => s.type === 'suggestion' ? { key: `${msgIdx}:${si}`, jobId: s.jobId, heading: s.heading, text: s.text } : null)
    .filter(Boolean);
  const unappliedSuggestions = suggestionItems.filter(s => !appliedSet.has(s.key));

  return (
    <div className="ai-msg ai-msg-assistant">
      <div className="ai-msg-body">
        {segments.map((seg, si) => {
          const key = `${msgIdx}:${si}`;

          if (seg.type === 'text') {
            return <TextContent key={si} text={seg.content} />;
          }

          if (seg.type === 'suggestion') {
            const applied = appliedSet.has(key);
            const isPicking = pickerFor?.key === key;
            return (
              <div key={si} className={`ai-suggestion-block${applied ? ' applied' : ''}`}>
                <div className="ai-suggestion-header">
                  <span className="ai-suggestion-label">Suggested addition</span>
                  {(seg.jobId || seg.heading) && (
                    <span className="ai-suggestion-target">
                      {seg.heading || `section ${seg.jobId}`}
                    </span>
                  )}
                </div>
                <p className="ai-suggestion-text">{seg.text}</p>
                {isPicking ? (
                  <SectionPickerInline
                    sections={pickerSections}
                    onSelect={onApplyWithSection}
                    onCancel={onCancelPicker}
                  />
                ) : (
                  <button
                    className={`btn btn-sm ai-apply-btn${applied ? ' btn-ghost' : ' btn-primary'}`}
                    onClick={() => !applied && onApply(key, seg.jobId, seg.heading, seg.text)}
                    disabled={applied}
                  >
                    {applied ? '✓ Applied' : 'Apply to document'}
                  </button>
                )}
              </div>
            );
          }

          if (seg.type === 'ungrounded') {
            const accepted = appliedSet.has(key);
            return (
              <span key={si} className={`ai-ungrounded${accepted ? ' accepted' : ''}`}>
                {seg.text}
                {!accepted && (
                  <button
                    className="ai-ungrounded-accept"
                    onClick={() => onAcceptUngrounded(key)}
                    title="Mark as reviewed — content may not be from your experience pool"
                  >
                    Accept
                  </button>
                )}
              </span>
            );
          }

          return null;
        })}
      </div>

      {unappliedSuggestions.length > 1 && (
        <button
          className="btn btn-ghost btn-sm ai-accept-all-btn"
          onClick={() => unappliedSuggestions.forEach(s => onApply(s.key, s.jobId, s.heading, s.text))}
        >
          Apply all suggestions ({unappliedSuggestions.length})
        </button>
      )}
      {unappliedCount > 1 && (
        <button
          className="btn btn-ghost btn-sm ai-accept-all-btn"
          onClick={() => ungroundedKeys.forEach(k => onAcceptUngrounded(k))}
        >
          Accept all unverified content ({unappliedCount})
        </button>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AIChatPanel({ editorRef, getDocumentStructure }) {
  const { documentId, jobAdText, setJobAdText, addAiInsertedText } = useAssemblyStore();
  const {
    panelOpen, setPanelOpen,
    getMessages, addMessage,
    activePersona, setActivePersona,
    isLoading, setLoading,
  } = useAIStore();
  const { jobs: poolJobs, insertedVersionMap } = usePoolStore();
  const showToast = useToast();

  const messages = getMessages(documentId);

  const [inputText,      setInputText]      = useState('');
  const [width,          setWidth]          = useState(360);
  const [piiOpen,        setPiiOpen]        = useState(false);
  const [savedPersonas,  setSavedPersonas]  = useState([]);
  const [appliedSet,     setAppliedSet]     = useState(new Set());
  const [pickerFor,      setPickerFor]      = useState(null);   // { key, bulletText }
  const [pickerSections, setPickerSections] = useState([]);

  // Job ad section
  const [jobAdLocal,      setJobAdLocal]      = useState(jobAdText || '');
  const [jobAdOpen,       setJobAdOpen]       = useState(!jobAdText);
  const [showLinkPrompt,  setShowLinkPrompt]  = useState(false);
  const [linkMode,        setLinkMode]        = useState('existing');
  const [linkApps,        setLinkApps]        = useState([]);
  const [linkSearch,      setLinkSearch]      = useState('');
  const [selectedAppId,   setSelectedAppId]   = useState(null);
  const [newLinkEmployer, setNewLinkEmployer] = useState('');
  const [newLinkJobTitle, setNewLinkJobTitle] = useState('');
  const [linking,         setLinking]         = useState(false);

  const messagesEndRef = useRef(null);
  const dragging       = useRef(false);

  useEffect(() => {
    settingsAPI.getSettings()
      .then(s => setSavedPersonas(s.aiPersonas || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Sync local job ad editor when the document changes (e.g. a different CV is opened)
  useEffect(() => {
    setJobAdLocal(jobAdText || '');
    setJobAdOpen(!jobAdText);
    setShowLinkPrompt(false);
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collect [[PERSONA:...]] chips from all assistant messages
  const aiSuggestedPersonas = useMemo(() => {
    const seen = new Set();
    messages
      .filter(m => m.role === 'assistant')
      .forEach(m =>
        parseAIMessage(m.content)
          .filter(s => s.type === 'persona')
          .forEach(s => seen.add(s.name))
      );
    return Array.from(seen);
  }, [messages]);

  const personaChips = useMemo(() => [
    { label: 'General', value: '' },
    ...savedPersonas.map(p => ({ label: p.name, value: p.name })),
    ...aiSuggestedPersonas
      .filter(p => !savedPersonas.some(sp => sp.name === p))
      .map(p => ({ label: p, value: p })),
  ], [savedPersonas, aiSuggestedPersonas]);

  // ── Resize handle ──────────────────────────────────────────────────────────

  function handleResizeMouseDown(e) {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = width;

    function onMove(ev) {
      if (!dragging.current) return;
      setWidth(Math.max(280, Math.min(700, startW + (startX - ev.clientX))));
    }
    function onUp() {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text) => {
    const content = text.trim();
    if (!content || isLoading) return;
    setInputText('');

    const userMsg = { role: 'user', content, timestamp: Date.now() };
    addMessage(documentId, userMsg);
    setLoading(true);

    try {
      // getMessages uses Zustand's synchronous get(), so it reflects the
      // addMessage call above immediately
      const history = getMessages(documentId).map(({ role, content: c }) => ({ role, content: c }));
      const docStructure = getDocumentStructure?.() ?? '';
      const result = await aiChatAPI.chat(history, jobAdText, docStructure, activePersona);
      addMessage(documentId, { role: 'assistant', content: result.message, timestamp: Date.now() });
    } catch (err) {
      addMessage(documentId, {
        role: 'assistant',
        content: `Sorry, something went wrong: ${err.message}`,
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }, [documentId, isLoading, jobAdText, activePersona, addMessage, getMessages, getDocumentStructure, setLoading]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  }

  // ── Job ad ────────────────────────────────────────────────────────────────

  async function handleSaveJobAd() {
    const text = jobAdLocal.trim();
    setJobAdText(text);
    setJobAdOpen(false);
    setShowLinkPrompt(false);
    try {
      if (documentId) await cvDocumentAPI.update(documentId, { job_ad_text: text });
    } catch { /* silent — store is updated even if persistence fails */ }
    if (text) {
      setShowLinkPrompt(true);
      setLinkMode('existing');
      setLinkSearch('');
      setSelectedAppId(null);
      setNewLinkEmployer('');
      setNewLinkJobTitle('');
      applicationAPI.list().then(setLinkApps).catch(() => {});
    }
  }

  async function handleLink() {
    if (linking) return;
    setLinking(true);
    const fields = {
      job_ad_text:    jobAdLocal.trim(),
      cv_document_id: documentId || undefined,
    };
    try {
      if (linkMode === 'existing') {
        if (!selectedAppId) return;
        await applicationAPI.update(selectedAppId, fields);
        showToast('Job ad saved to application');
      } else {
        if (!newLinkEmployer.trim() && !newLinkJobTitle.trim()) return;
        await applicationAPI.create({
          employer:     newLinkEmployer.trim(),
          jobTitle:     newLinkJobTitle.trim(),
          jobAdText:    jobAdLocal.trim(),
          cvDocumentId: documentId,
        });
        showToast('Application created');
      }
      setShowLinkPrompt(false);
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      setLinking(false);
    }
  }

  // ── Apply suggestion ───────────────────────────────────────────────────────

  async function applySuggestion(key, jobId, heading, bulletText) {
    if (!editorRef?.current) return;

    const poolMatch = findPoolMatch(bulletText, poolJobs);
    if (poolMatch) {
      const taskId      = String(poolMatch.task.id);
      const alreadyInDoc = taskId in insertedVersionMap;

      if (alreadyInDoc) {
        // Flash the existing item amber so the user can see what's about to change,
        // then replace it in place and flash green to confirm.
        editorRef.current.flashInserted(taskId, null, 'preview');
        await new Promise(r => setTimeout(r, 380));
        const ok = editorRef.current.changeTaskVersion(taskId, poolMatch.version);
        if (ok) {
          setAppliedSet(prev => new Set([...prev, key]));
          editorRef.current.flashInserted(taskId, null, 'replace');
        }
      } else {
        const ok = editorRef.current.insertTask(poolMatch.task, poolMatch.job, poolMatch.version);
        if (ok) {
          setAppliedSet(prev => new Set([...prev, key]));
          editorRef.current.flashInserted(taskId, null, 'insert');
        } else {
          const sections = editorRef.current.getDocSections?.() ?? [];
          setPickerSections(sections);
          setPickerFor({ key, bulletText });
        }
      }
      return;
    }

    // No pool match — insert as a plain suggestion bullet.
    const jobIdNum    = jobId ? parseInt(jobId, 10) : null;
    const insertedPos = editorRef.current.insertSuggestion(jobIdNum, heading || '', bulletText);

    if (typeof insertedPos === 'number') {
      setAppliedSet(prev => new Set([...prev, key]));
      addAiInsertedText(bulletText);
      editorRef.current.flashInserted(null, insertedPos, 'insert');
    } else {
      const sections = editorRef.current.getDocSections?.() ?? [];
      setPickerSections(sections);
      setPickerFor({ key, bulletText });
    }
  }

  function applyWithSection(section) {
    if (!pickerFor || !editorRef?.current) return;
    const jobIdNum    = section.jobId ? parseInt(section.jobId, 10) : null;
    const insertedPos = editorRef.current.insertSuggestion(jobIdNum, section.heading, pickerFor.bulletText);
    if (typeof insertedPos === 'number') {
      setAppliedSet(prev => new Set([...prev, pickerFor.key]));
      addAiInsertedText(pickerFor.bulletText);
      editorRef.current.flashInserted(null, insertedPos, 'insert');
    }
    setPickerFor(null);
  }

  function acceptUngrounded(key) {
    setAppliedSet(prev => new Set([...prev, key]));
  }

  function handlePersonaClick(value) {
    setActivePersona(activePersona === value && value !== '' ? '' : value);
  }

  if (!panelOpen) return null;

  return (
    <div className="ai-panel open" style={{ width }}>
      <div className="ai-resize-handle" onMouseDown={handleResizeMouseDown} />

      {/* Header */}
      <div className="ai-panel-header">
        <span className="ai-panel-title">
          <SparklesIcon className="ai-panel-title-icon" />
          AI Assistant
        </span>
        <button
          className="pool-icon-btn"
          onClick={() => setPanelOpen(false)}
          aria-label="Close AI assistant"
        >
          <XMarkIcon className="pool-icon" />
        </button>
      </div>

      {/* PII disclosure */}
      <div className="ai-pii-notice">
        <button
          className="ai-pii-toggle"
          onClick={() => setPiiOpen(v => !v)}
          aria-expanded={piiOpen}
        >
          {piiOpen
            ? <ChevronDownIcon  className="ai-chevron" />
            : <ChevronRightIcon className="ai-chevron" />}
          Privacy — what AI sees
        </button>
        {piiOpen && (
          <div className="ai-pii-body">
            <p>
              <strong>Never sent:</strong> your name, employer names, email, phone, address,
              or date of birth.
            </p>
            <p>
              <strong>Sent (anonymised):</strong> job titles, task descriptions, and the job ad
              you pasted.
            </p>
          </div>
        )}
      </div>

      {/* Job ad */}
      <div className="ai-jobad-section">
        <button
          className="ai-pii-toggle"
          onClick={() => setJobAdOpen(v => !v)}
          aria-expanded={jobAdOpen}
        >
          {jobAdOpen
            ? <ChevronDownIcon  className="ai-chevron" />
            : <ChevronRightIcon className="ai-chevron" />}
          Job ad{jobAdText ? ' ✓' : ' — paste to get tailored suggestions'}
        </button>

        {jobAdOpen && (
          <div className="ai-jobad-body">
            <textarea
              className="ai-jobad-textarea"
              value={jobAdLocal}
              onChange={e => setJobAdLocal(e.target.value)}
              placeholder="Paste the job ad here — the AI will use it to tailor every suggestion to this role."
              rows={6}
            />
            <button
              className="btn btn-primary btn-sm ai-jobad-save"
              onClick={handleSaveJobAd}
              disabled={!jobAdLocal.trim()}
            >
              {jobAdText ? 'Update' : 'Save'}
            </button>
          </div>
        )}

        {showLinkPrompt && (
          <div className="ai-link-prompt">
            <p className="ai-link-prompt-label">Save to an application?</p>
            <div className="ai-link-tabs">
              <button
                className={`ai-link-tab${linkMode === 'existing' ? ' active' : ''}`}
                onClick={() => setLinkMode('existing')}
              >
                Existing
              </button>
              <button
                className={`ai-link-tab${linkMode === 'new' ? ' active' : ''}`}
                onClick={() => setLinkMode('new')}
              >
                New application
              </button>
            </div>

            {linkMode === 'existing' && (
              <>
                <input
                  className="ai-link-input"
                  type="text"
                  placeholder="Search by title or employer…"
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  autoFocus
                />
                <div className="ai-link-app-list">
                  {linkApps
                    .filter(a => {
                      if (!linkSearch) return true;
                      const q = linkSearch.toLowerCase();
                      return (a.job_title || '').toLowerCase().includes(q) ||
                             (a.employer  || '').toLowerCase().includes(q);
                    })
                    .map(app => (
                      <button
                        key={app.id}
                        className={`ai-link-app-item${selectedAppId === app.id ? ' selected' : ''}`}
                        onClick={() => setSelectedAppId(app.id)}
                      >
                        <span>{app.job_title || '(No title)'}</span>
                        <span className="ai-link-app-employer">{app.employer || ''}</span>
                      </button>
                    ))
                  }
                  {linkApps.length === 0 && (
                    <p className="ai-link-empty">No applications yet.</p>
                  )}
                </div>
              </>
            )}

            {linkMode === 'new' && (
              <div className="ai-link-new-form">
                <input
                  className="ai-link-input"
                  placeholder="Employer"
                  value={newLinkEmployer}
                  onChange={e => setNewLinkEmployer(e.target.value)}
                  autoFocus
                />
                <input
                  className="ai-link-input"
                  placeholder="Job title"
                  value={newLinkJobTitle}
                  onChange={e => setNewLinkJobTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLink()}
                />
              </div>
            )}

            <div className="ai-link-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowLinkPrompt(false)}
              >
                Not now
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleLink}
                disabled={
                  linking || (
                    linkMode === 'existing'
                      ? !selectedAppId
                      : !newLinkEmployer.trim() && !newLinkJobTitle.trim()
                  )
                }
              >
                {linking ? 'Saving…' : linkMode === 'existing' ? 'Link' : 'Create & link'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Persona chips */}
      {personaChips.length > 1 && (
        <div className="ai-persona-bar">
          <span className="ai-persona-label">Reviewing as:</span>
          <div className="ai-persona-chips">
            {personaChips.map(chip => (
              <button
                key={chip.value}
                className={`ai-persona-chip${activePersona === chip.value ? ' active' : ''}`}
                onClick={() => handlePersonaClick(chip.value)}
                title={chip.value || 'General CV reviewer'}
              >
                {chip.label.length > 28 ? chip.label.slice(0, 26) + '…' : chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && !isLoading && (
          <div className="ai-empty-state">
            <p className="ai-empty-prompt">
              {jobAdText
                ? 'Ask anything about your CV or this role.'
                : 'Paste in the job ad above to get tailored suggestions — or ask anything about your CV.'}
            </p>
          </div>
        )}

        {messages.map((msg, msgIdx) => (
          msg.role === 'user'
            ? <UserBubble key={msgIdx} content={msg.content} />
            : (
              <AssistantMessage
                key={msgIdx}
                content={msg.content}
                msgIdx={msgIdx}
                appliedSet={appliedSet}
                pickerFor={pickerFor}
                pickerSections={pickerSections}
                onApply={applySuggestion}
                onApplyWithSection={applyWithSection}
                onCancelPicker={() => setPickerFor(null)}
                onAcceptUngrounded={acceptUngrounded}
              />
            )
        ))}

        {isLoading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-typing">
              <span className="ai-typing-dot" />
              <span className="ai-typing-dot" />
              <span className="ai-typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-input-row">
        <textarea
          className="ai-input"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your CV… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={isLoading}
          aria-label="Message to AI assistant"
        />
        <button
          className="btn btn-primary btn-sm ai-send-btn"
          onClick={() => sendMessage(inputText)}
          disabled={!inputText.trim() || isLoading}
          aria-label="Send"
        >
          <PaperAirplaneIcon className="icon" />
        </button>
      </div>

      <div className="ai-panel-footer">
        Chat history is not saved between sessions. · Cover letters are written in the <strong>Application Tracker</strong>.
      </div>
    </div>
  );
}
