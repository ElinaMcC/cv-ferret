import Heading  from '@tiptap/extension-heading';
import ListItem from '@tiptap/extension-list-item';

// ── Custom Tiptap extensions ──────────────────────────────────────────────────

// Extends Heading to round-trip data-job-id so the pool drawer can locate
// which job section a task belongs to.
export const JobHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      jobId: {
        default: null,
        parseHTML: el => el.getAttribute('data-job-id'),
        renderHTML: attrs => attrs.jobId ? { 'data-job-id': String(attrs.jobId) } : {},
      },
    };
  },
});

// Extends ListItem to carry data-task-id and data-version-id on <li> elements
// inserted from the pool. These attributes drive the bidirectional sync between
// the pool drawer and the document (Phase 4).
export const VersionedListItem = ListItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      taskId: {
        default: null,
        keepOnSplit: false,
        parseHTML: el => el.getAttribute('data-task-id'),
        renderHTML: attrs => attrs.taskId ? { 'data-task-id': String(attrs.taskId) } : {},
      },
      versionId: {
        default: null,
        keepOnSplit: false,
        parseHTML: el => el.getAttribute('data-version-id'),
        renderHTML: attrs => attrs.versionId ? { 'data-version-id': String(attrs.versionId) } : {},
      },
    };
  },
});


// ── Document query utilities ──────────────────────────────────────────────────

// Returns the document position at which to insert a new bullet for the given job.
//
// Pass 1 — data-job-id attribute (exact, unambiguous).
// Pass 2 — exact title text + employer name in the immediately following paragraph
//           (fallback for documents without data-job-id).
// Returns null if neither pass finds a match.
export function findInsertPos(doc, jobId, jobTitle, employer) {
  const nodes = [];
  let off = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    nodes.push({ node, offset: off });
    off += node.nodeSize;
  }

  function sectionEndAfter(startIdx) {
    for (let j = startIdx + 1; j < nodes.length; j++) {
      const { node, offset } = nodes[j];
      if (node.type.name === 'heading' && node.attrs.level <= 3) return offset;
    }
    return doc.content.size;
  }

  if (jobId != null) {
    for (let i = 0; i < nodes.length; i++) {
      const { node } = nodes[i];
      if (node.type.name === 'heading' && node.attrs.level === 3 &&
          String(node.attrs.jobId) === String(jobId)) {
        return sectionEndAfter(i);
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const { node } = nodes[i];
    if (node.type.name === 'heading' && node.attrs.level === 3 &&
        node.textContent.trim() === jobTitle) {
      const next = nodes[i + 1];
      if (next && next.node.type.name === 'paragraph' &&
          next.node.textContent.includes(employer)) {
        return sectionEndAfter(i);
      }
    }
  }

  return null;
}

// Builds a map of { taskId → versionId } for every pool-inserted list item in the doc.
// Used by the pool drawer to show which tasks are already present.
export function getInsertedVersionIds(doc) {
  const map = {};
  doc.descendants(node => {
    if (node.type.name === 'listItem' && node.attrs.taskId) {
      map[String(node.attrs.taskId)] = String(node.attrs.versionId ?? '');
    }
  });
  return map;
}

// Returns { from, to, versionId } for the first listItem with the given taskId, or null.
export function findTaskNodeInDoc(doc, taskId) {
  let result = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type.name === 'listItem' && String(node.attrs.taskId) === String(taskId)) {
      result = { from: pos, to: pos + node.nodeSize, versionId: node.attrs.versionId };
      return false;
    }
  });
  return result;
}

// Returns all plain (non-pool) list items in the document as [{text, nodePos}].
// Called after Save to offer the user a chance to add them to the pool.
export function getAllPlainItems(doc) {
  const items = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'listItem' && !node.attrs.taskId) {
      const text = node.textContent.trim();
      if (text) items.push({ text, nodePos: pos });
    }
  });
  return items;
}

// Returns the task/version info for the list item at the current cursor position,
// or null if the cursor is not inside a pool-inserted bullet.
export function getActiveVersionedItem(editorState) {
  const { $from } = editorState.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'listItem' && node.attrs.taskId) {
      return {
        taskId:      node.attrs.taskId,
        versionId:   node.attrs.versionId,
        currentText: node.textContent.trim(),
        nodePos:     $from.before(depth),
        nodeAttrs:   node.attrs,
      };
    }
  }
  return null;
}

// Returns info about the plain (non-pool) list item the cursor is currently
// inside, or null if the cursor is not in a plain bullet.
export function getActivePlainItem(editorState) {
  const { $from } = editorState.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'listItem' && !node.attrs.taskId) {
      const nodePos  = $from.before(depth);
      return {
        text:    node.textContent.trim(),
        nodePos,
        nodeEnd: nodePos + node.nodeSize,
      };
    }
  }
  return null;
}

// Stamps a plain listItem with taskId/versionId in-place, turning it into a
// pool-linked item identical to one inserted from the pool drawer.
export function promoteToPoolItem(editor, nodePos, taskId, versionId) {
  const { state, view } = editor;
  const node = state.doc.nodeAt(nodePos);
  if (!node || node.type.name !== 'listItem') return false;

  const { tr, schema } = state;
  const newNode = schema.nodes.listItem.create(
    { taskId: String(taskId), versionId: String(versionId) },
    node.content,
  );
  tr.replaceWith(nodePos, nodePos + node.nodeSize, newNode);
  view.dispatch(tr);
  return true;
}

// Walks backward through top-level nodes to find the jobId of the nearest
// preceding H3 with a data-job-id before the given document position.
// Used to pre-select the job in the Save-to-pool modal.
export function findJobIdForPosition(doc, pos) {
  let jobId = null;
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (offset >= pos) break;
    if (node.type.name === 'heading' && node.attrs.level === 3 && node.attrs.jobId) {
      jobId = String(node.attrs.jobId);
    }
    offset += node.nodeSize;
  }
  return jobId;
}

