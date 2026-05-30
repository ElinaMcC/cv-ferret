// Temporary in-memory database stub
// Replace with better-sqlite3 once native module issues are resolved

const fs = require('fs');
const path = require('path');

// Replace characters that look like hyphens but fall outside the MacRomanEncoding
// used by pdfkit for Helvetica AFM, causing them to render as placeholder boxes.
// U+2011 NON-BREAKING HYPHEN is the main culprit (inserted by Word in compound words).
function normalizeText(text) {
  if (!text) return text;
  return text
    .replace(/‑/g, '-')  // NON-BREAKING HYPHEN → HYPHEN-MINUS
    .replace(/­/g, '-'); // SOFT HYPHEN → HYPHEN-MINUS (usually invisible but safe)
}

let dataFile;
let settingsFile;
let refLettersDir;
let settings = {
  anthropicApiKey: '',
  coverLetterSamplesDir: '',
  exportPath: '',
  aiEnabled: true,
  cvOrder: 'newest-first',   // 'newest-first' | 'oldest-first'
  pageSize: 'A4',            // 'A4' | 'letter'
  cvLocale: 'en-GB',         // BCP-47 locale for CV date formatting
  cvFileName: 'CV',          // template for CV file name; tokens: {name} {date} {employer} {role}
  coverLetterFileName: 'Cover Letter', // template for cover letter file name; same tokens
  ai_pii_exclusions: [],     // user-defined extra terms to strip before any AI call
  ai_personas: [],           // saved AI reviewer personas: [{id, name, description}]
};

let data = {
  jobs: [],
  tasks: [],
  task_versions: [],
  task_version_tags: [],
  references: [],
  applications: [],
  compositions: [],
  education: [],
  training: [],
  skills: [],
  languages: [],
  personal: {},
  documents: [],
  profiles: [],
  cv_documents: [],
};

let nextJobId = 1;
let nextTaskId = 1;
let nextVersionId = 1;
let nextTagId = 1;
let nextAppId = 1;
let nextEducationId = 1;
let nextTrainingId = 1;
let nextRefId = 1;
let nextCompositionId = 1;
let nextDocumentId = 1;
let nextProfileId = 1;
let nextCvDocumentId = 1;

