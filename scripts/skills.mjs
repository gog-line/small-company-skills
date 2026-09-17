// Structure and parity check for skills/{pl,en} (docs/pl/SKILLE-ARCHITEKTURA.md, D2–D6).
// node scripts/skills.mjs check [--release] | sync | record <skill> <evidence-id>
// Lengths are counted in characters, as the spec's 1024 limit is; byte counts (e.g. BSD awk `length`)
// overstate Polish text, because diacritics and the em dash take several bytes each.
// A pair shown as `unrecorded` with an overall OK is expected until its first parity evidence (S4/S5);
// `check --release` rejects it, so the release gate never lets it through.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGS = ['pl', 'en'];
// Układ jednojęzyczny: gdy nie ma `skills/pl` ani `skills/en`, skille leżą bezpośrednio w `skills/`,
// a wspólny protokół w `skills/_shared/protocol.md`. Kontrola par językowych wtedy nie obowiązuje —
// nie ma z czym porównywać, a udawanie, że jest, dałoby zieloną kontrolę bez znaczenia.
export function languages(root) {
  const pairs = LANGS.filter((l) => fs.existsSync(path.join(root, 'skills', l)));
  return pairs.length ? pairs : [null];
}
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Only portable Agent Skills fields; host extensions belong in adapters (D4).
const PORTABLE = new Set(['name', 'description', 'metadata', 'license', 'compatibility']);
const HOST_SYNTAX = /^\s*!`|\$\{CLAUDE_/m;
const OPEN = '<!-- shared:protocol -->\n';
const CLOSE = '<!-- /shared -->';
const CATEGORY = /^\|\s*`([a-z-]+\.\d+)`\s*\|/gm;
// The supported YAML subset, stated as an ALLOWLIST (S5 R3, then F1 of round 2): an unquoted key whose
// value is a PLAIN SCALAR, nested at most one level. Naming the forbidden constructions did not work —
// closing `|`, `>` and quoted keys still let through a multi-line quoted scalar, `[a, b]`, `{k: v}`,
// `null` and a comment-as-value. Anything that is not a plain scalar is now rejected, including the
// construction nobody has thought of yet. Quoted values are rejected too: the skills do not need them.
const KEY = /^([ \t]*)([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/;
const YAML_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;
const NULLISH = /^(null|Null|NULL|~|false|true|False|True)$/;
// A plain scalar holds no `: ` (that would be a mapping), no ` #` (a comment), no tab.
const plainScalar = (v) => v !== '' && !YAML_INDICATOR.test(v) && !/:\s/.test(v) && !/\s#/.test(v) && !/\t/.test(v);
const PARITY_KEYS = ['pl', 'en', 'evidence', 'recorded'];
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;
// `Date.parse` normalises a day that never existed (2026-02-30 becomes 2026-03-02), so check the calendar.
function realUtcDate(v) {
  const m = typeof v === 'string' && v.match(ISO_UTC);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days && h < 24 && mi < 60 && se < 60;
}
const SHA256 = /^[0-9a-f]{64}$/;

const read = (f) => fs.readFileSync(f, 'utf8');
const skillsDir = (root, lang) => (lang === null ? path.join(root, 'skills') : path.join(root, 'skills', lang));
const protocolFile = (root, lang) => (lang === null ? path.join(root, 'skills', '_shared', 'protocol.md') : path.join(root, 'skills', 'shared', lang, 'protocol.md'));
const parityFile = (root) => path.join(root, 'skills', 'parity.json');

function skillNames(root, lang) {
  const dir = skillsDir(root, lang);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => !d.startsWith('_') && d !== 'shared' && fs.existsSync(path.join(dir, d, 'SKILL.md'))).sort() : [];
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fields = {};
  const unsupported = [];
  let openBlock = false; // a top-level key with no value may introduce one level of nesting
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const k = line.match(KEY);
    const value = k?.[3] ?? '';
    if (!k || (value !== '' && !plainScalar(value)) || (k[1] && !openBlock)) { unsupported.push(line); continue; }
    if (k[1]) continue;              // a nested key under the open block
    openBlock = value === '';
    if (!openBlock) fields[k[2]] = value;
  }
  return { fields, body: text.slice(m[0].length), unsupported };
}

// Text between the markers, or null when the block is missing or appears more than once.
function protocolBlock(body) {
  const start = body.indexOf(OPEN);
  if (start < 0 || body.indexOf(OPEN, start + 1) >= 0) return null;
  const end = body.indexOf(CLOSE, start);
  return end < 0 ? null : body.slice(start + OPEN.length, end);
}

function treeHash(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const h = crypto.createHash('sha256');
  for (const f of files.map((p) => path.relative(dir, p)).sort()) h.update(`${f}\0${read(path.join(dir, f))}\0`);
  return h.digest('hex');
}

