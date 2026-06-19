// Tests for importExperience and importEducation in db.js.
// These cover the manual JSON import path (the AI path calls the same
// db functions but around non-deterministic Claude output, so it's excluded).

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
// importExperience
// =============================================================================

describe('importExperience', () => {
  it('creates jobs and tasks, returns correct counts', () => {
    const result = db.importExperience([
      {
        employer: 'Acme', job_title: 'Engineer', start_date: '2020-01', end_date: '2022-06',
        location: 'Remote', notes: '',
        tasks: [
          { description: 'Built the thing', tags: [], role_priorities: [] },
          { description: 'Fixed the other thing', tags: ['impact'], role_priorities: [] },
        ],
      },
    ]);

    expect(result.jobs).toBe(1);
    expect(result.tasks).toBe(2);
    expect(db.getAllJobs()).toHaveLength(1);
    expect(db.getAllJobs()[0]).toMatchObject({ employer: 'Acme', job_title: 'Engineer' });
    expect(db.getTasksByJob(db.getAllJobs()[0].id)).toHaveLength(2);
  });

  it('imports multiple jobs in one call', () => {
    const result = db.importExperience([
      { employer: 'Alpha', job_title: 'Dev', tasks: [{ description: 'Did A' }] },
      { employer: 'Beta',  job_title: 'Lead', tasks: [{ description: 'Did B' }, { description: 'Did C' }] },
    ]);

    expect(result.jobs).toBe(2);
    expect(result.tasks).toBe(3);
    expect(db.getAllJobs()).toHaveLength(2);
  });

  it('skips tasks with an empty or whitespace-only description', () => {
    const result = db.importExperience([
      {
        employer: 'Corp', job_title: 'Analyst', tasks: [
          { description: '' },
          { description: '   ' },
          { description: 'Valid task' },
        ],
      },
    ]);

    expect(result.tasks).toBe(1);
    const [job] = db.getAllJobs();
    expect(db.getTasksByJob(job.id)).toHaveLength(1);
  });

  it('creates a job with no tasks when tasks array is empty', () => {
    const result = db.importExperience([
      { employer: 'Solo', job_title: 'Contractor', tasks: [] },
    ]);

    expect(result.jobs).toBe(1);
    expect(result.tasks).toBe(0);
    const [job] = db.getAllJobs();
    expect(db.getTasksByJob(job.id)).toHaveLength(0);
  });

  it('handles a missing tasks key gracefully', () => {
    const result = db.importExperience([
      { employer: 'NoTasks', job_title: 'Manager' },
    ]);

    expect(result.jobs).toBe(1);
    expect(result.tasks).toBe(0);
  });

  it('trims whitespace from employer, job_title, location, and notes', () => {
    db.importExperience([
      { employer: '  Trimmed Co  ', job_title: '  Sr Dev  ', location: '  London  ', notes: '  note  ', tasks: [] },
    ]);

    const [job] = db.getAllJobs();
    expect(job.employer).toBe('Trimmed Co');
    expect(job.job_title).toBe('Sr Dev');
    expect(job.location).toBe('London');
    expect(job.notes).toBe('note');
  });

  it('stores tags and role_priorities on the created task version', () => {
    db.importExperience([
      {
        employer: 'Tagged Co', job_title: 'Dev', tasks: [
          { description: 'Did something', tags: ['leadership', 'impact'], role_priorities: ['senior'] },
        ],
      },
    ]);

    const [job] = db.getAllJobs();
    const [task] = db.getTasksByJob(job.id);
    const full = db.getTaskWithVersions(task.id);
    const [version] = full.versions;
    expect(version.tags).toEqual(expect.arrayContaining(['leadership', 'impact']));
    expect(version.role_priorities).toEqual(expect.arrayContaining(['senior']));
  });

  it('created task versions are set as default', () => {
    db.importExperience([
      { employer: 'Acme', job_title: 'Dev', tasks: [{ description: 'A task' }] },
    ]);

    const [job] = db.getAllJobs();
    const [task] = db.getTasksByJob(job.id);
    const full = db.getTaskWithVersions(task.id);
    expect(full.versions[0].is_default).toBe(true);
  });

  it('returns zero counts for an empty jobs array', () => {
    const result = db.importExperience([]);
    expect(result.jobs).toBe(0);
    expect(result.tasks).toBe(0);
  });
});