function initializeDatabase(userDataPath) {
  // Reset all in-memory state. This makes initializeDatabase() idempotent —
  // safe to call multiple times (important for tests and re-init scenarios).
  data = {
    jobs: [], tasks: [], task_versions: [], task_version_tags: [],
    references: [], applications: [], compositions: [], education: [],
    training: [], skills: [], languages: [], personal: {},
    documents: [], profiles: [], cv_documents: [],
  };
  nextJobId = 1; nextTaskId = 1; nextVersionId = 1; nextTagId = 1;
  nextAppId = 1; nextEducationId = 1; nextTrainingId = 1; nextRefId = 1;
  nextCompositionId = 1; nextDocumentId = 1; nextProfileId = 1; nextCvDocumentId = 1;

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  dataFile = path.join(userDataPath, 'cv-builder-data.json');
  settingsFile = path.join(userDataPath, 'cv-builder-settings.json');
  refLettersDir = path.join(userDataPath, 'reference_letters');
  if (!fs.existsSync(refLettersDir)) fs.mkdirSync(refLettersDir, { recursive: true });

  if (fs.existsSync(settingsFile)) {
    try {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
    } catch (err) {
      console.error('[db] Failed to load settings:', err.message);
    }
  }

  // Load existing data if available
  if (fs.existsSync(dataFile)) {
    try {
      const fileData = fs.readFileSync(dataFile, 'utf8');
      data = JSON.parse(fileData);

      // Migrate from old experiences model to new tasks/versions model
      if (data.experiences && data.experiences.length > 0 && (!data.tasks || data.tasks.length === 0)) {
        console.log('[db] Migrating experiences to tasks/versions...');
        migrateExperiencesToTasks();
      }

      // Ensure new top-level collections exist in older data files
      if (!data.education) data.education = [];
      if (!data.training) data.training = [];
      if (!data.skills) data.skills = [];
      if (!data.languages) data.languages = [];
      if (!data.personal) data.personal = {};
      if (!data.compositions) data.compositions = [];
      if (!data.documents) data.documents = [];
      if (!data.profiles) data.profiles = [];
      if (!data.cv_documents) data.cv_documents = [];
      // Migrate: ensure all cv_documents have a notes field
      data.cv_documents.forEach(d => { if (d.notes === undefined) d.notes = ''; });
      // Migrate: ensure all applications have document_id and cv_file_path fields
      data.applications.forEach(a => {
        if (a.document_id    === undefined) a.document_id    = null;
        if (a.cv_file_path   === undefined) a.cv_file_path   = null;
        if (a.cv_document_id === undefined) a.cv_document_id = null;
      });

      // Ensure all jobs have a location field
      data.jobs.forEach(j => { if (j.location === undefined) j.location = ''; });

      // Ensure all task_versions have role_priorities
      data.task_versions.forEach(v => {
        if (!v.role_priorities) v.role_priorities = [];
      });

      // Migrate: replace non-breaking hyphens (U+2011) with regular hyphens.
      // Word processors insert U+2011 in compound words to prevent line breaks,
      // but it is outside MacRomanEncoding so pdfkit renders it as a box glyph.
      data.task_versions.forEach(v => {
        if (v.description) v.description = normalizeText(v.description);
      });

      // Reset IDs based on existing data
      if (data.jobs.length > 0) nextJobId = Math.max(...data.jobs.map(j => j.id)) + 1;
      if (data.tasks.length > 0) nextTaskId = Math.max(...data.tasks.map(t => t.id)) + 1;
      if (data.task_versions.length > 0) nextVersionId = Math.max(...data.task_versions.map(v => v.id)) + 1;
      if (data.task_version_tags.length > 0) nextTagId = Math.max(...data.task_version_tags.map(t => t.id)) + 1;
      if (data.applications.length > 0) nextAppId = Math.max(...data.applications.map(a => a.id)) + 1;
      if (data.education.length > 0) nextEducationId = Math.max(...data.education.map(e => e.id)) + 1;
      if (data.training.length > 0) nextTrainingId = Math.max(...data.training.map(t => t.id)) + 1;
      if (data.references.length > 0) nextRefId = Math.max(...data.references.map(r => r.id)) + 1;
      if (data.compositions.length > 0) nextCompositionId = Math.max(...data.compositions.map(c => c.id)) + 1;
      if (data.documents.length > 0) nextDocumentId = Math.max(...data.documents.map(d => d.id)) + 1;
      if (data.profiles.length > 0) nextProfileId = Math.max(...data.profiles.map(p => p.id)) + 1;
      if (data.cv_documents.length > 0) nextCvDocumentId = Math.max(...data.cv_documents.map(d => d.id)) + 1;
      console.log('[db] Loaded data from', dataFile);
    } catch (err) {
      console.error('[db] Failed to load data:', err.message);
    }
  }
}

function saveData() {
  if (dataFile) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  }
}

function migrateExperiencesToTasks() {
  const newTasks = [];
  const newVersions = [];
  const newTags = [];

  // Convert each experience to a task + one default version
  data.experiences.forEach((exp, index) => {
    const task = {
      id: nextTaskId++,
      job_id: exp.job_id,
      display_order: index,
      created_at: exp.created_at,
    };
    newTasks.push(task);

    const version = {
      id: nextVersionId++,
      task_id: task.id,
      description: exp.description,
      is_default: true,
      created_at: exp.created_at,
    };
    newVersions.push(version);

    // Convert tags for this experience
    const expTags = data.experience_tags.filter(t => t.experience_id === exp.id);
    expTags.forEach(expTag => {
      newTags.push({
        id: nextTagId++,
        task_version_id: version.id,
        tag: expTag.tag,
      });
    });
  });

  // Replace data atomically
  data.tasks = newTasks;
  data.task_versions = newVersions;
  data.task_version_tags = newTags;
  delete data.experiences;
  delete data.experience_tags;

  saveData();
  console.log('[db] Migration complete:', newTasks.length, 'tasks created');
}

