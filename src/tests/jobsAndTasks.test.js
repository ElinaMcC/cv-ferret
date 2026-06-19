// Tests for the Experience Pool data model (jobs, tasks, task versions) in
// db.js. This is the foundation every other feature (Assembly, CV Library,
// AI generation) builds on, and was previously untested.
//
// Each test gets a fresh temp directory and a clean database state via
// beforeEach, matching the pattern in profiles.test.js / cvDocuments.test.js.

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
// Jobs
// =============================================================================

describe('createJob / updateJob / deleteJob', () => {
  it('creates a job with the given fields', () => {
    const id = db.createJob('Acme Corp', 'Engineer', '2020-01', '2022-01', 'Remote', 'Some notes');
    const job = db.getAllJobs().find(j => j.id === id);
    expect(job).toMatchObject({
      employer: 'Acme Corp',
      job_title: 'Engineer',
      start_date: '2020-01',
      end_date: '2022-01',
      location: 'Remote',
      notes: 'Some notes',
    });
  });

  it('assigns incrementing ids to successive jobs', () => {
    const id1 = db.createJob('A', 'Role A', '2020-01', '2021-01', '', '');
    const id2 = db.createJob('B', 'Role B', '2021-01', '2022-01', '', '');
    expect(id2).toBe(id1 + 1);
  });

  it('updates all fields of an existing job', () => {
    const id = db.createJob('Old Co', 'Old Role', '2020-01', '2021-01', 'Old loc', 'Old notes');
    db.updateJob(id, 'New Co', 'New Role', '2021-02', '2022-02', 'New loc', 'New notes');
    const job = db.getAllJobs().find(j => j.id === id);
    expect(job).toMatchObject({
      employer: 'New Co',
      job_title: 'New Role',
      start_date: '2021-02',
      end_date: '2022-02',
      location: 'New loc',
      notes: 'New notes',
    });
  });

  it('deleteJob removes the job and all its tasks, versions, and tags', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'Did a thing', ['impact'], true);

    db.deleteJob(jobId);

    expect(db.getAllJobs().find(j => j.id === jobId)).toBeUndefined();
    expect(db.getTasksByJob(jobId)).toEqual([]);
    expect(db.getVersionWithTags(versionId)).toBeNull();
  });
});

// =============================================================================
// Tasks
// =============================================================================

describe('createTask / deleteTask / getTasksByJob', () => {
  it('creates tasks with incrementing display_order per job', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const t1 = db.createTask(jobId);
    const t2 = db.createTask(jobId);

    const tasks = db.getTasksByJob(jobId);
    expect(tasks.map(t => t.id)).toEqual([t1, t2]);
    expect(tasks[0].display_order).toBe(0);
    expect(tasks[1].display_order).toBe(1);
  });

  it('getTasksByJob includes versions with tags', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'Built things', ['leadership', 'impact'], true);

    const [task] = db.getTasksByJob(jobId);
    expect(task.versions).toHaveLength(1);
    expect(task.versions[0]).toMatchObject({ description: 'Built things', is_default: true });
    expect(task.versions[0].tags.sort()).toEqual(['impact', 'leadership']);
  });

  it('getTasksByJob only returns tasks for the given job', () => {
    const job1 = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const job2 = db.createJob('Globex', 'Manager', '2021-02', '2022-02', '', '');
    const t1 = db.createTask(job1);
    db.createTask(job2);

    const tasks = db.getTasksByJob(job1);
    expect(tasks.map(t => t.id)).toEqual([t1]);
  });

  it('deleteTask removes the task, its versions, and its version tags', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'Did a thing', ['impact'], true);

    db.deleteTask(taskId);

    expect(db.getTasksByJob(jobId)).toEqual([]);
    expect(db.getVersionWithTags(versionId)).toBeNull();
  });
});

// =============================================================================
// reorderTasks
// =============================================================================

describe('reorderTasks', () => {
  it('updates display_order to match the given task id order', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const t1 = db.createTask(jobId);
    const t2 = db.createTask(jobId);
    const t3 = db.createTask(jobId);

    db.reorderTasks(jobId, [t3, t1, t2]);

    const tasks = db.getTasksByJob(jobId);
    expect(tasks.map(t => t.id)).toEqual([t3, t1, t2]);
  });

  it('ignores task ids that do not belong to the given job', () => {
    const job1 = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const job2 = db.createJob('Globex', 'Manager', '2021-02', '2022-02', '', '');
    const t1 = db.createTask(job1);
    const t2 = db.createTask(job1);
    const otherJobTask = db.createTask(job2);

    // Reordering job1 with a task id from job2 mixed in should not affect job2's task.
    db.reorderTasks(job1, [t2, t1, otherJobTask]);

    expect(db.getTasksByJob(job2).map(t => t.id)).toEqual([otherJobTask]);
    expect(db.getTasksByJob(job2)[0].display_order).toBe(0);
  });
});

// =============================================================================
// Task versions
// =============================================================================

describe('createTaskVersion', () => {
  it('the first version of a task defaults to is_default when isDefault is not explicitly false', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'First version', [], undefined);

    expect(db.getVersionWithTags(versionId).is_default).toBe(true);
  });

  it('an explicit isDefault=false is honoured even for the first version of a task', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'First version', [], false);

    expect(db.getVersionWithTags(versionId).is_default).toBe(false);
  });

  it('subsequent versions default to non-default unless isDefault is true', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'First version', [], true);
    const v2 = db.createTaskVersion(taskId, 'Second version', [], false);

    expect(db.getVersionWithTags(v2).is_default).toBe(false);
  });

  it('stores role_priorities', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'Tailored version', [], false, [{ role: 'Backend', rank: 1 }]);

    expect(db.getVersionWithTags(versionId).role_priorities).toEqual([{ role: 'Backend', rank: 1 }]);
  });
});

