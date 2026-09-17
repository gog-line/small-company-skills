// Input gate for the behaviour cases: a case that cannot be trusted must not start a run.
// The broken sets come first and must be rejected with their own code (S3 order, coordinator's rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCase } from './artifacts.mjs';

const GOOD_PATCH = `diff --git a/src/filter.js b/src/filter.js
new file mode 100644
--- /dev/null
+++ b/src/filter.js
@@ -0,0 +1,2 @@
+export const ok = true;
+export const two = 2;
`;
// The exact defect Astra found: the header declares 9 added lines, the hunk holds 6 (fc7d754).
const CORRUPT_PATCH = GOOD_PATCH.replace('@@ -0,0 +1,2 @@', '@@ -0,0 +1,9 @@');

// A case dir with a task and an artifact set; `edit` breaks it before the gate runs.
function caseDir(edit = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'case-gate-'));
  const files = {
    'inputs.txt': '# what this case deliberately gives the run\npackage.md — the frozen package\ndiff.patch — the change under review\n',
    'task.pl.md': '/company-review Zrecenzuj zmianę z pakietu artifacts/package.md (diff w artifacts/diff.patch).\n',
    'task.en.md': '/company-review Review the change in artifacts/package.md (diff in artifacts/diff.patch).\n',
    'artifacts/package.md': '# Package\n\n- Package artifacts, sha256: `diff.patch` `HASH`.\n',
    'artifacts/diff.patch': GOOD_PATCH,
  };
  edit(files);
  if (files['artifacts/package.md']?.includes('`HASH`')) {
    const h = crypto.createHash('sha256').update(files['artifacts/diff.patch'] ?? '').digest('hex');
    files['artifacts/package.md'] = files['artifacts/package.md'].replace('`HASH`', `\`${h}\``);
  }
  for (const [rel, body] of Object.entries(files)) {
    if (body === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}
import crypto from 'node:crypto';
const codes = (dir) => checkCase(dir).map((e) => e.code);

test('negative: a diff whose hunk header lies about its line count is rejected', () => {
  assert.ok(codes(caseDir((f) => { f['artifacts/diff.patch'] = CORRUPT_PATCH; })).includes('corrupt_patch'));
});

test('negative: an empty artifact is rejected', () => {
  assert.ok(codes(caseDir((f) => { f['artifacts/test-output.txt'] = ''; })).includes('empty_artifact'));
});

test('negative: a hash in the package that does not match the file is rejected', () => {
  assert.ok(codes(caseDir((f) => {
    f['artifacts/package.md'] = `# Package\n\n- Package artifacts, sha256: \`diff.patch\` \`${'0'.repeat(64)}\`.\n`;
  })).includes('hash_mismatch'));
});

test('negative: a declared artifact that is not in the set is rejected', () => {
  assert.ok(codes(caseDir((f) => {
    f['artifacts/package.md'] = `# Package\n\n- Package artifacts, sha256: \`missing.txt\` \`${'0'.repeat(64)}\`.\n`;
  })).includes('hash_target_missing'));
});

test('negative: a file the case did not declare is rejected (the old package-no-authors.md case)', () => {
  assert.ok(codes(caseDir((f) => { f['artifacts/package-no-authors.md'] = '# Package without authors\n'; })).includes('undeclared_artifact'));
});

test('negative: a declared file that is not in the set is rejected', () => {
  assert.ok(codes(caseDir((f) => { f['inputs.txt'] += 'test-output.txt — the test run\n'; })).includes('declared_artifact_missing'));
});

test('negative: a case with no inputs.txt declares nothing and is rejected', () => {
  assert.ok(codes(caseDir((f) => { f['inputs.txt'] = null; })).includes('inputs_missing'));
});

test('negative: a case with no artifacts dir is rejected', () => {
  assert.ok(codes(caseDir((f) => { f['artifacts/package.md'] = null; f['artifacts/diff.patch'] = null; })).includes('artifacts_missing'));
});

test('negative: a task naming an artifact the set does not hold is rejected', () => {
  assert.ok(codes(caseDir((f) => { f['task.pl.md'] = '/company-review Zrecenzuj artifacts/package.md i artifacts/test-output.txt.\n'; })).includes('artifact_not_provided'));
});

// Round 2 finding F4: a declaration is recognised by its SHAPE, not by already being well formed.
for (const [label, decl] of [
  ['a sum with 63 characters', '`diff.patch` `' + '0'.repeat(63) + '`'],
  ['a target written as a path', '`missing/nope.md` `' + '0'.repeat(64) + '`'],
  ['a sum that is not hex', '`diff.patch` `zzzz' + '0'.repeat(60) + '`'],
]) {
  test(`negative: a hash declaration with ${label} is rejected, not skipped`, () => {
    const root = caseDir((f) => { f['artifacts/package.md'] = `# Package\n\n- Package artifacts, sha256: ${decl}.\n`; });
    const found = codes(root);
    assert.ok(found.some((c) => c.startsWith('hash_')), `expected a hash error, got ${found.join(',') || '(none)'}`);
  });
}

// Healthy cases, written after the broken ones had failed as required.
test('healthy: a well-formed case passes', () => {
  assert.deepEqual(checkCase(caseDir()), []);
});

test('healthy: every real case in the repo passes the gate', () => {
  const root = path.resolve(import.meta.dirname, '..', 'tests/skills-behaviour/cases');
  const dirs = fs.readdirSync(root).flatMap((skill) => fs.readdirSync(path.join(root, skill)).map((c) => path.join(root, skill, c)));
  assert.ok(dirs.length >= 6, `expected the repo's case dirs, found ${dirs.length}`); // grows with each skill sampled
  for (const dir of dirs) assert.deepEqual(checkCase(dir), [], dir);
});