function createJob(employer, jobTitle, startDate, endDate, location, notes) {
  const job = {
    id: nextJobId++,
    employer,
    job_title: jobTitle,
    start_date: startDate,
    end_date: endDate,
    location: location || '',
    notes,
    created_at: new Date().toISOString(),
  };
  data.jobs.push(job);
  saveData();
  return job.id;
}

function updateJob(jobId, employer, jobTitle, startDate, endDate, location, notes) {
  const job = data.jobs.find(j => j.id === jobId);
  if (job) {
    job.employer = employer;
    job.job_title = jobTitle;
    job.start_date = startDate;
    job.end_date = endDate;
    job.location = location || '';
    job.notes = notes;
  }
  saveData();
}

function createTask(jobId) {
  const existingTasksForJob = data.tasks.filter(t => t.job_id === jobId);
  const task = {
    id: nextTaskId++,
    job_id: jobId,
    display_order: existingTasksForJob.length,
    created_at: new Date().toISOString(),
  };
  data.tasks.push(task);
  saveData();
  return task.id;
}

function deleteTask(taskId) {
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  const versionsToDelete = data.task_versions.filter(v => v.task_id === taskId).map(v => v.id);
  data.task_versions = data.task_versions.filter(v => v.task_id !== taskId);
  data.task_version_tags = data.task_version_tags.filter(t => !versionsToDelete.includes(t.task_version_id));
  saveData();
}

function getTasksByJob(jobId) {
  const tasks = data.tasks.filter(t => t.job_id === jobId);
  return tasks.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map(task => {
    const versions = data.task_versions.filter(v => v.task_id === task.id);
    return {
      ...task,
      versions: versions.map(version => ({
        ...version,
        tags: data.task_version_tags
          .filter(t => t.task_version_id === version.id)
          .map(t => t.tag),
      })),
    };
  });
}

function getAllJobsWithTasks() {
  return data.jobs.map(job => ({ ...job, tasks: getTasksByJob(job.id) }));
}

function reorderTasks(jobId, taskIds) {
  taskIds.forEach((taskId, index) => {
    const task = data.tasks.find(t => t.id === taskId && t.job_id === jobId);
    if (task) {
      task.display_order = index;
    }
  });
  saveData();
}

function createTaskVersion(taskId, description, tags, isDefault, rolePriorities = []) {
  // If no versions exist yet for this task, make it default
  const existingVersions = data.task_versions.filter(v => v.task_id === taskId);
  const shouldDefault = isDefault === true || (isDefault !== false && existingVersions.length === 0);

  const version = {
    id: nextVersionId++,
    task_id: taskId,
    description: normalizeText(description),
    is_default: shouldDefault,
    role_priorities: rolePriorities,
    created_at: new Date().toISOString(),
  };
  data.task_versions.push(version);

  tags.forEach(tag => {
    data.task_version_tags.push({
      id: nextTagId++,
      task_version_id: version.id,
      tag,
    });
  });

  saveData();
  return version.id;
}

function updateTaskVersion(versionId, description, tags, rolePriorities = []) {
  const version = data.task_versions.find(v => v.id === versionId);
  if (version) {
    version.description = normalizeText(description);
    version.role_priorities = rolePriorities;
  }

  data.task_version_tags = data.task_version_tags.filter(t => t.task_version_id !== versionId);
  tags.forEach(tag => {
    data.task_version_tags.push({
      id: nextTagId++,
      task_version_id: versionId,
      tag,
    });
  });

  saveData();
}

