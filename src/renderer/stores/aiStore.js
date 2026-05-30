import { create } from 'zustand';

// State for the AI assistant panel (Phase 6).
// Messages are keyed by documentId so switching documents
// preserves each document's conversation while the app is open.
// Chat history is intentionally ephemeral — it is NOT persisted to disk.

export const useAIStore = create((set, get) => ({
  panelOpen:             false,
  messagesByDocumentId:  {},
  activePersona:         '',
  isLoading:             false,

  togglePanel:       ()        => set(s => ({ panelOpen: !s.panelOpen })),
  setPanelOpen:      (open)    => set({ panelOpen: open }),
  setActivePersona:  (persona) => set({ activePersona: persona }),
  setLoading:        (loading) => set({ isLoading: loading }),

  getMessages: (docId) => get().messagesByDocumentId[String(docId)] || [],

  addMessage: (docId, message) => set(s => {
    const key  = String(docId);
    const prev = s.messagesByDocumentId[key] || [];
    return { messagesByDocumentId: { ...s.messagesByDocumentId, [key]: [...prev, message] } };
  }),

  clearMessages: (docId) => set(s => {
    const updated = { ...s.messagesByDocumentId };
    delete updated[String(docId)];
    return { messagesByDocumentId: updated };
  }),
}));