// =============================================================================
// importEducation
// =============================================================================

describe('importEducation', () => {
  it('creates education and training entries, returns correct counts', () => {
    const result = db.importEducation({
      education: [
        { institution: 'University of X', title: 'BSc Computer Science', end_date: 'Jun 2018', notes: '' },
      ],
      training: [
        { institution: 'Coursera', title: 'AWS Fundamentals', end_date: 'Mar 2023', notes: '' },
        { institution: 'Linux Foundation', title: 'CKA', end_date: 'Jan 2024', notes: '' },
      ],
      skills: [],
      languages: [],
    });

    expect(result.education).toBe(1);
    expect(result.training).toBe(2);
    expect(db.getAllEducation()).toHaveLength(1);
    expect(db.getAllTraining()).toHaveLength(2);
  });

  it('merges skills with existing ones and deduplicates', () => {
    db.updateSkills(['Python', 'SQL']);

    const result = db.importEducation({
      skills: ['SQL', 'Docker', 'Python', 'Kubernetes'],
    });

    const skills = db.getSkills();
    expect(skills).toHaveLength(4);
    expect(skills).toEqual(expect.arrayContaining(['Python', 'SQL', 'Docker', 'Kubernetes']));
    expect(result.skillsAdded).toBe(2);
  });

  it('reports zero skillsAdded when all incoming skills already exist', () => {
    db.updateSkills(['Python', 'SQL']);
    const result = db.importEducation({ skills: ['Python', 'SQL'] });
    expect(result.skillsAdded).toBe(0);
    expect(db.getSkills()).toHaveLength(2);
  });

  it('trims whitespace from skills before merging', () => {
    const result = db.importEducation({ skills: ['  Go  ', 'Rust'] });
    expect(db.getSkills()).toEqual(expect.arrayContaining(['Go', 'Rust']));
    expect(result.skillsAdded).toBe(2);
  });

  it('skips blank skill strings', () => {
    db.importEducation({ skills: ['Valid', '', '   '] });
    expect(db.getSkills()).toHaveLength(1);
    expect(db.getSkills()[0]).toBe('Valid');
  });

  it('upserts languages by name — adds new, updates existing level', () => {
    db.updateLanguages([{ language: 'French', level: 'B1' }]);

    const result = db.importEducation({
      languages: [
        { language: 'French', level: 'C1' },
        { language: 'German', level: 'B2' },
      ],
    });

    const langs = db.getLanguages();
    expect(langs).toHaveLength(2);
    expect(langs.find(l => l.language === 'French').level).toBe('C1');
    expect(langs.find(l => l.language === 'German').level).toBe('B2');
    expect(result.languages).toBe(2);
  });

  it('skips language entries with no language key', () => {
    db.importEducation({
      languages: [
        { level: 'B1' },
        { language: 'Spanish', level: 'A2' },
      ],
    });

    expect(db.getLanguages()).toHaveLength(1);
    expect(db.getLanguages()[0].language).toBe('Spanish');
  });

  it('handles a partial payload with only skills', () => {
    const result = db.importEducation({ skills: ['TypeScript'] });

    expect(result.education).toBe(0);
    expect(result.training).toBe(0);
    expect(result.skillsAdded).toBe(1);
    expect(result.languages).toBe(0);
  });

  it('handles an empty payload without error', () => {
    const result = db.importEducation({});
    expect(result).toMatchObject({ education: 0, training: 0, skillsAdded: 0, languages: 0 });
  });

  it('does not modify skills when incoming array is empty', () => {
    db.updateSkills(['Existing']);
    db.importEducation({ skills: [] });
    expect(db.getSkills()).toEqual(['Existing']);
  });
});
