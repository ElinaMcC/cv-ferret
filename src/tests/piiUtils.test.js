// ─────────────────────────────────────────────────────────────────────────────
// HOW TO READ THIS FILE
// ─────────────────────────────────────────────────────────────────────────────
//
// This is a Vitest test file. If you are new to testing, here is the anatomy:
//
//   describe('label', () => { ... })
//     Groups related tests under a heading. Think of it as a chapter title.
//
//   it('describes the expected behaviour', () => { ... })
//     A single test. The string explains WHAT should be true. If the test
//     fails, Vitest prints this string so you know exactly what broke.
//
//   expect(actualValue).toBe(expectedValue)
//     The assertion. If actualValue !== expectedValue, the test fails and
//     Vitest shows you both values side by side.
//
//   expect(actualValue).toEqual(expectedValue)
//     Like toBe, but for objects and arrays (checks deep equality).
//
// To run all tests:      npm test
// To re-run on save:     npm run test:watch
// To see a browser UI:   npm run test:ui
//
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildReplacementMap, stripPII } from '../main/piiUtils.js';

// =============================================================================
// buildReplacementMap
// =============================================================================
// These tests verify that the replacement map is built correctly from the
// various PII sources: personal details, employer names, and custom extras.

describe('buildReplacementMap', () => {

  it('maps the full name to [Your name]', () => {
    const map = buildReplacementMap({ first_name: 'Jane', last_name: 'Smith' }, []);
    expect(map['Jane Smith']).toBe('[Your name]');
  });

  it('also maps first and last name individually', () => {
    // This ensures "Jane" on its own (e.g. in a sentence like "Jane led the team")
    // is also replaced, not just the full "Jane Smith" form.
    const map = buildReplacementMap({ first_name: 'Jane', last_name: 'Smith' }, []);
    expect(map['Jane']).toBe('[Your name]');
    expect(map['Smith']).toBe('[Your name]');
  });

  it('maps email, phone, and address to their respective placeholders', () => {
    const map = buildReplacementMap(
      { email: 'jane@example.com', phone: '07700900000', address: '1 High Street' },
      []
    );
    expect(map['jane@example.com']).toBe('[email address]');
    expect(map['07700900000']).toBe('[phone number]');
    expect(map['1 High Street']).toBe('[address]');
  });

  it('assigns sequential [Employer N] placeholders to each unique employer', () => {
    const map = buildReplacementMap(
      {},
      [{ employer: 'Google' }, { employer: 'Amazon' }]
    );
    expect(map['Google']).toBe('[Employer 1]');
    expect(map['Amazon']).toBe('[Employer 2]');
  });

  it('does not create a duplicate entry when the same employer appears twice', () => {
    // A user's data might have duplicate employer records — only one placeholder
    // should be used, and the counter should not jump.
    const map = buildReplacementMap(
      {},
      [{ employer: 'Google' }, { employer: 'Google' }]
    );
    expect(map['Google']).toBe('[Employer 1]');
    const employerPlaceholders = Object.values(map).filter(v => v.startsWith('[Employer'));
    expect(employerPlaceholders.length).toBe(1);
  });

  it('includes user-defined extra exclusion terms', () => {
    const map = buildReplacementMap({}, [], ['Project Phoenix', 'John Doe']);
    expect(map['Project Phoenix']).toBe('[redacted]');
    expect(map['John Doe']).toBe('[redacted]');
  });

  it('ignores blank or whitespace-only extra terms', () => {
    // Users might leave empty lines in their exclusion list — these should not
    // create empty-string keys that would corrupt every string they touch.
    const map = buildReplacementMap({}, [], ['', '  ', 'ValidTerm']);
    expect(Object.keys(map)).not.toContain('');
    expect(Object.keys(map)).not.toContain('  ');
    expect(map['ValidTerm']).toBe('[redacted]');
  });

  it('returns an empty map when called with no arguments', () => {
    const map = buildReplacementMap();
    expect(Object.keys(map).length).toBe(0);
  });

});

// =============================================================================
// stripPII
// =============================================================================
// These tests verify that stripPII correctly replaces all PII in text using
// a map produced by buildReplacementMap.

describe('stripPII', () => {

  it('replaces an employer name in running text', () => {
    const map = buildReplacementMap({}, [{ employer: 'Google' }]);
    const result = stripPII('I worked at Google for three years.', map);
    expect(result).toBe('I worked at [Employer 1] for three years.');
  });

  it('replacement is case-insensitive', () => {
    // "GOOGLE", "google", and "Google" should all become [Employer 1].
    const map = buildReplacementMap({}, [{ employer: 'Google' }]);
    const result = stripPII('i worked at GOOGLE and google.', map);
    expect(result).toBe('i worked at [Employer 1] and [Employer 1].');
  });

  it('replaces the full name as a unit rather than producing a partial replacement', () => {
    // If we replaced "Jane" first, "Jane Smith" would become "[Your name] Smith",
    // which is wrong. Full names must be matched first (longest-first sorting
    // in piiUtils ensures this).
    const map = buildReplacementMap({ first_name: 'Jane', last_name: 'Smith' }, []);
    const result = stripPII('My name is Jane Smith.', map);
    expect(result).toBe('My name is [Your name].');
  });

  it('replaces the first name alone when it appears without the last name', () => {
    const map = buildReplacementMap({ first_name: 'Jane', last_name: 'Smith' }, []);
    const result = stripPII('Reported to Jane on all projects.', map);
    expect(result).toBe('Reported to [Your name] on all projects.');
  });

  it('replaces multiple different PII items in a single string', () => {
    const map = buildReplacementMap(
      { first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' },
      [{ employer: 'Acme Corp' }]
    );
    const result = stripPII(
      'Jane Smith worked at Acme Corp. Contact: jane@example.com.',
      map
    );
    expect(result).toBe(
      '[Your name] worked at [Employer 1]. Contact: [email address].'
    );
  });

  it('leaves text unchanged when it contains no PII', () => {
    const map = buildReplacementMap({ first_name: 'Jane' }, []);
    const input = 'Led a cross-functional team to deliver the project on time.';
    expect(stripPII(input, map)).toBe(input);
  });

  it('returns null unchanged (does not throw)', () => {
    // The function might receive null from an optional field — it should not crash.
    const map = buildReplacementMap({ first_name: 'Jane' }, []);
    expect(stripPII(null, map)).toBe(null);
  });

  it('returns undefined unchanged (does not throw)', () => {
    const map = buildReplacementMap({ first_name: 'Jane' }, []);
    expect(stripPII(undefined, map)).toBe(undefined);
  });

  it('handles an empty replacement map without modifying text', () => {
    const map = buildReplacementMap();
    const input = 'Some text with no PII configured.';
    expect(stripPII(input, map)).toBe(input);
  });

  it('handles special regex characters in PII terms without throwing', () => {
    // An employer name like "A.I. Corp (Ltd)" contains regex metacharacters.
    // buildReplacementMap should escape these so the regex does not fail.
    const map = buildReplacementMap({}, [{ employer: 'A.I. Corp (Ltd)' }]);
    const result = stripPII('I worked at A.I. Corp (Ltd) for two years.', map);
    expect(result).toBe('I worked at [Employer 1] for two years.');
  });

});