// Transitional rule until the contracts of step 2 own the canonical role profile (S1 brief, D3):
// a role declares exactly five categories, `<prefix>.1`…`<prefix>.5`. The PL/EN comparison alone
// passes a defect that both languages share, so the ids need a rule that does not look at the pair.
// The stage is explicitly PARTIAL: this checks the shape of the id set, never whether `pm.3` means
// what the role profile says it means. That check belongs to the contracts of step 2.
function categoryError(ids) {
  if (ids.length !== 5) return `${ids.length} category ids, expected exactly 5`;
  const prefixes = [...new Set(ids.map((id) => id.split('.')[0]))];
  if (prefixes.length !== 1) return `mixed category prefixes: ${prefixes.join(', ')}`;
  const numbers = [...new Set(ids.map((id) => id.split('.')[1]))].sort();
  return numbers.join(',') === '1,2,3,4,5' ? null : `ids are not ${prefixes[0]}.1…${prefixes[0]}.5: ${ids.join(', ')}`;
}

// A parity record is a dated claim backed by behaviour evidence; matching hashes alone are not one (S5 R4).
// The evidence has to be a behaviour record that EXISTS and belongs to this pair — otherwise any
// non-empty string stood in for a review that never happened (F3).
export function evidenceError(root, name, evidence) {
  const paths = String(evidence).split(',').map((p) => p.trim()).filter(Boolean);
  if (!paths.length) return 'empty evidence id';
  for (const rel of paths) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return `evidence "${rel}" is not a file in this repo`;
    if (!path.basename(rel).startsWith(`${name}.`)) return `evidence "${rel}" does not belong to ${name}`;
  }
  return null;
}

function parityRecordError(rec) {
  const keys = Object.keys(rec).sort();
  if (keys.join(',') !== [...PARITY_KEYS].sort().join(',')) return `keys are not exactly ${PARITY_KEYS.join(', ')}: ${keys.join(', ') || '(none)'}`;
  if (typeof rec.evidence !== 'string' || !rec.evidence.trim()) return 'empty evidence id';
  if (!realUtcDate(rec.recorded)) return `recorded "${rec.recorded}" is not a real ISO-8601 UTC timestamp`;
  const badHash = LANGS.find((l) => typeof rec[l] !== 'string' || !SHA256.test(rec[l]));
  return badHash ? `${badHash} is not a sha256 digest` : null;
}

const readParity = (root) => (fs.existsSync(parityFile(root)) ? JSON.parse(read(parityFile(root))) : {});

export function checkRepo(root, { release = false } = {}) {
  const LANGS = languages(root);
  const single = LANGS.length === 1 && LANGS[0] === null;
  const errors = [];
  const fail = (code, file, msg) => errors.push({ code, file: path.relative(root, file), msg });
  const ids = {};

  for (const lang of LANGS) {
    const protocol = fs.existsSync(protocolFile(root, lang)) ? read(protocolFile(root, lang)) : null;
    if (protocol === null) fail('protocol_source_missing', protocolFile(root, lang), 'no shared protocol source');
    for (const name of skillNames(root, lang)) {
      const file = path.join(skillsDir(root, lang), name, 'SKILL.md');
      const fm = frontmatter(read(file));
      if (!fm) { fail('frontmatter', file, 'missing YAML frontmatter'); continue; }
      const { fields, body, unsupported } = fm;
      for (const line of unsupported) fail('frontmatter_syntax', file, `unsupported YAML line: ${line.trim()}`);
      if (!NAME.test(fields.name ?? '') || fields.name.length > 64) fail('name_format', file, `invalid name "${fields.name ?? ''}"`);
      else if (fields.name !== name) fail('name_dir_mismatch', file, `name "${fields.name}" differs from directory "${name}"`);
      if (!fields.description || fields.description.length > 1024) fail('description_length', file, 'description empty or over 1024 characters');
      else if (NULLISH.test(fields.description)) fail('description_length', file, `description is the YAML value "${fields.description}", not text`);
      for (const key of Object.keys(fields)) if (!PORTABLE.has(key)) fail('host_field', file, `non-portable field "${key}"`);
      if (HOST_SYNTAX.test(body)) fail('host_syntax', file, 'host-only syntax in the body');
      const block = protocolBlock(body);
      if (block === null) fail('protocol_missing', file, 'shared protocol block missing or repeated');
      else if (protocol !== null && block !== protocol) fail('protocol_drift', file, 'protocol block differs from its source; run sync');
      const found = [...body.matchAll(CATEGORY)].map((m) => m[1]).sort();
      const idError = categoryError(found);
      if (idError) fail('category_ids_invalid', file, idError);
      (ids[name] ??= {})[lang] = found.join(',');
    }
  }

  if (single) {
    const names = skillNames(root, null);
    if (!names.length) fail('no_skills', path.join(root, 'skills'), 'no skill found — an empty set passes every check because there is nothing to break');
    return { errors, pairs: names.map((name) => ({ name, status: 'single-language' })) };
  }

  const all = [...new Set(LANGS.flatMap((l) => skillNames(root, l)))].sort();
  if (!all.length) fail('no_skills', path.join(root, 'skills'), 'no skill found — an empty set passes every check because there is nothing to break');
  const parity = readParity(root);
  const pairs = [];
  for (const name of all) {
    const missing = LANGS.filter((l) => !skillNames(root, l).includes(name));
    if (missing.length) {
      fail('pair_missing', path.join(root, 'skills'), `${name} has no ${missing.join('/')} version`);
      continue;
    }
    if (ids[name].pl !== ids[name].en) fail('category_ids_mismatch', path.join(root, 'skills'), `${name}: PL [${ids[name].pl}] vs EN [${ids[name].en}]`);
    const rec = parity[name];
    const recError = rec ? parityRecordError(rec) : null;
    if (recError) fail('parity_record_invalid', parityFile(root), `${name}: ${recError}`);
    const evError = rec && !recError ? evidenceError(root, name, rec.evidence) : null;
    if (evError) fail('parity_evidence_missing', parityFile(root), `${name}: ${evError}`);
    const bad = recError || evError;
    const current = rec && !bad && LANGS.every((l) => rec[l] === treeHash(path.join(skillsDir(root, l), name)));
    const status = !rec ? 'unrecorded' : bad ? 'invalid' : current ? 'current' : 'stale';
    pairs.push({ name, status });
    if (release && status === 'stale') fail('parity_stale', parityFile(root), `${name}: changed since its parity record`);
    if (release && status === 'unrecorded') fail('parity_unrecorded', parityFile(root), `${name}: no parity record`);
  }
  return { errors, pairs };
}

