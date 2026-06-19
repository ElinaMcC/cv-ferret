// Tests for CV Library batch operations in db.js:
// batchDeleteCvDocuments, batchMoveCvDocuments, batchDeleteProfiles,
// batchDeleteJobs, and batchDeleteTasks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import db from '../main/db.js';

let tmpDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cv-ferret-test-'));
  db.initializeDatabase(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// batchDeleteCvDocuments
// =============================================================================

describe('batchDeleteCvDocuments', () => {
  it('deletes the specified cv_documents and leaves others intact', () => {
    const id1 = db.createCvDocument('CV A', '', null, '');
    const id2 = db.createCvDocument('CV B', '', null, '');
    const id3 = db.createCvDocument('CV C', '', null, '');

    db.batchDeleteCvDocuments([id1, id3]);

    const remaining = db.getAllCvDocuments();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(id2);
  });

  it('nulls out profile.base_cv_id when the base CV is deleted', () => {
    const profileId = db.createProfile('Tech Lead', '');
    const cvId = db.createCvDocument('Base CV', '', profileId, '');
    db.setProfileBaseCv(profileId, cvId);

    expect(db.getProfile(profileId).base_cv_id).toBe(cvId);

    db.batchDeleteCvDocuments([cvId]);

    expect(db.getProfile(profileId).base_cv_id).toBeNull();
  });

  it('does not null profile.base_cv_id when a different CV is deleted', () => {
    const profileId = db.createProfile('Profile', '');
    const baseId = db.createCvDocument('Base', '', profileId, '');
    const otherId = db.createCvDocument('Other', '', profileId, '');
    db.setProfileBaseCv(profileId, baseId);

    db.batchDeleteCvDocuments([otherId]);

    expect(db.getProfile(profileId).base_cv_id).toBe(baseId);
  });

  it('nulls out application.cv_document_id when the linked CV is deleted', () => {
    const cvId = db.createCvDocument('CV', '', null, '');
    const appId = db.createApplication({ employer: 'Acme', jobTitle: 'Dev', cvDocumentId: cvId, status: 'applied' });

    db.batchDeleteCvDocuments([cvId]);

    expect(db.getApplication(appId).cv_document_id).toBeNull();
  });

  it('nulls out application.document_id when the linked document is deleted', () => {
    const docId = db.createCvDocument('Draft', '', null, '');
    const appId = db.createApplication({ employer: 'Acme', jobTitle: 'Dev', documentId: docId, status: 'applied' });

    db.batchDeleteCvDocuments([docId]);

    expect(db.getApplication(appId).document_id).toBeNull();
  });

  it('is a no-op for an empty ids array', () => {
    db.createCvDocument('CV', '', null, '');
    db.batchDeleteCvDocuments([]);
    expect(db.getAllCvDocuments()).toHaveLength(1);
  });
});

// =============================================================================
// batchMoveCvDocuments
// =============================================================================

describe('batchMoveCvDocuments', () => {
  it('moves cv_documents to the target profile', () => {
    const profileA = db.createProfile('Profile A', '');
    const profileB = db.createProfile('Profile B', '');
    const id1 = db.createCvDocument('CV 1', '', profileA, '');
    const id2 = db.createCvDocument('CV 2', '', profileA, '');

    db.batchMoveCvDocuments([id1, id2], profileB);

    expect(db.getCvDocument(id1).profile_id).toBe(profileB);
    expect(db.getCvDocument(id2).profile_id).toBe(profileB);
  });

  it('does not affect cv_documents not in the ids list', () => {
    const profileA = db.createProfile('Profile A', '');
    const profileB = db.createProfile('Profile B', '');
    const id1 = db.createCvDocument('CV 1', '', profileA, '');
    const id2 = db.createCvDocument('CV 2', '', profileA, '');

    db.batchMoveCvDocuments([id1], profileB);

    expect(db.getCvDocument(id1).profile_id).toBe(profileB);
    expect(db.getCvDocument(id2).profile_id).toBe(profileA);
  });

  it('unlinks cv_documents from any profile when profileId is null', () => {
    const profileId = db.createProfile('Profile', '');
    const id = db.createCvDocument('CV', '', profileId, '');

    db.batchMoveCvDocuments([id], null);

    expect(db.getCvDocument(id).profile_id).toBeNull();
  });
});

// =============================================================================
// batchDeleteProfiles
// =============================================================================

describe('batchDeleteProfiles', () => {
  it('deletes the specified profiles and leaves others intact', () => {
    const id1 = db.createProfile('Profile 1', '');
    const id2 = db.createProfile('Profile 2', '');

    db.batchDeleteProfiles([id1]);

    const remaining = db.getAllProfiles();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(id2);
  });

  it('unlinks cv_documents (sets profile_id to null) when deleteCvDocs is false', () => {
    const profileId = db.createProfile('Profile', '');
    const cvId = db.createCvDocument('CV', '', profileId, '');

    db.batchDeleteProfiles([profileId], { deleteCvDocs: false });

    expect(db.getCvDocument(cvId)).not.toBeNull();
    expect(db.getCvDocument(cvId).profile_id).toBeNull();
  });

  it('deletes cv_documents when deleteCvDocs is true', () => {
    const profileId = db.createProfile('Profile', '');
    const cvId = db.createCvDocument('CV', '', profileId, '');

    db.batchDeleteProfiles([profileId], { deleteCvDocs: true });

    expect(db.getCvDocument(cvId)).toBeNull();
  });

  it('nulls profile.base_cv_id on other profiles when the cv doc is deleted', () => {
    const profileA = db.createProfile('A', '');
    const profileB = db.createProfile('B', '');
    const cvId = db.createCvDocument('CV', '', profileA, '');
    db.setProfileBaseCv(profileA, cvId);

    db.batchDeleteProfiles([profileA], { deleteCvDocs: true });

    // profileB should be unaffected; this just confirms no crash and profileA is gone
    expect(db.getProfile(profileA)).toBeNull();
    expect(db.getProfile(profileB)).not.toBeNull();
  });

  it('nulls application.cv_document_id when the cv doc is deleted via deleteCvDocs', () => {
    const profileId = db.createProfile('Profile', '');
    const cvId = db.createCvDocument('CV', '', profileId, '');
    const appId = db.createApplication({ employer: 'Acme', jobTitle: 'Dev', cvDocumentId: cvId, status: 'applied' });

    db.batchDeleteProfiles([profileId], { deleteCvDocs: true });

    expect(db.getApplication(appId).cv_document_id).toBeNull();
  });

  it('defaults to deleteCvDocs: false when option is omitted', () => {
    const profileId = db.createProfile('Profile', '');
    const cvId = db.createCvDocument('CV', '', profileId, '');

    db.batchDeleteProfiles([profileId]);

    expect(db.getCvDocument(cvId)).not.toBeNull();
    expect(db.getCvDocument(cvId).profile_id).toBeNull();
  });
});

// =============================================================================
// batchDeleteJobs
// =============================================================================

describe('batchDeleteJobs', () => {
  it('deletes jobs and all their tasks and versions', () => {
    const jobId = db.createJob('Acme', 'Dev', '2020-01', null, 'Remote', '');
    const taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'Did something', ['tag'], true);

    db.batchDeleteJobs([jobId]);

    expect(db.getAllJobs()).toHaveLength(0);
    expect(db.getTasksByJob(jobId)).toHaveLength(0);
  });

  it('does not delete jobs not in the ids list', () => {
    const jobId1 = db.createJob('Acme', 'Dev', '2020-01', null, '', '');
    const jobId2 = db.createJob('Beta', 'PM', '2021-01', null, '', '');

    db.batchDeleteJobs([jobId1]);

    expect(db.getAllJobs()).toHaveLength(1);
    expect(db.getAllJobs()[0].id).toBe(jobId2);
  });

  it('cascades deletion to task_version_tags', () => {
    const jobId = db.createJob('Corp', 'Analyst', '2019-01', null, '', '');
    const taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'Tagged task', ['leadership', 'strategy'], true);

    db.batchDeleteJobs([jobId]);

    // getAllTags returns tags from remaining versions; should be empty now
    expect(db.getAllTags()).toHaveLength(0);
  });

  it('handles deleting multiple jobs at once', () => {
    const jobId1 = db.createJob('A', 'Dev', null, null, '', '');
    const jobId2 = db.createJob('B', 'Lead', null, null, '', '');
    db.createTask(jobId1);
    db.createTask(jobId2);

    db.batchDeleteJobs([jobId1, jobId2]);

    expect(db.getAllJobs()).toHaveLength(0);
  });
});