function deleteTaskVersion(versionId) {
  const version = data.task_versions.find(v => v.id === versionId);
  if (!version) return { taskDeleted: false };

  const taskId = version.task_id;
  const remainingVersions = data.task_versions.filter(v => v.task_id === taskId && v.id !== versionId);

  // Delete the version and its tags
  data.task_versions = data.task_versions.filter(v => v.id !== versionId);
  data.task_version_tags = data.task_version_tags.filter(t => t.task_version_id !== versionId);

  // If this was the last version, delete the task too
  if (remainingVersions.length === 0) {
    deleteTask(taskId);
    saveData();
    return { taskDeleted: true };
  }

  // If this was the default version, promote the earliest remaining version
  if (version.is_default && remainingVersions.length > 0) {
    const earliestVersion = remainingVersions.sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    earliestVersion.is_default = true;
  }

  saveData();
  return { taskDeleted: false };
}

function setDefaultVersion(versionId) {
  const version = data.task_versions.find(v => v.id === versionId);
  if (!version) return;

  const taskId = version.task_id;
  // Clear default flag on all versions of this task
  data.task_versions.forEach(v => {
    if (v.task_id === taskId) {
      v.is_default = false;
    }
  });
  // Set this version as default
  version.is_default = true;
  saveData();
}

function getAllJobs() {
  return data.jobs;
}

function getAllRoles() {
  const roles = new Set();
  data.task_versions.forEach(v => {
    (v.role_priorities || []).forEach(rp => roles.add(rp.role));
  });
  return Array.from(roles).sort();
}

function getAllTags() {
  const tags = new Set();
  data.task_version_tags.forEach(t => tags.add(t.tag));
  return Array.from(tags).sort();
}

function searchTasks(query) {
  const searchTerm = query.toLowerCase();
  const results = [];

  data.task_versions.forEach(version => {
    const task = data.tasks.find(t => t.id === version.task_id);
    if (!task) return;

    const job = data.jobs.find(j => j.id === task.job_id);
    if (!job) return;

    // Get tags for this version
    const tags = data.task_version_tags
      .filter(t => t.task_version_id === version.id)
      .map(t => t.tag);

    // Check if any of the search criteria match
    const matches =
      version.description.toLowerCase().includes(searchTerm) ||
      job.employer.toLowerCase().includes(searchTerm) ||
      job.job_title.toLowerCase().includes(searchTerm) ||
      tags.some(tag => tag.toLowerCase().includes(searchTerm));

    if (matches) {
      results.push({
        ...version,
        task_id: task.id,
        job_id: task.job_id,
        employer: job.employer,
        job_title: job.job_title,
        tags,
      });
    }
  });

  return results;
}

const MONTH_NAMES = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseEndDate(str) {
  if (!str) return null;
  // YYYY-MM (stored by older type="month" inputs)
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split('-').map(Number);
    return new Date(y, m - 1);
  }
  // "Mon YYYY" or "Month YYYY" e.g. "Jun 2025", "June 2025"
  const match = str.match(/^([a-zA-Z]+)\s+(\d{4})$/);
  if (match) {
    const key = match[1].toLowerCase().slice(0, 3);
    const month = MONTH_NAMES[key];
    const year = parseInt(match[2]);
    if (month !== undefined && !isNaN(year)) return new Date(year, month);
  }
  return null;
}

function sortByEndDateDesc(entries) {
  return [...entries].sort((a, b) => {
    if (!a.end_date && !b.end_date) return 0;
    if (!a.end_date) return -1;
    if (!b.end_date) return 1;
    const dateA = parseEndDate(a.end_date);
    const dateB = parseEndDate(b.end_date);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB - dateA;
  });
}

function createEducation(institution, title, endDate, notes) {
  const entry = { id: nextEducationId++, institution, title, end_date: endDate, notes: normalizeText(notes), created_at: new Date().toISOString() };
  data.education.push(entry);
  saveData();
  return entry.id;
}

function updateEducation(id, institution, title, endDate, notes) {
  const entry = data.education.find(e => e.id === id);
  if (entry) { entry.institution = institution; entry.title = title; entry.end_date = endDate; entry.notes = normalizeText(notes); }
  saveData();
}

function deleteEducation(id) {
  data.education = data.education.filter(e => e.id !== id);
  saveData();
}

function getAllEducation() {
  return sortByEndDateDesc(data.education);
}

