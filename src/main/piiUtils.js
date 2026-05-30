'use strict';

/**
 * Builds a map from real PII values to anonymous placeholders.
 *
 * Every AI call in the app must pass content through stripPII() before
 * sending it to the API. This ensures names, employer names, contact
 * details, and any user-defined sensitive terms never leave the device.
 *
 * @param {Object} personal - Personal details record from the database
 * @param {Array}  jobs     - Array of job records ({ employer, ... })
 * @param {Array}  extras   - Additional user-defined terms to exclude (strings)
 * @returns {Object} Map of { realValue: placeholder }
 */
function buildReplacementMap(personal = {}, jobs = [], extras = []) {
  const map = {};
  let employerIndex = 1;

  // Full name first — must come before individual parts so that when we sort
  // by length and strip longest-first, "Jane Smith" is replaced as a unit
  // rather than leaving "Smith" as a partial remnant.
  const fullName = [personal.first_name, personal.last_name].filter(Boolean).join(' ');
  if (fullName) map[fullName] = '[Your name]';
  if (personal.first_name) map[personal.first_name] = '[Your name]';
  if (personal.last_name)  map[personal.last_name]  = '[Your name]';

  if (personal.email)   map[personal.email]   = '[email address]';
  if (personal.phone)   map[personal.phone]   = '[phone number]';
  if (personal.address) map[personal.address] = '[address]';

  for (const job of jobs) {
    if (job.employer && !map[job.employer]) {
      map[job.employer] = `[Employer ${employerIndex++}]`;
    }
  }

  for (const term of extras) {
    const t = (term || '').trim();
    if (t && !map[t]) map[t] = '[redacted]';
  }

  return map;
}

/**
 * Replaces all occurrences of PII terms in a string using a replacement map.
 * Matching is case-insensitive. Longer terms are replaced before shorter ones
 * to prevent partial matches (e.g. "Jane" replacing inside "Jane Smith").
 *
 * @param {string} text           - Input text that may contain PII
 * @param {Object} replacementMap - Map produced by buildReplacementMap()
 * @returns {string} Text with all recognised PII replaced by placeholders
 */
function stripPII(text, replacementMap) {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // Sort descending by length so longer matches (full name) replace before
  // shorter ones (first name alone), preventing double-replacement artifacts.
  const terms = Object.keys(replacementMap).sort((a, b) => b.length - a.length);

  for (const term of terms) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), replacementMap[term]);
  }

  return result;
}

module.exports = { buildReplacementMap, stripPII };