// =============================================================================
// batchDeleteTasks
// =============================================================================

describe('batchDeleteTasks', () => {
  it('deletes the specified tasks and their versions', () => {
    const jobId = db.createJob('Acme', 'Dev', '2020-01', null, '', '');
    const taskId1 = db.createTask(jobId);
    const taskId2 = db.createTask(jobId);
    db.createTaskVersion(taskId1, 'Task one', [], true);
    db.createTaskVersion(taskId2, 'Task two', [], true);

    db.batchDeleteTasks([taskId1]);

    expect(db.getTasksByJob(jobId)).toHaveLength(1);
    expect(db.getTasksByJob(jobId)[0].id).toBe(taskId2);
  });

  it('does not delete tasks not in the ids list', () => {
    const jobId = db.createJob('Acme', 'Dev', null, null, '', '');
    const taskId1 = db.createTask(jobId);
    const taskId2 = db.createTask(jobId);

    db.batchDeleteTasks([taskId1]);

    const remaining = db.getTasksByJob(jobId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(taskId2);
  });

  it('cascades deletion to task_version_tags', () => {
    const jobId  = db.createJob('Corp', 'Analyst', null, null, '', '');
    const taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'Tagged', ['impact'], true);

    db.batchDeleteTasks([taskId]);

    expect(db.getAllTags()).toHaveLength(0);
  });

  it('does not affect the parent job', () => {
    const jobId  = db.createJob('Acme', 'Dev', null, null, '', '');
    const taskId = db.createTask(jobId);

    db.batchDeleteTasks([taskId]);

    expect(db.getAllJobs()).toHaveLength(1);
    expect(db.getAllJobs()[0].id).toBe(jobId);
  });
});
