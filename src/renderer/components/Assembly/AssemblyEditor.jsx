import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  JobHeading, VersionedListItem,
  getInsertedVersionIds, getActiveVersionedItem,
  insertTaskInDoc, removeTaskFromDoc, changeTaskVersionInDoc,
  insertSuggestionInDoc, getDocSections,
  promoteToPoolItem,
} from './tiptapUtils.js';
import { useAssemblyStore } from '../../stores/assemblyStore.js';
import { usePoolStore } from '../../stores/poolStore.js';
import { cvDocumentAPI } from '../../services/ipc.js';

const AUTOSAVE_MS = 1500;

// AssemblyEditor wraps Tiptap and owns the auto-save lifecycle.
//
// Exposes via ref:
//   getEditor()                    — the raw Tiptap editor instance (for toolbar)
//   getHTML()                      — current HTML string
//   setContent(html)               — replace editor content
//   flushSave()                    — cancel debounce and save immediately
//   insertTask(task, job, version) — pool drawer insert
//   removeTask(taskId)             — pool drawer remove
//   changeTaskVersion(taskId, ver) — pool drawer version swap
//
// Props:
//   onActiveItemChange(item | null) — fires when cursor enters/leaves a pool bullet
//   onEditorReady()                 — fires once after Tiptap initialises

const AssemblyEditor = forwardRef(function AssemblyEditor({ onActiveItemChange, onEditorReady }, ref) {
  const { documentId, markDirty, markClean } = useAssemblyStore();
  const { setInsertedVersionMap } = usePoolStore();

  const saveTimer       = useRef(null);
  const documentIdRef   = useRef(documentId);

  useEffect(() => { documentIdRef.current = documentId; }, [documentId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, listItem: false }),
      JobHeading.configure({ levels: [1, 2, 3] }),
      VersionedListItem,
    ],
    content: '',
    editorProps: {
      attributes: { class: 'asm-editor-area' },
    },

    onUpdate: ({ editor }) => {
      markDirty();
      setInsertedVersionMap(getInsertedVersionIds(editor.state.doc));

      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const docId = documentIdRef.current;
        if (!docId) return;
        try {
          const { title } = useAssemblyStore.getState();
          await cvDocumentAPI.update(docId, { title, content_html: editor.getHTML() });
          markClean();
        } catch {
          // Silent — next auto-save or manual save will retry.
        }
      }, AUTOSAVE_MS);
    },

    onSelectionUpdate: ({ editor }) => {
      const item = getActiveVersionedItem(editor.state);
      onActiveItemChange?.(item);
    },

    onCreate: () => { onEditorReady?.(); },
  });

  useEffect(() => {
    return () => { clearTimeout(saveTimer.current); };
  }, []);

  useImperativeHandle(ref, () => ({
    getEditor:  () => editor,
    getHTML:    () => editor?.getHTML() ?? '',
    setContent: (html) => { editor?.commands.setContent(html ?? '', false); },

    flushSave: async () => {
      clearTimeout(saveTimer.current);
      const docId = documentIdRef.current;
      if (!docId || !editor) return;
      const { title } = useAssemblyStore.getState();
      await cvDocumentAPI.update(docId, { title, content_html: editor.getHTML() });
      markClean();
    },

    insertTask:        (task, job, version) => editor ? insertTaskInDoc(editor, task, job, version) : false,
    removeTask:        (taskId)             => editor ? removeTaskFromDoc(editor, taskId) : false,
    changeTaskVersion: (taskId, newVersion) => editor ? changeTaskVersionInDoc(editor, taskId, newVersion) : false,
    insertSuggestion:  (jobId, heading, text) => editor ? insertSuggestionInDoc(editor, jobId, heading, text) : null,
    getDocSections:    ()                   => editor ? getDocSections(editor.state.doc) : [],
    promoteToPoolItem: (nodePos, taskId, versionId) =>
      editor ? promoteToPoolItem(editor, nodePos, taskId, versionId) : false,

    // Scrolls to and briefly flashes a node in the editor to show the user where
    // a suggestion was just inserted or replaced.
    // variant: 'insert' (green fade-out) | 'preview' (amber, stays until replaced) | 'replace' (green fade-out)
    flashInserted: (taskId, insertedPos, variant = 'insert') => {
      if (!editor) return;
      const view = editor.view;
      let el = null;

      if (taskId != null) {
        el = view.dom.querySelector(`[data-task-id="${taskId}"]`);
      } else if (insertedPos != null) {
        try {
          const { node } = view.domAtPos(insertedPos + 1);
          el = node instanceof Element ? node : node?.parentElement ?? null;
          while (el && el.tagName !== 'LI' && el !== view.dom) el = el.parentElement;
          if (el?.tagName !== 'LI') el = null;
        } catch { el = null; }
      }

      if (!el) return;

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('ai-flash-insert', 'ai-flash-preview', 'ai-flash-replace');
      void el.offsetWidth;
      el.classList.add(`ai-flash-${variant}`);

      if (variant !== 'preview') {
        const cls = `ai-flash-${variant}`;
        setTimeout(() => el.classList.remove(cls), 2500);
      }
    },
  }), [editor]);

  return (
    <div className="asm-editor-wrapper">
      <EditorContent editor={editor} className="asm-editor-scroll" />
    </div>
  );
});

export default AssemblyEditor;
