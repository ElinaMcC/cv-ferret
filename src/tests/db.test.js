// Tests for backup, restore, and migration logic in db.js — the highest-risk
// code in the app, since it's a local JSON-file store where every change is
// written to disk immediately. A bug here risks corrupting or losing the
// user's only copy of their CV history.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync } from 'fs';
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
// getAllData / restoreData
// =============================================================================

describe('restoreData', () => {
  it('throws on a payload with no jobs array', () => {
    expect(() => db.restoreData(null)).toThrow('Invalid backup file');
    expect(() => db.restoreData({})).toThrow('Invalid backup file');
    expect(() => db.restoreData({ jobs: 'not an array' })).toThrow('Invalid backup file');
  });

  it('round-trips all sections of a backup', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', 'Remote', 'notes');
    const taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'Did a thing', ['impact'], true);
    db.createEducation('Some University', 'BSc', '2019', '');
    db.createProfile('Tech Lead', 'desc');
    db.updatePersonal({ name: 'Test User' });

    const backup = db.getAllData();

    // Reset to a clean database, then restore the backup into it.
    const otherDir = mkdtempSync(join(tmpdir(), 'cv-ferret-test-'));
    db.initializeDatabase(otherDir);
    db.restoreData(backup);

    expect(db.getAllJobs()).toHaveLength(1);
    expect(db.getAllJobs()[0]).toMatchObject({ employer: 'Acme', job_title: 'Engineer' });
    expect(db.getTasksByJob(jobId)[0].versions[0].description).toBe('Did a thing');
    expect(db.getAllEducation()).toHaveLength(1);
    expect(db.getAllProfiles()).toHaveLength(1);
    expect(db.getPersonal().name).toBe('Test User');

    rmSync(otherDir, { recursive: true, force: true });
  });

  it('resets id counters so new records continue after the restored max id', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const backup = db.getAllData();

    db.restoreData(backup);

    const newJobId = db.createJob('Globex', 'Manager', '2021-01', '2022-01', '', '');
    expect(newJobId).toBe(jobId + 1);
  });

  it('defaults missing sections to empty collections rather than crashing', () => {
    db.restoreData({ jobs: [] });

    expect(db.getAllJobs()).toEqual([]);
    expect(db.getAllEducation()).toEqual([]);
    expect(db.getAllProfiles()).toEqual([]);
    expect(db.getPersonal()).toEqual({});
  });

  it('takes an auto-backup of the existing data before restoring over it', () => {
    db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const backupsDir = join(tmpDir, 'backups');
    expect(existsSync(backupsDir)).toBe(false);

    db.restoreData({ jobs: [] });

    expect(existsSync(backupsDir)).toBe(true);
    expect(readdirSync(backupsDir).filter(f => f.startsWith('backup-'))).toHaveLength(1);
  });
});

// =============================================================================
// performAutoBackup
// =============================================================================

describe('performAutoBackup', () => {
  it('does nothing if no data file has been written yet', () => {
    db.performAutoBackup();
    expect(existsSync(join(tmpDir, 'backups'))).toBe(false);
  });

  it('writes a timestamped copy of the current data file into backups/', () => {
    db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    db.performAutoBackup();

    const backupsDir = join(tmpDir, 'backups');
    const files = readdirSync(backupsDir).filter(f => f.startsWith('backup-') && f.endsWith('.json'));
    expect(files).toHaveLength(1);

    const backupContent = JSON.parse(readFileSync(join(backupsDir, files[0]), 'utf8'));
    const liveContent = JSON.parse(readFileSync(join(tmpDir, 'cv-builder-data.json'), 'utf8'));
    expect(backupContent).toEqual(liveContent);
    expect(backupContent.jobs[0].employer).toBe('Acme');
  });

  it('keeps only the 10 most recent backups', () => {
    db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const backupsDir = join(tmpDir, 'backups');
    mkdirSync(backupsDir, { recursive: true });

    // Pre-seed 11 older backups with names that sort before a fresh timestamp.
    for (let i = 1; i <= 11; i++) {
      const name = `backup-2000-01-01T00-00-${String(i).padStart(2, '0')}.json`;
      writeFileSync(join(backupsDir, name), '{}', 'utf8');
    }

    db.performAutoBackup();

    const files = readdirSync(backupsDir).filter(f => f.startsWith('backup-') && f.endsWith('.json'));
    expect(files.length).toBe(10);
  });
});

// =============================================================================
// migrateExperiencesToTasks (via initializeDatabase on legacy data)
// =============================================================================

