// API service - makes HTTP calls to the Express backend
const API_BASE = 'http://localhost:5000/api';

const api = {
  async request(method, path, body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const url = `${API_BASE}${path}`;
    console.log('[api] request', method, url, body);
    const response = await fetch(url, options);
    const text = await response.text();
    console.log('[api] response status:', response.status, 'body:', text);

    if (!response.ok) {
      let message;
      try {
        const error = JSON.parse(text);
        message = error.error || response.statusText;
      } catch {
        message = text || response.statusText;
      }
      throw new Error(message);
    }
    return JSON.parse(text);
  },
};

export const taskAPI = {
  createJob: (employer, jobTitle, startDate, endDate, location, notes) =>
    api.request('POST', '/jobs', { employer, jobTitle, startDate, endDate, location, notes }),

  updateJob: (jobId, employer, jobTitle, startDate, endDate, location, notes) =>
    api.request('PUT', `/jobs/${jobId}`, { employer, jobTitle, startDate, endDate, location, notes }),

  deleteJob: (jobId) =>
    api.request('DELETE', `/jobs/${jobId}`),

  getAllJobs: () =>
    api.request('GET', '/jobs'),

  getAllJobsWithTasks: () =>
    api.request('GET', '/jobs/with-tasks'),

  getTasksByJob: (jobId) =>
    api.request('GET', `/jobs/${jobId}/tasks`),

  createTask: (jobId) =>
    api.request('POST', '/tasks', { jobId }),

  deleteTask: (taskId) =>
    api.request('DELETE', `/tasks/${taskId}`),

  batchDeleteTasks: (ids) =>
    api.request('POST', '/tasks/batch-delete', { ids }),

  batchDeleteJobs: (ids) =>
    api.request('POST', '/jobs/batch-delete', { ids }),

  reorderTasks: (jobId, taskIds) =>
    api.request('PUT', `/jobs/${jobId}/tasks-order`, { taskIds }),

  createTaskWithVersion: (jobId, description, tags, rolePriorities = []) =>
    api.request('POST', `/jobs/${jobId}/tasks-with-version`, { description, tags, rolePriorities }),

  createTaskVersion: (taskId, description, tags, rolePriorities = []) =>
    api.request('POST', `/tasks/${taskId}/versions`, { description, tags, rolePriorities }),

  updateTaskVersion: (versionId, description, tags, rolePriorities = []) =>
    api.request('PUT', `/versions/${versionId}`, { description, tags, rolePriorities }),

  deleteTaskVersion: (versionId) =>
    api.request('DELETE', `/versions/${versionId}`),

  setDefaultVersion: (versionId) =>
    api.request('PUT', `/versions/${versionId}/default`),

  getVersion: (versionId) =>
    api.request('GET', `/versions/${versionId}`),

  getAllTags: () =>
    api.request('GET', '/tags'),

  getAllRoles: () =>
    api.request('GET', '/roles'),

  searchTasks: (query) =>
    api.request('GET', `/search?q=${encodeURIComponent(query)}`),
};

export const educationAPI = {
  getAllEducation: () => api.request('GET', '/education'),
  createEducation: (institution, title, endDate, notes) =>
    api.request('POST', '/education', { institution, title, endDate, notes }),
  updateEducation: (id, institution, title, endDate, notes) =>
    api.request('PUT', `/education/${id}`, { institution, title, endDate, notes }),
  deleteEducation: (id) => api.request('DELETE', `/education/${id}`),

  getAllTraining: () => api.request('GET', '/training'),
  createTraining: (institution, title, endDate, notes) =>
    api.request('POST', '/training', { institution, title, endDate, notes }),
  updateTraining: (id, institution, title, endDate, notes) =>
    api.request('PUT', `/training/${id}`, { institution, title, endDate, notes }),
  deleteTraining: (id) => api.request('DELETE', `/training/${id}`),

  getSkills: () => api.request('GET', '/skills'),
  updateSkills: (skills) => api.request('PUT', '/skills', skills),

  getLanguages: () => api.request('GET', '/languages'),
  updateLanguages: (languages) => api.request('PUT', '/languages', languages),
};

export const personalAPI = {
  getPersonal: () => api.request('GET', '/personal'),
  updatePersonal: (data) => api.request('PUT', '/personal', data),
};

export const referenceAPI = {
  getAll: () => api.request('GET', '/references'),
  update: (id, jobId, tags, notes) =>
    api.request('PUT', `/references/${id}`, { jobId, tags, notes }),
  delete:      (id)  => api.request('DELETE', `/references/${id}`),
  batchDelete: (ids) => api.request('POST',   '/references/batch-delete', { ids }),
  fileUrl: (id) => `${API_BASE}/references/${id}/file`,
  upload: (file, jobId, tags, notes) => {
    const form = new FormData();
    form.append('file', file);
    if (jobId) form.append('jobId', jobId);
    form.append('tags', JSON.stringify(tags || []));
    form.append('notes', notes || '');
    return fetch(`${API_BASE}/references/upload`, { method: 'POST', body: form })
      .then(r => r.json());
  },
};

export const settingsAPI = {
  getSettings: () => api.request('GET', '/settings'),
  updateSettings: (data) => api.request('PUT', '/settings', data),
};

