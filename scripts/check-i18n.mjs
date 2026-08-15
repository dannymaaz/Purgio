import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveLanguage } from '../src/i18n-core.ts';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const i18nPath = join(sourceRoot, 'i18n.tsx');
const dictionary = readFileSync(i18nPath, 'utf8');

const dictionaryKeys = new Set();
const dictionaryKeyPattern = /^\s*'((?:\\'|[^'])+)':\s/mg;
for (const match of dictionary.matchAll(dictionaryKeyPattern)) {
  dictionaryKeys.add(match[1].replaceAll("\\'", "'"));
}

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(entry) && path !== i18nPath) files.push(path);
  }
}
walk(sourceRoot);

const missing = [];
const usagePattern = /\bt\(\s*'((?:\\'|[^'])+)'/g;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(usagePattern)) {
    const key = match[1].replaceAll("\\'", "'");
    if (!dictionaryKeys.has(key)) {
      missing.push(`${relative(root, file)}: ${key}`);
    }
  }
}

if (missing.length > 0) {
  console.error('Missing English translations for literal t() keys:');
  for (const item of [...new Set(missing)].sort()) console.error(`- ${item}`);
  process.exit(1);
}

const localeCases = [
  ['system', 'es-GT', 'es'],
  ['system', 'es_ES', 'es'],
  ['system', 'en-US', 'en'],
  ['system', 'fr-FR', 'en'],
  ['system', null, 'en'],
  ['es', 'en-US', 'es'],
  ['en', 'es-GT', 'en'],
];

for (const [preference, locale, expected] of localeCases) {
  const actual = resolveLanguage(preference, locale);
  if (actual !== expected) {
    console.error(`Locale resolution failed: ${preference}/${locale} -> ${actual}; expected ${expected}`);
    process.exit(1);
  }
}

console.log(`i18n coverage OK: ${dictionaryKeys.size} English message keys; ${localeCases.length} locale cases passed.`);