describe('migrateExperiencesToTasks', () => {
  it('converts experiences + experience_tags into tasks, versions, and tags', () => {
    const legacyData = {
      jobs: [
        { id: 1, employer: 'Acme', job_title: 'Engineer', start_date: '2020-01', end_date: '2021-01', location: '', notes: '', created_at: '2020-01-01T00:00:00.000Z' },
      ],
      tasks: [],
      task_versions: [],
      task_version_tags: [],
      experiences: [
        { id: 1, job_id: 1, description: 'Built the thing', created_at: '2020-01-01T00:00:00.000Z' },
        { id: 2, job_id: 1, description: 'Shipped the thing', created_at: '2020-01-02T00:00:00.000Z' },
      ],
      experience_tags: [
        { id: 1, experience_id: 1, tag: 'impact' },
        { id: 2, experience_id: 1, tag: 'leadership' },
      ],
      references: [], applications: [], education: [], training: [],
      skills: [], languages: [], personal: {}, documents: [], profiles: [], cv_documents: [],
    };

    writeFileSync(join(tmpDir, 'cv-builder-data.json'), JSON.stringify(legacyData), 'utf8');

    // Re-initialize against the same directory to trigger the migration on load.
    db.initializeDatabase(tmpDir);

    const [job] = db.getAllJobsWithTasks();
    expect(job.tasks).toHaveLength(2);

    const builtTask = job.tasks.find(t => t.versions[0].description === 'Built the thing');
    expect(builtTask.versions[0].is_default).toBe(true);
    expect(builtTask.versions[0].tags.sort()).toEqual(['impact', 'leadership']);

    const shippedTask = job.tasks.find(t => t.versions[0].description === 'Shipped the thing');
    expect(shippedTask.versions[0].is_default).toBe(true);
    expect(shippedTask.versions[0].tags).toEqual([]);

    // display_order follows the original experience order
    expect(builtTask.display_order).toBeLessThan(shippedTask.display_order);
  });

  it('removes the legacy experiences/experience_tags collections after migrating', () => {
    const legacyData = {
      jobs: [{ id: 1, employer: 'Acme', job_title: 'Engineer', start_date: '2020-01', end_date: '2021-01', location: '', notes: '', created_at: '2020-01-01T00:00:00.000Z' }],
      tasks: [], task_versions: [], task_version_tags: [],
      experiences: [{ id: 1, job_id: 1, description: 'Did a thing', created_at: '2020-01-01T00:00:00.000Z' }],
      experience_tags: [],
      references: [], applications: [], education: [], training: [],
      skills: [], languages: [], personal: {}, documents: [], profiles: [], cv_documents: [],
    };

    writeFileSync(join(tmpDir, 'cv-builder-data.json'), JSON.stringify(legacyData), 'utf8');
    db.initializeDatabase(tmpDir);

    const persisted = JSON.parse(readFileSync(join(tmpDir, 'cv-builder-data.json'), 'utf8'));
    expect(persisted.experiences).toBeUndefined();
    expect(persisted.experience_tags).toBeUndefined();
  });

  it('does not re-run migration when tasks already exist', () => {
    const legacyData = {
      jobs: [{ id: 1, employer: 'Acme', job_title: 'Engineer', start_date: '2020-01', end_date: '2021-01', location: '', notes: '', created_at: '2020-01-01T00:00:00.000Z' }],
      tasks: [{ id: 5, job_id: 1, display_order: 0, created_at: '2020-01-01T00:00:00.000Z' }],
      task_versions: [{ id: 5, task_id: 5, description: 'Existing task', is_default: true, role_priorities: [], created_at: '2020-01-01T00:00:00.000Z' }],
      task_version_tags: [],
      // Stale experiences data that should be left alone since tasks already exist.
      experiences: [{ id: 1, job_id: 1, description: 'Should be ignored', created_at: '2020-01-01T00:00:00.000Z' }],
      experience_tags: [],
      references: [], applications: [], education: [], training: [],
      skills: [], languages: [], personal: {}, documents: [], profiles: [], cv_documents: [],
    };

    writeFileSync(join(tmpDir, 'cv-builder-data.json'), JSON.stringify(legacyData), 'utf8');
    db.initializeDatabase(tmpDir);

    const [job] = db.getAllJobsWithTasks();
    expect(job.tasks).toHaveLength(1);
    expect(job.tasks[0].versions[0].description).toBe('Existing task');

    // Next created task should not collide with the existing id 5.
    const newTaskId = db.createTask(1);
    expect(newTaskId).toBe(6);
  });
});