function createTraining(institution, title, endDate, notes) {
  const entry = { id: nextTrainingId++, institution, title, end_date: endDate, notes, created_at: new Date().toISOString() };
  data.training.push(entry);
  saveData();
  return entry.id;
}

function updateTraining(id, institution, title, endDate, notes) {
  const entry = data.training.find(e => e.id === id);
  if (entry) { entry.institution = institution; entry.title = title; entry.end_date = endDate; entry.notes = notes; }
  saveData();
}

function deleteTraining(id) {
  data.training = data.training.filter(e => e.id !== id);
  saveData();
}

function getAllTraining() {
  return sortByEndDateDesc(data.training);
}

function getSkills() {
  return data.skills;
}

function updateSkills(skills) {
  data.skills = skills;
  saveData();
}

function getLanguages() {
  return data.languages;
}

function updateLanguages(languages) {
  data.languages = languages;
  saveData();
}

function getRefLettersDir() {
  return refLettersDir;
}

function getAllReferences() {
  return data.references.map(ref => {
    const job = ref.job_id ? data.jobs.find(j => j.id === ref.job_id) : null;
    return { ...ref, job_title: job?.job_title || null, employer: job?.employer || null };
  });
}

function createReference(fileName, storedName, jobId, tags, notes) {
  const ref = {
    id: nextRefId++,
    file_name: fileName,
    stored_name: storedName,
    job_id: jobId || null,
    tags: tags || [],
    notes: notes || '',
    created_at: new Date().toISOString(),
  };
  data.references.push(ref);
  saveData();
  return ref.id;
}

function updateReference(id, jobId, tags, notes) {
  const ref = data.references.find(r => r.id === id);
  if (ref) {
    ref.job_id = jobId || null;
    ref.tags = tags || [];
    ref.notes = notes || '';
  }
  saveData();
}

function deleteReference(id) {
  const ref = data.references.find(r => r.id === id);
  data.references = data.references.filter(r => r.id !== id);
  saveData();
  return ref ? ref.stored_name : null;
}

function getReference(id) {
  return data.references.find(r => r.id === id) || null;
}

function getSettings() {
  return { ...settings };
}

function updateSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  if (settingsFile) {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  }
}

function getVersionWithTags(versionId) {
  const version = data.task_versions.find(v => v.id === versionId);
  if (!version) return null;
  const tags = data.task_version_tags
    .filter(t => t.task_version_id === versionId)
    .map(t => t.tag);
  return { ...version, tags };
}

function getTaskWithVersions(taskId) {
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return null;
  const versions = data.task_versions
    .filter(v => v.task_id === taskId)
    .map(version => ({
      ...version,
      tags: data.task_version_tags
        .filter(t => t.task_version_id === version.id)
        .map(t => t.tag),
    }));
  return { ...task, versions };
}

function getAllCompositions() {
  return data.compositions.map(({ id, name, mode, created_at, updated_at }) => ({ id, name, mode, created_at, updated_at }));
}

function getComposition(id) {
  return data.compositions.find(c => c.id === id) || null;
}

function createComposition(name, payload) {
  const now = new Date().toISOString();
  const comp = { id: nextCompositionId++, name, ...payload, created_at: now, updated_at: now };
  data.compositions.push(comp);
  saveData();
  return comp.id;
}

function updateComposition(id, name, payload) {
  const comp = data.compositions.find(c => c.id === id);
  if (comp) {
    comp.name = name;
    Object.assign(comp, payload);
    comp.updated_at = new Date().toISOString();
  }
  saveData();
}

function deleteComposition(id) {
  data.compositions = data.compositions.filter(c => c.id !== id);
  saveData();
}

function importExperience(jobs) {
  const result = { jobs: 0, tasks: 0 };
  for (const job of jobs) {
    const jobId = createJob(
      (job.employer || '').trim(),
      (job.job_title || '').trim(),
      job.start_date || null,
      job.end_date || null,
      (job.location || '').trim(),
      (job.notes || '').trim()
    );
    result.jobs++;
    for (const task of (job.tasks || [])) {
      const desc = (task.description || '').trim();
      if (!desc) continue;
      const taskId = createTask(jobId);
      createTaskVersion(taskId, desc, task.tags || [], true, task.role_priorities || []);
      result.tasks++;
    }
  }
  return result;
}

