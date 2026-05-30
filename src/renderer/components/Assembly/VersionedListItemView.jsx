import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';

// NodeView renderer for VersionedListItem.
// Pool-linked bullets (taskId set) render identically to native list items.
// Plain bullets (no taskId) get a small save-to-pool icon that appears on hover.
// Clicking the icon dispatches a custom DOM event so AssemblyPage can open the
// modal without needing a prop chain through the Tiptap extension.

export function VersionedListItemView({ node, getPos }) {
  const isPlain = !node.attrs.taskId;
  const hasText = node.textContent.trim().length > 0;

  function handleSaveClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos === null || !hasText) return;
    document.dispatchEvent(new CustomEvent('asm:save-to-pool', {
      detail: { text: node.textContent.trim(), nodePos: pos },
    }));
  }

  return (
    <NodeViewWrapper as="li" className={isPlain && hasText ? 'li-plain' : undefined}>
      <NodeViewContent className="pool-li-content" />
      {isPlain && hasText && (
        <button
          contentEditable={false}
          className="pool-save-inline-btn"
          onMouseDown={handleSaveClick}
          title="Save to experience pool"
          aria-label="Save to experience pool"
        >
          <ArrowUpTrayIcon className="pool-save-inline-icon" />
        </button>
      )}
    </NodeViewWrapper>
  );
}