// Writes each source protocol into every SKILL.md block of its language; returns the changed files.
export function sync(root) {
  const LANGS = languages(root);
  const changed = [];
  for (const lang of LANGS) {
    const protocol = read(protocolFile(root, lang));
    for (const name of skillNames(root, lang)) {
      const file = path.join(skillsDir(root, lang), name, 'SKILL.md');
      const text = read(file);
      const block = protocolBlock(text);
      if (block === null || block === protocol) continue;
      const start = text.indexOf(OPEN) + OPEN.length;
      fs.writeFileSync(file, text.slice(0, start) + protocol + text.slice(start + block.length));
      changed.push(path.relative(root, file));
    }
  }
  return changed;
}

// Records that both language versions of a skill match, with the id of the behaviour evidence (S4).
export function recordParity(root, name, evidence) {
  const evError = evidenceError(root, name, evidence);
  if (evError) throw new Error(`parity record needs evidence that exists and belongs to the pair: ${evError}`);
  const parity = readParity(root);
  parity[name] = { ...Object.fromEntries(LANGS.map((l) => [l, treeHash(path.join(skillsDir(root, l), name))])), evidence, recorded: new Date().toISOString() };
  const sorted = Object.fromEntries(Object.keys(parity).sort().map((k) => [k, parity[k]]));
  fs.writeFileSync(parityFile(root), `${JSON.stringify(sorted, null, 2)}\n`);
}

// Markdown table of the skills of one language, generated from the files themselves so a README
// cannot drift away from what the skills actually say.
export function skillTable(root, lang = null) {
  const rows = [];
  for (const name of skillNames(root, lang)) {
    const text = read(path.join(skillsDir(root, lang), name, 'SKILL.md'));
    const fm = frontmatter(text);
    const role = (fm.body.match(/^#[^\n]*\n+([^\n]+)/m) || [, ''])[1].trim();
    const cats = [...fm.body.matchAll(/^\|\s*`([a-z-]+\.\d+)`\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => `\`${m[1]}\` ${m[2]}`);
    const rel = lang === null ? `skills/${name}` : `skills/${lang}/${name}`;
    rows.push(`| [\`${name}\`](${rel}/SKILL.md) | ${role} | ${cats.join('; ')} |`);
  }
  return rows.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'sync') {
    const changed = sync(root);
    console.log(changed.length ? changed.join('\n') : 'no protocol block changed');
  } else if (cmd === 'record' && args.length === 2) {
    try {
      recordParity(root, args[0], args[1]);
      console.log(`parity recorded: ${args[0]}`);
    } catch (e) {
      console.error(`error: ${e.message}`);
      process.exitCode = 2;
    }
  } else if (cmd === 'check') {
    const { errors, pairs } = checkRepo(root, { release: args.includes('--release') });
    for (const e of errors) console.log(`${e.code}  ${e.file}: ${e.msg}`);
    for (const p of pairs) console.log(`pair ${p.name}: ${p.status}`);
    console.log(errors.length ? `FAIL: ${errors.length} error(s)` : 'OK');
    process.exitCode = errors.length ? 1 : 0;
  } else if (cmd === 'table') {
    console.log(skillTable(root, args[0] ?? null));
  } else {
    console.error('usage: node scripts/skills.mjs check [--release] | sync | record <skill> <evidence-id> | table <lang>');
    process.exitCode = 2;
  }
}
