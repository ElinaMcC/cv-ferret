// Tests for the profiles data layer (db.js functions).
//
// We test the database functions directly rather than through HTTP, because
// the route files are thin wrappers — if the db functions are correct the
// routes will be correct too. This keeps the tests fast and simple.
//
// Each test gets a fresh temp directory and a clean database state via
// beforeEach. Vitest runs each test file in its own worker, so module-level
// state is isolated between files.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join }   from 'path';
import db from '../main/db.js';

let tmpDir;

beforeEach(() => {
  // Create a unique temp directory for each test.
  // initializeDatabase() resets all in-memory state before loading from disk,
  // so each test starts with a completely empty database.
  tmpDir = mkdtempSync(join(tmpdir(), 'cv-ferret-test-'));
  db.initializeDatabase(tmpDir);
});

afterEach(() => {
  // Remove the temp directory and all files created during the test.
  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// Profile CRUD
// =============================================================================

describe('createProfile', () => {
  it('returns a numeric id', () => {
    const id = db.createProfile('Engineering Manager', 'For EM roles');
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('stores the name and description', () => {
    const id      = db.createProfile('Data Science', 'DS and ML roles');
    const profile = db.getProfile(id);
    expect(profile.name).toBe('Data Science');
    expect(profile.description).toBe('DS and ML roles');
  });

  it('starts with base_cv_id as null', () => {
    const id      = db.createProfile('Product');
    const profile = db.getProfile(id);
    expect(profile.base_cv_id).toBe(null);
  });

  it('assigns incrementing ids to successive profiles', () => {
    const id1 = db.createProfile('Profile A');
    const id2 = db.createProfile('Profile B');
    expect(id2).toBe(id1 + 1);
  });
});

describe('getAllProfiles', () => {
  it('returns an empty array when no profiles exist', () => {
    expect(db.getAllProfiles()).toEqual([]);
  });

  it('returns all created profiles', () => {
    db.createProfile('Alpha');
    db.createProfile('Beta');
    const profiles = db.getAllProfiles();
    expect(profiles.length).toBe(2);
    expect(profiles.map(p => p.name)).toContain('Alpha');
    expect(profiles.map(p => p.name)).toContain('Beta');
  });

  it('does not include content_html or other cv_document fields', () => {
    db.createProfile('Alpha');
    const profiles = db.getAllProfiles();
    // getAllProfiles should only return profile fields, not document fields
    expect(profiles[0]).toHaveProperty('name');
    expect(profiles[0]).toHaveProperty('base_cv_id');
    expect(profiles[0]).not.toHaveProperty('content_html');
  });
});

describe('updateProfile', () => {
  it('updates name and description', () => {
    const id = db.createProfile('Old name', 'Old desc');
    db.updateProfile(id, 'New name', 'New desc');
    const profile = db.getProfile(id);
    expect(profile.name).toBe('New name');
    expect(profile.description).toBe('New desc');
  });

  it('updates the updated_at timestamp', async () => {
    const id = db.createProfile('Test');
    const before = db.getProfile(id).updated_at;
    // Wait 5ms to ensure the timestamp differs
    await new Promise(r => setTimeout(r, 5));
    db.updateProfile(id, 'Test updated', '');
    const after = db.getProfile(id).updated_at;
    expect(after).not.toBe(before);
  });
});

describe('deleteProfile', () => {
  it('removes the profile from getAllProfiles', () => {
    const id = db.createProfile('To delete');
    db.deleteProfile(id);
    expect(db.getAllProfiles().find(p => p.id === id)).toBeUndefined();
  });

  it('unlinks cv_documents that belonged to the deleted profile', () => {
    const profileId = db.createProfile('Profile');
    const docId     = db.createCvDocument('My CV', '', profileId, '');
    db.deleteProfile(profileId);
    const doc = db.getCvDocument(docId);
    expect(doc.profile_id).toBe(null);
  });
});

// =============================================================================
// setProfileBaseCv
// =============================================================================

describe('setProfileBaseCv', () => {
  it('sets base_cv_id on the profile', () => {
    const profileId = db.createProfile('Engineering');
    const docId     = db.createCvDocument('Base CV', '<p>content</p>', profileId, '');
    db.setProfileBaseCv(profileId, docId);
    expect(db.getProfile(profileId).base_cv_id).toBe(docId);
  });

  it('sets is_base to true on the designated document', () => {
    const profileId = db.createProfile('Engineering');
    const docId     = db.createCvDocument('Base CV', '', profileId, '');
    db.setProfileBaseCv(profileId, docId);
    expect(db.getCvDocument(docId).is_base).toBe(true);
  });

  it('clears is_base on the previous base when a new one is promoted', () => {
    const profileId  = db.createProfile('Engineering');
    const oldBaseId  = db.createCvDocument('Old base', '', profileId, '');
    db.setProfileBaseCv(profileId, oldBaseId);

    const newBaseId  = db.createCvDocument('New base', '', profileId, '');
    db.setProfileBaseCv(profileId, newBaseId);

    expect(db.getCvDocument(oldBaseId).is_base).toBe(false);
    expect(db.getCvDocument(newBaseId).is_base).toBe(true);
  });
});
