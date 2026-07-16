import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const defaultListPath = fileURLToPath(new URL('./name-blocklist.json', import.meta.url));
const defaultConfig = readConfig(defaultListPath, true);
const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Common Cyrillic/Greek lookalikes used to evade ASCII filters. NFKC below
// already handles full-width and mathematical presentation forms.
const CONFUSABLES = new Map(Object.entries({
  'а': 'a', 'е': 'e', 'ё': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
  'у': 'y', 'к': 'k', 'м': 'm', 'т': 't', 'в': 'b', 'н': 'h', 'і': 'i', 'ј': 'j',
  'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'y', 'χ': 'x',
}));
const LEET = new Map(Object.entries({
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i',
}));

let extraCache = { path: null, mtimeMs: null, size: null, config: emptyConfig() };
let lastConfigError = null;

function emptyConfig() {
  return { blockedTerms: [], blockedNames: [], allowedProfanityTerms: [] };
}

function readConfig(path, required = false) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
    const config = emptyConfig();
    for (const key of Object.keys(config)) {
      if (parsed[key] === undefined) continue;
      if (!Array.isArray(parsed[key]) || parsed[key].some((item) => typeof item !== 'string')) {
        throw new Error(`${key} must be an array of strings`);
      }
      config[key] = parsed[key];
    }
    return config;
  } catch (error) {
    if (required) throw error;
    const message = `Could not load NAME_BLOCKLIST_FILE ${path}: ${error.message}`;
    if (message !== lastConfigError) {
      console.error(message);
      lastConfigError = message;
    }
    return emptyConfig();
  }
}

function externalConfig() {
  const path = process.env.NAME_BLOCKLIST_FILE?.trim();
  if (!path) {
    extraCache = { path: null, mtimeMs: null, size: null, config: emptyConfig() };
    return extraCache.config;
  }

  try {
    const { mtimeMs, size } = fs.statSync(path);
    if (extraCache.path !== path || extraCache.mtimeMs !== mtimeMs || extraCache.size !== size) {
      extraCache = { path, mtimeMs, size, config: readConfig(path) };
      lastConfigError = null;
    }
  } catch (error) {
    const message = `Could not load NAME_BLOCKLIST_FILE ${path}: ${error.message}`;
    if (message !== lastConfigError) {
      console.error(message);
      lastConfigError = message;
    }
    extraCache = { path, mtimeMs: null, size: null, config: emptyConfig() };
  }
  return extraCache.config;
}

function normalize(value, decodeLeet = false) {
  let result = String(value).normalize('NFKC').toLowerCase();
  result = [...result].map((character) => CONFUSABLES.get(character) ?? character).join('');
  result = result.normalize('NFKD').replace(/\p{Mark}/gu, '');
  if (decodeLeet) result = [...result].map((character) => LEET.get(character) ?? character).join('');
  return result.replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

function collapseRepeats(value) {
  return value.replace(/([\p{Letter}\p{Number}])\1+/gu, '$1');
}

function forms(value) {
  const result = new Set();
  for (const normalized of [normalize(value), normalize(value, true)]) {
    if (!normalized) continue;
    const compact = normalized.replace(/ /g, '');
    result.add(normalized);
    result.add(compact);
    result.add(collapseRepeats(normalized));
    result.add(collapseRepeats(compact));
  }
  return result;
}

function compactForms(value) {
  return new Set([...forms(value)].map((form) => form.replace(/ /g, '')));
}

function compileConfig() {
  const extra = externalConfig();
  const combined = {};
  for (const key of Object.keys(emptyConfig())) combined[key] = [...defaultConfig[key], ...extra[key]];
  return {
    blockedTerms: new Set(combined.blockedTerms.flatMap((term) => [...compactForms(term)])),
    blockedNames: new Set(combined.blockedNames.flatMap((name) => [...compactForms(name)])),
    allowedProfanityTerms: new Set(combined.allowedProfanityTerms.flatMap((term) => [...compactForms(term)])),
  };
}

function containsConfiguredBlock(name, config) {
  const candidates = compactForms(name);
  for (const candidate of candidates) {
    if (config.blockedNames.has(candidate)) return true;
    for (const term of config.blockedTerms) {
      if (candidate.includes(term)) return true;
    }
  }
  return false;
}

function containsProfanity(name, config) {
  const candidates = new Set();
  for (const form of forms(name)) {
    candidates.add(form);
    candidates.add(form.replace(/ /g, ''));
    for (const word of form.split(' ')) if (word) candidates.add(word);
  }

  for (const candidate of candidates) {
    for (const match of profanityMatcher.getAllMatches(candidate, true)) {
      const term = englishDataset.getPayloadWithPhraseMetadata(match).phraseMetadata?.originalWord;
      const normalizedTerm = normalize(term ?? '', true).replace(/ /g, '');
      if (config.allowedProfanityTerms.has(normalizedTerm)) continue;
      // Profanity matching is deliberately whole-word/whole-name here. Broad
      // substring filters reject real international names (for example Arsema,
      // Anuska and Peniston). Clear compounds belong in blockedTerms instead.
      if (match.startIndex === 0 && match.endIndex === candidate.length - 1) return true;
    }
  }
  return false;
}

export function isBlockedName(name) {
  const config = compileConfig();
  return containsConfiguredBlock(name, config) || containsProfanity(name, config);
}

export const BLOCKED_NAME_ERROR = 'That name is not allowed. Please use a real, appropriate name.';