// ── Editor command helpers ────────────────────────────────────────────────────
// These functions mutate the editor by dispatching ProseMirror transactions.
// They are called by AssemblyEditor's ref handle and PoolDrawer.

// Inserts a pool task as a listItem under the matching job heading.
// Returns true on success, false if no matching section was found in the document.
export function insertTaskInDoc(editor, task, job, version) {
  const { state, view } = editor;
  const insertPos = findInsertPos(state.doc, job.id, job.job_title, job.employer);
  if (insertPos === null) return false;

  const { schema } = state;
  const { tr } = state;

  const desc    = version.description || '';
  const newItem = schema.nodes.listItem.create(
    { taskId: String(task.id), versionId: String(version.id) },
    schema.nodes.paragraph.create(null, desc ? [schema.text(desc)] : []),
  );

  const $pos = state.doc.resolve(insertPos);
  const nodeBefore = $pos.nodeBefore;

  if (nodeBefore?.type.name === 'bulletList') {
    // Append inside the existing bulletList (before its closing bracket).
    tr.insert(insertPos - 1, newItem);
  } else {
    // No list here yet — wrap in a new bulletList.
    tr.insert(insertPos, schema.nodes.bulletList.create(null, newItem));
  }

  view.dispatch(tr);
  return true;
}

// Removes a pool-inserted listItem from the document by taskId.
// If it is the only item in its parent bulletList, removes the whole list.
// Returns true if found and removed, false if not found.
export function removeTaskFromDoc(editor, taskId) {
  const found = findTaskNodeInDoc(editor.state.doc, taskId);
  if (!found) return false;

  const { state, view } = editor;
  const { tr } = state;
  const $from = state.doc.resolve(found.from);
  const parentList = $from.node($from.depth); // the bulletList containing this listItem

  if (parentList?.type.name === 'bulletList' && parentList.childCount === 1) {
    const listFrom = $from.before($from.depth);
    tr.delete(listFrom, listFrom + parentList.nodeSize);
  } else {
    tr.delete(found.from, found.to);
  }

  view.dispatch(tr);
  return true;
}

// Finds the insert position at the end of any heading's section, matching by
// text content and heading level.  Used as fallback for AI suggestions that
// target headings without a jobId (e.g. Education, Skills).
function findAnyHeadingInsertPos(doc, headingText) {
  const nodes = [];
  let off = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    nodes.push({ node, offset: off });
    off += node.nodeSize;
  }
  for (let i = 0; i < nodes.length; i++) {
    const { node } = nodes[i];
    if (node.type.name === 'heading' && node.textContent.trim() === headingText) {
      const level = node.attrs.level;
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].node.type.name === 'heading' && nodes[j].node.attrs.level <= level) {
          return nodes[j].offset;
        }
      }
      return doc.content.size;
    }
  }
  return null;
}

// Inserts a plain (non-pool) bullet under the section matching jobId or headingText.
// Falls back to any heading text match if the H3/jobId lookup fails.
// Returns the position of the inserted listItem in the updated document (a non-negative
// integer) on success, or null if no matching section was found.  The position is used
// by the AI panel to scroll-and-flash the newly inserted bullet.
export function insertSuggestionInDoc(editor, jobId, headingText, bulletText) {
  const { state, view } = editor;

  let insertPos = findInsertPos(state.doc, jobId, headingText, '');
  if (insertPos === null && headingText) {
    insertPos = findAnyHeadingInsertPos(state.doc, headingText);
  }
  if (insertPos === null) return null;

  const { schema } = state;
  const tr = state.tr;
  const newItem = schema.nodes.listItem.create(
    {},
    schema.nodes.paragraph.create(null, bulletText ? [schema.text(bulletText)] : []),
  );

  let listItemPos;
  const $pos = state.doc.resolve(insertPos);
  if ($pos.nodeBefore?.type.name === 'bulletList') {
    // Append inside the existing list; the item lands at insertPos - 1.
    listItemPos = insertPos - 1;
    tr.insert(insertPos - 1, newItem);
  } else {
    // Wrap in a new bulletList; the listItem is 1 byte inside the new list.
    listItemPos = insertPos + 1;
    tr.insert(insertPos, schema.nodes.bulletList.create(null, newItem));
  }

  view.dispatch(tr);
  return listItemPos;
}

// Returns all H2 and H3 headings in the document as [{ jobId, heading, level }].
// Used by the AI panel's section picker when automatic placement fails.
export function getDocSections(doc) {
  const sections = [];
  doc.forEach(node => {
    if (node.type.name === 'heading' && (node.attrs.level === 2 || node.attrs.level === 3)) {
      sections.push({
        jobId:   node.attrs.jobId || null,
        heading: node.textContent.trim(),
        level:   node.attrs.level,
      });
    }
  });
  return sections;
}

// Replaces a pool-inserted listItem's text and versionId in place.
// Returns true if found and changed, false if not found.
export function changeTaskVersionInDoc(editor, taskId, newVersion) {
  const found = findTaskNodeInDoc(editor.state.doc, taskId);
  if (!found) return false;

  const { state, view } = editor;
  const { tr, schema } = state;

  const desc    = newVersion.description || '';
  const newItem = schema.nodes.listItem.create(
    { taskId: String(taskId), versionId: String(newVersion.id) },
    schema.nodes.paragraph.create(null, desc ? [schema.text(desc)] : []),
  );

  tr.replaceWith(found.from, found.to, newItem);
  view.dispatch(tr);
  return true;
}