function importEducation({ education = [], training = [], skills = [], languages = [] }) {
  const result = { education: 0, training: 0, skillsAdded: 0, languages: 0 };

  for (const e of education) {
    createEducation((e.institution || '').trim(), (e.title || '').trim(), (e.end_date || '').trim(), (e.notes || '').trim());
    result.education++;
  }

  for (const t of training) {
    createTraining((t.institution || '').trim(), (t.title || '').trim(), (t.end_date || '').trim(), (t.notes || '').trim());
    result.training++;
  }

  if (skills.length > 0) {
    const existing = getSkills();
    const incoming = skills.map(s => String(s).trim()).filter(Boolean);
    const merged = [...new Set([...existing, ...incoming])];
    updateSkills(merged);
    result.skillsAdded = merged.length - existing.length;
  }

  if (languages.length > 0) {
    const merged = [...getLanguages()];
    for (const lang of languages) {
      if (!lang.language) continue;
      const idx = merged.findIndex(l => l.language === lang.language);
      if (idx >= 0) merged[idx] = { language: lang.language, level: lang.level };
      else merged.push({ language: lang.language, level: lang.level });
      result.languages++;
    }
    updateLanguages(merged);
  }

  return result;
}

function getAllDocuments() {
  return [...data.documents].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(({ id, title, created_at, updated_at }) => ({ id, title, created_at, updated_at }));
}

function getDocument(id) {
  return data.documents.find(d => d.id === id) || null;
}

function createDocument(title, content) {
  const now = new Date().toISOString();
  const doc = { id: nextDocumentId++, title, content: content || '', created_at: now, updated_at: now };
  data.documents.push(doc);
  saveData();
  return doc.id;
}

function updateDocument(id, title, content) {
  const doc = data.documents.find(d => d.id === id);
  if (doc) {
    doc.title = title;
    doc.content = content;
    doc.updated_at = new Date().toISOString();
  }
  saveData();
}

function deleteDocument(id) {
  data.documents = data.documents.filter(d => d.id !== id);
  saveData();
}

function getAllData() {
  return JSON.parse(JSON.stringify(data));
}

function restoreData(newData) {
  if (!newData || !Array.isArray(newData.jobs)) throw new Error('Invalid backup file');

  performAutoBackup();

  data = {
    jobs: newData.jobs || [],
    tasks: newData.tasks || [],
    task_versions: newData.task_versions || [],
    task_version_tags: newData.task_version_tags || [],
    references: newData.references || [],
    applications: newData.applications || [],
    compositions: newData.compositions || [],
    education: newData.education || [],
    training: newData.training || [],
    skills: newData.skills || [],
    languages: newData.languages || [],
    personal: newData.personal || {},
    documents: newData.documents || [],
    profiles: newData.profiles || [],
    cv_documents: newData.cv_documents || [],
  };

  nextJobId         = data.jobs.length           > 0 ? Math.max(...data.jobs.map(j => j.id))               + 1 : 1;
  nextTaskId        = data.tasks.length          > 0 ? Math.max(...data.tasks.map(t => t.id))              + 1 : 1;
  nextVersionId     = data.task_versions.length  > 0 ? Math.max(...data.task_versions.map(v => v.id))      + 1 : 1;
  nextTagId         = data.task_version_tags.length > 0 ? Math.max(...data.task_version_tags.map(t => t.id)) + 1 : 1;
  nextAppId         = data.applications.length   > 0 ? Math.max(...data.applications.map(a => a.id))       + 1 : 1;
  nextEducationId   = data.education.length      > 0 ? Math.max(...data.education.map(e => e.id))          + 1 : 1;
  nextTrainingId    = data.training.length       > 0 ? Math.max(...data.training.map(t => t.id))           + 1 : 1;
  nextRefId         = data.references.length     > 0 ? Math.max(...data.references.map(r => r.id))         + 1 : 1;
  nextCompositionId = data.compositions.length   > 0 ? Math.max(...data.compositions.map(c => c.id))       + 1 : 1;
  nextDocumentId    = data.documents.length      > 0 ? Math.max(...data.documents.map(d => d.id))          + 1 : 1;
  nextProfileId     = data.profiles.length       > 0 ? Math.max(...data.profiles.map(p => p.id))           + 1 : 1;
  nextCvDocumentId  = data.cv_documents.length   > 0 ? Math.max(...data.cv_documents.map(d => d.id))       + 1 : 1;

  saveData();
}

