// Input gate for the behaviour cases (S5 R8, coordinator 16.09): a run must not start on an input set
// nobody checked. The S4 review diff declared 9 added lines and held 6 — `git apply` calls that a
// corrupt patch — yet both runs reported the inputs as complete and the reviewer had to find it.
// node scripts/artifacts.mjs <case-dir> [...]   exit 0 clean, 3 a rejected set, 2 a usage error.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PATCH = /\.(patch|diff)$/;
// Recognise a hash DECLARATION by its shape and validate it afterwards. Matching only well-formed
// declarations meant a 63-character sum or a target with a slash was skipped instead of failing (F4).
const HASH = /`([^`]+)`\s+`([^`]+)`/g;
const SHA256 = /^[0-9a-f]{64}$/;
const TASK_REF = /artifacts\/([\w-]+(?:\.[\w-]+)+)/g; // stops at the extension, not at the sentence's full stop
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Declared set: one file name per line, `#` comments and trailing prose after the name ignored.
function declared(file) {
  return fs.readFileSync(file, 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0]);
}

// git refuses a patch whose hunk header disagrees with the hunk, so let git be the judge.
function patchError(patch) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-check-'));
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo });
    execFileSync('git', ['apply', '--check', path.resolve(patch)], { cwd: repo, env: { ...process.env, LC_ALL: 'C' }, stdio: 'pipe' });
    return null;
  } catch (e) {
    return (e.stderr?.toString() || e.message).trim().split('\n')[0];
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

export function checkCase(dir) {
  const errors = [];
  const fail = (code, file, msg) => errors.push({ code, file, msg });
  const artifacts = path.join(dir, 'artifacts');
  if (!fs.existsSync(artifacts)) { fail('artifacts_missing', artifacts, 'the case has no artifacts directory'); return errors; }
  const present = fs.readdirSync(artifacts).sort();

  const inputs = path.join(dir, 'inputs.txt');
  if (!fs.existsSync(inputs)) fail('inputs_missing', inputs, 'the case does not declare which files it gives the run');
  else {
    const want = declared(inputs);
    for (const name of want) if (!present.includes(name)) fail('declared_artifact_missing', path.join(artifacts, name), `declared in inputs.txt, not in the set`);
    for (const name of present) if (!want.includes(name)) fail('undeclared_artifact', path.join(artifacts, name), 'in the set, not declared in inputs.txt');
  }

  for (const name of present) {
    const file = path.join(artifacts, name);
    if (fs.statSync(file).size === 0) { fail('empty_artifact', file, 'empty file'); continue; }
    if (!PATCH.test(name)) continue;
    const bad = patchError(file);
    if (bad) fail('corrupt_patch', file, bad);
  }

  // A package that states a hash is making a claim the run will rely on; check it against the file.
  for (const name of present) {
    for (const line of fs.readFileSync(path.join(artifacts, name), 'utf8').split('\n')) {
      if (!/sha-?256/i.test(line)) continue;
      for (const [, target, hash] of line.matchAll(HASH)) {
        const file = path.join(artifacts, target);
        if (target.includes('/') || target.includes('\\')) fail('hash_declaration_invalid', path.join(artifacts, name), `declares a hash for "${target}": an artifact is a plain file name in this set`);
        else if (!SHA256.test(hash)) fail('hash_declaration_invalid', path.join(artifacts, name), `declares "${hash}" for ${target}: not a 64-character sha256 digest`);
        else if (!fs.existsSync(file)) fail('hash_target_missing', file, `${name} states a hash for a file the set does not hold`);
        else if (sha256(file) !== hash) fail('hash_mismatch', file, `${name} states ${hash.slice(0, 12)}…, the file is ${sha256(file).slice(0, 12)}…`);
      }
    }
  }

  for (const task of fs.readdirSync(dir).filter((f) => /^task\..*\.md$/.test(f))) {
    const text = fs.readFileSync(path.join(dir, task), 'utf8');
    for (const [, target] of text.matchAll(TASK_REF)) {
      if (!present.includes(target)) fail('artifact_not_provided', path.join(dir, task), `the task names artifacts/${target}, the set does not hold it`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node scripts/artifacts.mjs <case-dir> [...]'); process.exitCode = 2; }
  else {
    let bad = 0;
    for (const dir of dirs) {
      const errors = checkCase(dir);
      bad += errors.length;
      for (const e of errors) console.error(`${e.code}  ${e.file}: ${e.msg}`);
      console.log(`${errors.length ? 'REJECTED' : 'ok      '}  ${dir}`);
    }
    if (bad) { console.error(`refusing to run: ${bad} problem(s) in the input set`); process.exitCode = 3; }
  }
}
