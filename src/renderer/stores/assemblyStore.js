import { create } from 'zustand';

// Core state for the unified Assembly page.
// Tracks the currently open cv_document and its dirty/save status.

export const useAssemblyStore = create((set) => ({
  documentId:      null,
  title:           'Untitled CV',
  isDirty:         false,
  profileId:       null,
  jobAdText:       '',
  // Texts inserted by the AI panel as plain (non-pool) bullets.
  // Excluded from the "Save as building blocks" dialog so the user isn't asked
  // to re-pool content they just accepted from the AI.
  aiInsertedTexts: [],

  setTitle:            (title)  => set({ title, isDirty: true }),
  setProfileId:        (id)     => set({ profileId: id }),
  setJobAdText:        (text)   => set({ jobAdText: text }),
  markDirty:           ()       => set({ isDirty: true }),
  markClean:           ()       => set({ isDirty: false }),
  addAiInsertedText:   (text)   => set(s => ({ aiInsertedTexts: [...s.aiInsertedTexts, text] })),

  // Called once a document is fully loaded (opened or just created).
  loadDocument: ({ id, title, profileId, jobAdText }) => set({
    documentId:      id,
    title:           title      || 'Untitled CV',
    profileId:       profileId  || null,
    jobAdText:       jobAdText  || '',
    isDirty:         false,
    aiInsertedTexts: [],
  }),

  // Wipe all state when leaving the Assembly.
  reset: () => set({
    documentId:      null,
    title:           'Untitled CV',
    isDirty:         false,
    profileId:       null,
    jobAdText:       '',
    aiInsertedTexts: [],
  }),
}));
