import { create } from 'zustand';
import { taskAPI } from '../services/ipc.js';

// State for the pool drawer (Phase 4).

export const usePoolStore = create((set) => ({
  drawerOpen:         false,
  jobs:               [],    // [{ id, employer, job_title, start_date, end_date, tasks: [...] }]
  loadingJobs:        false,
  // { [taskId]: versionId } for every pool-inserted listItem currently in the document.
  insertedVersionMap: {},
  // Set<taskId> derived from insertedVersionMap — kept for any consumer that only needs IDs.
  tasksInDocument:    new Set(),
  // The task at the cursor position, or null.
  activeTaskItem:     null,  // { taskId, versionId, currentText, nodePos, nodeAttrs } | null
  filterState:        { query: '', tags: [], role: '', maxRank: 3 },

  toggleDrawer:  () => set(s => ({ drawerOpen: !s.drawerOpen })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),

  loadJobs: async () => {
    set({ loadingJobs: true });
    try {
      const jobs = await taskAPI.getAllJobsWithTasks();
      jobs.sort((a, b) => {
        if (!a.end_date && !b.end_date) return 0;
        if (!a.end_date) return -1;
        if (!b.end_date) return 1;
        return b.end_date.localeCompare(a.end_date);
      });
      set({ jobs, loadingJobs: false });
    } catch {
      set({ loadingJobs: false });
    }
  },

  setJobs: (jobs) => set({ jobs }),

  setInsertedVersionMap: (map) => set({
    insertedVersionMap: map,
    tasksInDocument:    new Set(Object.keys(map)),
  }),

  setActiveTaskItem: (item) => set({ activeTaskItem: item }),
  setFilterState:    (fs)   => set(s => ({ filterState: { ...s.filterState, ...fs } })),
}));