export const cvAssemblyAPI = {
  analyseJobAd: (jobAd) => api.request('POST', '/cv-assembly/analyse', { jobAd }),
};

export const coverLetterAPI = {
  generate: (applicationId, style) =>
    api.request('POST', '/cover-letter/generate', { applicationId, style }),
};

export const applicationAPI = {
  list:       ()              => api.request('GET',    '/applications'),
  get:        (id)            => api.request('GET',    `/applications/${id}`),
  create: async (fields) => {
    const { id } = await api.request('POST', '/applications', fields);
    return id;
  },
  update:     (id, fields)    => api.request('PUT',    `/applications/${id}`, fields),
  delete:     (id)            => api.request('DELETE', `/applications/${id}`),
  checkFiles:   (id)          => api.request('GET',    `/applications/${id}/check-files`),
  batchDelete:  (ids)         => api.request('POST',   '/applications/batch-delete', { ids }),
};

export const impactAPI = {
  jobs:  (ids) => api.request('GET', `/impact/jobs?ids=${ids.join(',')}`),
  tasks: (ids) => api.request('GET', `/impact/tasks?ids=${ids.join(',')}`),
};

export const generationAPI = {
  generateVersions: (taskId, description, jobTitle, tags) =>
    api.request('POST', '/generate-versions', { taskId, description, jobTitle, tags }),
  generateVersionsBatch: () =>
    api.request('POST', '/generate-versions-batch', {}),
};

export const importAPI = {
  importExperience: (jobs) => api.request('POST', '/import/experience', { jobs }),
  importEducation: (data) => api.request('POST', '/import/education', data),
};

export const dashboardAPI = {
  getSummary: () => api.request('GET', '/dashboard'),
};

export const documentAPI = {
  list:          ()           => api.request('GET',    '/documents'),
  get:           (id)         => api.request('GET',    `/documents/${id}`),
  create:        (title, content) => api.request('POST', '/documents', { title, content }),
  update:        (id, title, content) => api.request('PUT', `/documents/${id}`, { title, content }),
  delete:        (id)         => api.request('DELETE', `/documents/${id}`),
  generateDraft:   (jobAdText)        => api.request('POST', '/documents/generate-draft', { jobAdText }),
  blankTemplate:   (includeAllTasks)  => api.request('POST', '/documents/blank-template', { includeAllTasks }),
  exportPdf:     (id)         => api.request('POST',   `/documents/${id}/export-pdf`, {}),
  exportDocx:    (id)         => api.request('POST',   `/documents/${id}/export-docx`, {}),
};

export const exportAPI = {
  exportApplication: (id, exportPath, copyReferences = false) =>
    api.request('POST', `/export/application/${id}`, { exportPath, copyReferences }),

  getBackupData: () => api.request('GET', '/export/backup'),

  restoreBackup: (data) => api.request('POST', '/export/restore', data),

  openFolder: (folderPath) => api.request('POST', '/export/open-folder', { folderPath }),

  browseFile: ()           => api.request('POST', '/export/browse-file', {}),
  openFile:   (filePath)   => api.request('POST', '/export/open-file',   { filePath }),
};

export const profileAPI = {
  list:       ()                    => api.request('GET',    '/profiles'),
  get:        (id)                  => api.request('GET',    `/profiles/${id}`),
  create:     (name, description)   => api.request('POST',   '/profiles', { name, description }),
  update:     (id, name, description) => api.request('PUT',  `/profiles/${id}`, { name, description }),
  delete:       (id)                => api.request('DELETE', `/profiles/${id}`),
  batchDelete:  (ids, { deleteCvDocuments = false } = {}) =>
    api.request('POST', '/profiles/batch-delete', { ids, deleteCvDocuments }),
  setBaseCv:  (profileId, cvDocumentId) =>
    api.request('PUT', `/profiles/${profileId}/set-base-cv`, { cv_document_id: cvDocumentId }),
};

export const cvDocumentAPI = {
  list:       ()               => api.request('GET',    '/cv-documents'),
  get:        (id)             => api.request('GET',    `/cv-documents/${id}`),
  create:     (fields)         => api.request('POST',   '/cv-documents', fields),
  update:     (id, fields)     => api.request('PUT',    `/cv-documents/${id}`, fields),
  delete:       (id)           => api.request('DELETE', `/cv-documents/${id}`),
  batchDelete:  (ids)          => api.request('POST',   '/cv-documents/batch-delete', { ids }),
  batchMove:    (ids, profileId) => api.request('POST', '/cv-documents/batch-move', { ids, profileId }),
  exportPdf:  (id)             => api.request('POST',   `/cv-documents/${id}/export-pdf`, {}),
  exportDocx: (id)             => api.request('POST',   `/cv-documents/${id}/export-docx`, {}),
};

export const aiChatAPI = {
  // Sends a chat turn to the AI. The server builds and anonymises the pool
  // context server-side — no PII is sent from the client.
  //
  // messages          – full conversation history [{role, content}]
  // jobAd             – job ad text (optional)
  // documentStructure – simplified description of the current CV state (optional)
  // persona           – current reviewer persona string (optional)
  chat: (messages, jobAd = '', documentStructure = '', persona = '') =>
    api.request('POST', '/ai/chat', { messages, jobAd, documentStructure, persona }),
};