describe('updateTaskVersion', () => {
  it('updates description, role_priorities, and replaces tags', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'Original', ['old-tag'], true);

    db.updateTaskVersion(versionId, 'Updated', ['new-tag'], [{ role: 'Lead', rank: 1 }]);

    const version = db.getVersionWithTags(versionId);
    expect(version.description).toBe('Updated');
    expect(version.role_priorities).toEqual([{ role: 'Lead', rank: 1 }]);
    expect(version.tags).toEqual(['new-tag']);
  });
});

describe('deleteTaskVersion', () => {
  it('deletes the task entirely when its only version is deleted', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const versionId = db.createTaskVersion(taskId, 'Only version', [], true);

    const result = db.deleteTaskVersion(versionId);

    expect(result.taskDeleted).toBe(true);
    expect(db.getTasksByJob(jobId)).toEqual([]);
  });

  it('promotes the earliest remaining version to default when the default version is deleted', async () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const v1 = db.createTaskVersion(taskId, 'First', [], true);
    await new Promise(r => setTimeout(r, 5));
    const v2 = db.createTaskVersion(taskId, 'Second', [], false);

    const result = db.deleteTaskVersion(v1);

    expect(result.taskDeleted).toBe(false);
    expect(db.getVersionWithTags(v2).is_default).toBe(true);
  });

  it('leaves the remaining non-default version untouched when a non-default version is deleted', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const v1 = db.createTaskVersion(taskId, 'First', [], true);
    const v2 = db.createTaskVersion(taskId, 'Second', [], false);

    db.deleteTaskVersion(v2);

    expect(db.getVersionWithTags(v1).is_default).toBe(true);
    expect(db.getTasksByJob(jobId)[0].versions).toHaveLength(1);
  });
});

describe('setDefaultVersion', () => {
  it('makes the given version default and clears the flag on all others for the same task', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskId = db.createTask(jobId);
    const v1 = db.createTaskVersion(taskId, 'First', [], true);
    const v2 = db.createTaskVersion(taskId, 'Second', [], false);

    db.setDefaultVersion(v2);

    expect(db.getVersionWithTags(v1).is_default).toBe(false);
    expect(db.getVersionWithTags(v2).is_default).toBe(true);
  });

  it('does not affect default flags on versions belonging to other tasks', () => {
    const jobId = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const taskA = db.createTask(jobId);
    const taskB = db.createTask(jobId);
    const a1 = db.createTaskVersion(taskA, 'A1', [], true);
    const b1 = db.createTaskVersion(taskB, 'B1', [], true);
    const b2 = db.createTaskVersion(taskB, 'B2', [], false);

    db.setDefaultVersion(b2);

    expect(db.getVersionWithTags(a1).is_default).toBe(true);
    expect(db.getVersionWithTags(b1).is_default).toBe(false);
  });
});

// =============================================================================
// getAllJobsWithTasks
// =============================================================================

describe('getAllJobsWithTasks', () => {
  it('returns every job with its tasks and versions nested', () => {
    const job1 = db.createJob('Acme', 'Engineer', '2020-01', '2021-01', '', '');
    const job2 = db.createJob('Globex', 'Manager', '2021-02', '2022-02', '', '');
    const task1 = db.createTask(job1);
    db.createTaskVersion(task1, 'Did a thing', [], true);

    const jobs = db.getAllJobsWithTasks();
    expect(jobs.map(j => j.id).sort()).toEqual([job1, job2].sort());

    const acme = jobs.find(j => j.id === job1);
    expect(acme.tasks).toHaveLength(1);
    expect(acme.tasks[0].versions[0].description).toBe('Did a thing');

    const globex = jobs.find(j => j.id === job2);
    expect(globex.tasks).toEqual([]);
  });
});

// =============================================================================
// searchTasks
// =============================================================================

describe('searchTasks', () => {
  let jobId, taskId;

  beforeEach(() => {
    jobId = db.createJob('Acme Corp', 'Senior Engineer', '2020-01', '2021-01', '', '');
    taskId = db.createTask(jobId);
    db.createTaskVersion(taskId, 'Led the platform migration', ['leadership', 'migration'], true);
  });

  it('matches on the version description', () => {
    const results = db.searchTasks('platform migration');
    expect(results).toHaveLength(1);
    expect(results[0].task_id).toBe(taskId);
  });

  it('matches on the employer name', () => {
    const results = db.searchTasks('acme');
    expect(results).toHaveLength(1);
  });

  it('matches on the job title', () => {
    const results = db.searchTasks('senior engineer');
    expect(results).toHaveLength(1);
  });

  it('matches on tags', () => {
    const results = db.searchTasks('leadership');
    expect(results).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    expect(db.searchTasks('ACME')).toHaveLength(1);
    expect(db.searchTasks('LeD ThE')).toHaveLength(1);
  });

  it('returns an empty array when nothing matches', () => {
    expect(db.searchTasks('nonexistent term')).toEqual([]);
  });

  it('includes job/employer context in results', () => {
    const [result] = db.searchTasks('migration');
    expect(result).toMatchObject({
      employer: 'Acme Corp',
      job_title: 'Senior Engineer',
      job_id: jobId,
    });
    expect(result.tags.sort()).toEqual(['leadership', 'migration']);
  });
});
