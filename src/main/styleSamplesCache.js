'use strict';

// Shared singleton for the cover-letter style samples cache.
// Both the settings route (which clears it when the samples directory changes)
// and the AI route (which reads it) import this module.

let cache = null;

module.exports = {
  get:   ()  => cache,
  set:   (v) => { cache = v; },
  clear: ()  => { cache = null; },
};