function performAutoBackup() {
  if (!dataFile || !fs.existsSync(dataFile)) return;
  const backupsDir = path.join(path.dirname(dataFile), 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.copyFileSync(dataFile, path.join(backupsDir, `backup-${ts}.json`));
  const files = fs.readdirSync(backupsDir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .sort();
  if (files.length > 10) {
    files.slice(0, files.length - 10).forEach(f => fs.unlinkSync(path.join(backupsDir, f)));
  }
  console.log(`[db] Auto-backup saved (${ts})`);
}

function getCompositionPoints(compositionId) {
  const comp = data.compositions.find(c => c.id === compositionId);
  if (!comp || !comp.selections) return [];
  return Object.values(comp.selections)
    .filter(sel => sel.included)
    .map(sel => {
      if (sel.versionId === 'ai-draft') return sel.aiDraft || null;
      return data.task_versions.find(v => v.id === sel.versionId)?.description || null;
    })
    .filter(Boolean);
}

function getAllApplications() {
  return [...data.applications].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function getApplication(id) {
  return data.applications.find(a => a.id === id) || null;
}

function createApplication({ employer, jobTitle, url, jobAdText, status, compositionId, documentId, cvDocumentId, cvFilePath, referenceIds }) {
  const app = {
    id: nextAppId++,
    employer: employer || '',
    job_title: jobTitle || '',
    url: url || '',
    job_ad_text: jobAdText || '',
    status: status || 'Saved',
    composition_id: compositionId  || null,
    document_id:    documentId     || null,
    cv_document_id: cvDocumentId   || null,
    cv_file_path:   cvFilePath     || null,
    reference_ids: referenceIds || [],
    notes: [],
    applied_at: null,
    created_at: new Date().toISOString(),
  };
  data.applications.push(app);
  saveData();
  return app.id;
}

function updateApplication(id, fields) {
  const app = data.applications.find(a => a.id === id);
  if (app) Object.assign(app, fields);
  saveData();
}

function deleteApplication(id) {
  data.applications = data.applications.filter(a => a.id !== id);
  saveData();
}

function getPersonal() {
  return data.personal;
}

function updatePersonal(personalData) {
  data.personal = { ...data.personal, ...personalData };
  saveData();
}

// ── Profiles ──────────────────────────────────────────────────────────────────

function getAllProfiles() {
  return data.profiles.map(({ id, name, description, base_cv_id, created_at, updated_at }) =>
    ({ id, name, description, base_cv_id, created_at, updated_at })
  );
}

function getProfile(id) {
  return data.profiles.find(p => p.id === id) || null;
}

function createProfile(name, description) {
  const now = new Date().toISOString();
  const profile = { id: nextProfileId++, name, description: description || '', base_cv_id: null, created_at: now, updated_at: now };
  data.profiles.push(profile);
  saveData();
  return profile.id;
}

function updateProfile(id, name, description) {
  const profile = data.profiles.find(p => p.id === id);
  if (profile) {
    profile.name = name;
    profile.description = description || '';
    profile.updated_at = new Date().toISOString();
  }
  saveData();
}

function deleteProfile(id) {
  data.profiles = data.profiles.filter(p => p.id !== id);
  // Unlink any cv_documents that belonged to this profile
  data.cv_documents.forEach(d => { if (d.profile_id === id) d.profile_id = null; });
  saveData();
}

function setProfileBaseCv(profileId, cvDocumentId) {
  const profile = data.profiles.find(p => p.id === profileId);
  if (!profile) return;
  // Clear is_base on all cv_documents in this profile
  data.cv_documents.forEach(d => { if (d.profile_id === profileId) d.is_base = false; });
  // Set the new base
  const doc = data.cv_documents.find(d => d.id === cvDocumentId);
  if (doc) {
    doc.profile_id = profileId; // ensure it belongs to this profile
    doc.is_base = true;
  }
  profile.base_cv_id = cvDocumentId;
  profile.updated_at = new Date().toISOString();
  saveData();
}

// ── CV Documents ──────────────────────────────────────────────────────────────

function getAllCvDocuments() {
  return [...data.cv_documents]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(({ id, title, notes, profile_id, is_base, job_ad_text, created_at, updated_at }) =>
      ({ id, title, notes: notes || '', profile_id, is_base, job_ad_text, created_at, updated_at })
    );
}

function getCvDocument(id) {
  return data.cv_documents.find(d => d.id === id) || null;
}

function createCvDocument(title, contentHtml, profileId, jobAdText, notes) {
  const now = new Date().toISOString();
  const doc = {
    id: nextCvDocumentId++,
    title: title || 'Untitled CV',
    content_html: contentHtml || '',
    profile_id: profileId || null,
    is_base: false,
    job_ad_text: jobAdText || '',
    notes: notes || '',
    created_at: now,
    updated_at: now,
  };
  data.cv_documents.push(doc);
  saveData();
  return doc.id;
}

function updateCvDocument(id, fields) {
  const doc = data.cv_documents.find(d => d.id === id);
  if (doc) {
    if (fields.title        !== undefined) doc.title        = fields.title;
    if (fields.content_html !== undefined) doc.content_html = fields.content_html;
    if (fields.profile_id   !== undefined) doc.profile_id   = fields.profile_id;
    if (fields.job_ad_text  !== undefined) doc.job_ad_text  = fields.job_ad_text;
    if (fields.notes        !== undefined) doc.notes        = fields.notes;
    doc.updated_at = new Date().toISOString();
  }
  saveData();
}

function deleteCvDocument(id) {
  data.cv_documents = data.cv_documents.filter(d => d.id !== id);
  // Clear base_cv_id on any profile that pointed to this document
  data.profiles.forEach(p => { if (p.base_cv_id === id) p.base_cv_id = null; });
  // Clear document_id on any application that referenced this document
  data.applications.forEach(a => { if (a.document_id === id) a.document_id = null; });
  saveData();
}

module.exports = {
  initializeDatabase,
  createJob,
  updateJob,
  getAllJobs,
  getAllJobsWithTasks,
  createTask,
  deleteTask,
  getTasksByJob,
  reorderTasks,
  createTaskVersion,
  updateTaskVersion,
  deleteTaskVersion,
  setDefaultVersion,
  getAllTags,
  getAllRoles,
  searchTasks,
  createEducation,
  updateEducation,
  deleteEducation,
  getAllEducation,
  createTraining,
  updateTraining,
  deleteTraining,
  getAllTraining,
  getSkills,
  updateSkills,
  getLanguages,
  updateLanguages,
  getPersonal,
  updatePersonal,
  getSettings,
  updateSettings,
  getVersionWithTags,
  getTaskWithVersions,
  getRefLettersDir,
  getAllReferences,
  createReference,
  updateReference,
  deleteReference,
  getReference,
  getAllCompositions,
  getComposition,
  createComposition,
  updateComposition,
  deleteComposition,
  getAllApplications,
  getApplication,
  createApplication,
  updateApplication,
  deleteApplication,
  getCompositionPoints,
  importExperience,
  importEducation,
  getAllData,
  restoreData,
  performAutoBackup,
  getAllDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  getAllProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  setProfileBaseCv,
  getAllCvDocuments,
  getCvDocument,
  createCvDocument,
  updateCvDocument,
  deleteCvDocument,
};
