// Tests for the cv_documents data layer (db.js functions).
// See profiles.test.js for notes on the test setup pattern.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join }   from 'path';
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
// createCvDocument
// =============================================================================

describe('createCvDocument', () => {
  it('returns a numeric id', () => {
    const id = db.createCvDocument('My CV', '<h1>Jane</h1>', null, '');
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('stores all provided fields', () => {
    const id  = db.createCvDocument('Senior Engineer CV', '<p>content</p>', 42, 'Job ad text');
    const doc = db.getCvDocument(id);
    expect(doc.title).toBe('Senior Engineer CV');
    expect(doc.content_html).toBe('<p>content</p>');
    expect(doc.profile_id).toBe(42);
    expect(doc.job_ad_text).toBe('Job ad text');
  });

  it('defaults is_base to false', () => {
    const id  = db.createCvDocument('My CV', '', null, '');
    const doc = db.getCvDocument(id);
    expect(doc.is_base).toBe(false);
  });

  it('defaults title to "Untitled CV" when not provided', () => {
    const id  = db.createCvDocument('', '', null, '');
    const doc = db.getCvDocument(id);
    expect(doc.title).toBe('Untitled CV');
  });

  it('assigns incrementing ids', () => {
    const id1 = db.createCvDocument('CV 1', '', null, '');
    const id2 = db.createCvDocument('CV 2', '', null, '');
    expect(id2).toBe(id1 + 1);
  });
});

// =============================================================================
// getAllCvDocuments
// =============================================================================

describe('getAllCvDocuments', () => {
  it('returns an empty array when none exist', () => {
    expect(db.getAllCvDocuments()).toEqual([]);
  });

  it('returns all created documents', () => {
    db.createCvDocument('A', '', null, '');
    db.createCvDocument('B', '', null, '');
    expect(db.getAllCvDocuments().length).toBe(2);
  });

  it('does not include content_html in the list (keeps payload small)', () => {
    db.createCvDocument('My CV', '<lots of html/>', null, '');
    const docs = db.getAllCvDocuments();
    // The list view omits content_html — clients fetch the full doc separately
    expect(docs[0]).not.toHaveProperty('content_html');
  });

  it('includes notes in the list so the Library does not need a separate fetch', () => {
    db.createCvDocument('My CV', '', null, '', 'Focus on leadership');
    const docs = db.getAllCvDocuments();
    expect(docs[0].notes).toBe('Focus on leadership');
  });

  it('sorts by updated_at descending (most recently updated first)', async () => {
    const id1 = db.createCvDocument('First', '', null, '');
    await new Promise(r => setTimeout(r, 5));
    const id2 = db.createCvDocument('Second', '', null, '');
    const docs = db.getAllCvDocuments();
    expect(docs[0].id).toBe(id2); // most recent first
    expect(docs[1].id).toBe(id1);
  });
});

// =============================================================================
// updateCvDocument
// =============================================================================

describe('updateCvDocument', () => {
  it('updates only the fields provided', () => {
    const id = db.createCvDocument('Original title', '<p>original</p>', null, '');
    db.updateCvDocument(id, { title: 'Updated title' });
    const doc = db.getCvDocument(id);
    expect(doc.title).toBe('Updated title');
    expect(doc.content_html).toBe('<p>original</p>'); // unchanged
  });

  it('updates content_html', () => {
    const id = db.createCvDocument('CV', '<p>old</p>', null, '');
    db.updateCvDocument(id, { content_html: '<p>new</p>' });
    expect(db.getCvDocument(id).content_html).toBe('<p>new</p>');
  });

  it('updates notes', () => {
    const id = db.createCvDocument('CV', '', null, '');
    db.updateCvDocument(id, { notes: 'Tailored for scale-up engineering roles' });
    expect(db.getCvDocument(id).notes).toBe('Tailored for scale-up engineering roles');
  });

  it('does not clear notes when updating only title', () => {
    // This mirrors what the Assembly auto-save does: it sends { title, content_html }
    // without a notes field. Notes must survive that update unchanged.
    const id = db.createCvDocument('CV', '', null, '', 'My important note');
    db.updateCvDocument(id, { title: 'Renamed CV' });
    const doc = db.getCvDocument(id);
    expect(doc.title).toBe('Renamed CV');
    expect(doc.notes).toBe('My important note'); // must be preserved
  });

  it('updates the updated_at timestamp', async () => {
    const id     = db.createCvDocument('CV', '', null, '');
    const before = db.getCvDocument(id).updated_at;
    await new Promise(r => setTimeout(r, 5));
    db.updateCvDocument(id, { title: 'New title' });
    const after  = db.getCvDocument(id).updated_at;
    expect(after).not.toBe(before);
  });
});

// =============================================================================
// deleteCvDocument
// =============================================================================

describe('deleteCvDocument', () => {
  it('removes the document from getAllCvDocuments', () => {
    const id = db.createCvDocument('To delete', '', null, '');
    db.deleteCvDocument(id);
    expect(db.getAllCvDocuments().find(d => d.id === id)).toBeUndefined();
  });

  it('clears base_cv_id on any profile that pointed to this document', () => {
    const profileId = db.createProfile('Engineering');
    const docId     = db.createCvDocument('Base', '', profileId, '');
    db.setProfileBaseCv(profileId, docId);
    db.deleteCvDocument(docId);
    expect(db.getProfile(profileId).base_cv_id).toBe(null);
  });

  it('clears document_id on any application that referenced this document', () => {
    const docId = db.createCvDocument('My CV', '', null, '');
    const appId = db.createApplication({ employer: 'Acme', jobTitle: 'Dev', documentId: docId });
    db.deleteCvDocument(docId);
    expect(db.getApplication(appId).document_id).toBe(null);
  });
});

// =============================================================================
// applications: cv_file_path
// =============================================================================

describe('application cv_file_path', () => {
  it('is null by default on a new application', () => {
    const id  = db.createApplication({ employer: 'Acme', jobTitle: 'Dev' });
    const app = db.getApplication(id);
    expect(app.cv_file_path).toBe(null);
  });

  it('can be set when creating an application', () => {
    const id  = db.createApplication({ employer: 'Acme', jobTitle: 'Dev', cvFilePath: '/docs/cv.pdf' });
    const app = db.getApplication(id);
    expect(app.cv_file_path).toBe('/docs/cv.pdf');
  });

  it('can be updated via updateApplication', () => {
    const id = db.createApplication({ employer: 'Acme', jobTitle: 'Dev' });
    db.updateApplication(id, { cv_file_path: '/docs/updated-cv.docx' });
    expect(db.getApplication(id).cv_file_path).toBe('/docs/updated-cv.docx');
  });
});
