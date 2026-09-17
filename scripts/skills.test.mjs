// Structure check for skills/{pl,en}: the broken cases come first and must be rejected with their own code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkRepo, recordParity, sync } from './skills.mjs';

const PROTOCOL = { pl: '## Protokół\n\nZałożenia.\n', en: '## Protocol\n\nAssumptions.\n' };

function skillMd({ name = 'company-demo', extra = '', block, lang, ids = ['demo.1', 'demo.2', 'demo.3', 'demo.4', 'demo.5'] }) {
  return `---\nname: ${name}\ndescription: Demo skill used by the structure check tests.\n${extra}metadata:\n  role: demo\n---\n\n# ${name}\n\n<!-- shared:protocol -->\n${block ?? PROTOCOL[lang]}<!-- /shared -->\n\n${ids.map((id) => `| \`${id}\` | action |`).join('\n')}\n`;
}

// A throwaway repo with one skill in both languages; `edit` changes files before the check.
function repo(edit = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-check-'));
  const files = {};
  for (const lang of ['pl', 'en']) {
    files[`skills/shared/${lang}/protocol.md`] = PROTOCOL[lang];
    files[`skills/${lang}/company-demo/SKILL.md`] = skillMd({ lang });
  }
  edit(files);
  for (const [rel, body] of Object.entries(files)) {
    if (body === null) continue;
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}
const codes = (r) => r.errors.map((e) => e.code);
// A record has to point at a behaviour record that exists and belongs to the pair (F3).
function evidenceFile(root, name = 'company-demo') {
  const rel = `runs/${name}.valid.pl.a1.jsonl`;
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), '{}\n');
  return rel;
}

test('negative: a name that breaks the spec format is rejected', () => {
  const root = repo((f) => {
    for (const lang of ['pl', 'en']) {
      delete f[`skills/${lang}/company-demo/SKILL.md`];
      f[`skills/${lang}/Company_Demo/SKILL.md`] = skillMd({ lang, name: 'Company_Demo' });
    }
  });
  assert.ok(codes(checkRepo(root)).includes('name_format'));
});

test('negative: a host-specific frontmatter field is rejected', () => {
  const root = repo((f) => { f['skills/pl/company-demo/SKILL.md'] = skillMd({ lang: 'pl', extra: 'allowed-tools: Bash\n' }); });
  const r = checkRepo(root);
  assert.ok(codes(r).includes('host_field'));
  assert.ok(r.errors.some((e) => e.code === 'host_field' && e.file.includes('skills/pl/')));
});

test('negative: a hand-edited protocol block is rejected as drift', () => {
  const root = repo((f) => { f['skills/en/company-demo/SKILL.md'] = skillMd({ lang: 'en', block: '## Protocol\n\nAssumptions, edited by hand.\n' }); });
  assert.ok(codes(checkRepo(root)).includes('protocol_drift'));
});

test('negative: a pair changed after its parity record is stale in the release check', () => {
  const root = repo();
  recordParity(root, 'company-demo', evidenceFile(root));
  fs.appendFileSync(path.join(root, 'skills/en/company-demo/SKILL.md'), '\nOne more English line.\n');
  const r = checkRepo(root, { release: true });
  assert.ok(codes(r).includes('parity_stale'));
  assert.equal(r.pairs.find((p) => p.name === 'company-demo').status, 'stale');
});

// Round 2 (S5 findings R3, R4, R5): written and run RED against the unfixed validator first.
test('negative: a quoted frontmatter key is rejected instead of being skipped', () => {
  const root = repo((f) => { f['skills/pl/company-demo/SKILL.md'] = skillMd({ lang: 'pl', extra: '"allowed-tools": Bash\n' }); });
  assert.ok(codes(checkRepo(root)).includes('frontmatter_syntax'));
});

test('negative: a block scalar description is rejected, since the 1024-character limit cannot be applied to it', () => {
  const root = repo((f) => {
    f['skills/en/company-demo/SKILL.md'] = skillMd({ lang: 'en' })
      .replace(/^description: .*$/m, `description: |\n  ${'x'.repeat(600)}\n  ${'x'.repeat(600)}`);
  });
  assert.ok(codes(checkRepo(root)).includes('frontmatter_syntax'));
});

test('negative: a parity record stripped of its evidence and date is rejected', () => {
  const root = repo();
  recordParity(root, 'company-demo', evidenceFile(root));
  const file = path.join(root, 'skills/parity.json');
  const parity = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete parity['company-demo'].evidence;
  delete parity['company-demo'].recorded;
  fs.writeFileSync(file, JSON.stringify(parity, null, 2));
  const r = checkRepo(root, { release: true });
  assert.ok(codes(r).includes('parity_record_invalid'));
  assert.notEqual(r.pairs.find((p) => p.name === 'company-demo').status, 'current');
});

test('negative: a parity record with a free-text date or an unknown key is rejected', () => {
  const file = (root) => path.join(root, 'skills/parity.json');
  const edited = (change) => {
    const root = repo();
    recordParity(root, 'company-demo', evidenceFile(root));
    const parity = JSON.parse(fs.readFileSync(file(root), 'utf8'));
    change(parity['company-demo']);
    fs.writeFileSync(file(root), JSON.stringify(parity, null, 2));
    return checkRepo(root, { release: true });
  };
  assert.ok(codes(edited((rec) => { rec.recorded = 'yesterday'; })).includes('parity_record_invalid'));
  assert.ok(codes(edited((rec) => { rec.note = 'looks fine to me'; })).includes('parity_record_invalid'));
});

test('negative: recordParity refuses an empty evidence id', () => {
  const root = repo();
  assert.throws(() => recordParity(root, 'company-demo', '   '), /evidence/);
  assert.equal(fs.existsSync(path.join(root, 'skills/parity.json')), false);
});

// A common defect in BOTH languages passes the PL/EN comparison, so the ids need a rule of their own (R5).
for (const [label, ids] of [
  ['missing one', ['demo.1', 'demo.2', 'demo.3', 'demo.4']],
  ['outside 1..5', ['demo.1', 'demo.2', 'demo.3', 'demo.4', 'demo.99']],
  ['repeated', ['demo.1', 'demo.2', 'demo.3', 'demo.4', 'demo.4']],
]) {
  test(`negative: category ids ${label} in BOTH languages are rejected`, () => {
    const root = repo((f) => {
      for (const lang of ['pl', 'en']) f[`skills/${lang}/company-demo/SKILL.md`] = skillMd({ lang, ids });
    });
    const r = checkRepo(root);
    assert.ok(codes(r).includes('category_ids_invalid'));
    assert.ok(!codes(r).includes('category_ids_mismatch'));
  });
}

// Round 2 findings F1 and F3: the bypasses Astra proved, written and run RED before the fix.
// F1 is an allowlist now: anything that is not a plain scalar is rejected, so a fourth construction
// nobody thought of is rejected too.
for (const [label, value] of [
  ['a multi-line quoted scalar', '"start\n  x: ' + 'a'.repeat(600) + '\n  y: ' + 'b'.repeat(600) + '"'],
  ['a sequence', '[hello, world]'],
  ['a null', 'null'],
  ['a mapping', '{allowed-tools: Bash}'],
  ['a comment instead of a value', '# no description'],
  ['an anchor', '&anchor text'],
]) {
  test(`negative: a description that is ${label} is rejected`, () => {
    const root = repo((f) => {
      f['skills/pl/company-demo/SKILL.md'] = skillMd({ lang: 'pl' }).replace(/^description: .*$/m, `description: ${value}`);
    });
    const codesFound = codes(checkRepo(root));
    assert.ok(codesFound.includes('frontmatter_syntax') || codesFound.includes('description_length'),
      `expected a frontmatter error for ${label}, got ${codesFound.join(',') || '(none)'}`);
  });
}

test('negative: a parity record whose evidence is not an existing record file is rejected', () => {
  const root = repo();
  recordParity(root, 'company-demo', evidenceFile(root));
  const file = path.join(root, 'skills/parity.json');
  const parity = JSON.parse(fs.readFileSync(file, 'utf8'));
  parity['company-demo'].evidence = 'nonexistent-evidence-never-reviewed';
  fs.writeFileSync(file, JSON.stringify(parity, null, 2));
  const r = checkRepo(root, { release: true });
  assert.ok(codes(r).includes('parity_evidence_missing'));
  assert.notEqual(r.pairs.find((p) => p.name === 'company-demo').status, 'current');
});

test('negative: evidence that belongs to another pair is rejected', () => {
  const root = repo();
  const other = path.join(root, 'runs/company-other.valid.pl.a1.jsonl');
  fs.mkdirSync(path.dirname(other), { recursive: true });
  fs.writeFileSync(other, '{}\n');
  assert.throws(() => recordParity(root, 'company-demo', 'runs/company-other.valid.pl.a1.jsonl'), /company-demo/);
});

test('negative: a date that never existed is rejected', () => {
  const root = repo();
  recordParity(root, 'company-demo', evidenceFile(root));
  const file = path.join(root, 'skills/parity.json');
  const parity = JSON.parse(fs.readFileSync(file, 'utf8'));
  parity['company-demo'].recorded = '2026-02-30T00:00:00Z';
  fs.writeFileSync(file, JSON.stringify(parity, null, 2));
  assert.ok(codes(checkRepo(root, { release: true })).includes('parity_record_invalid'));
});

// Healthy cases, written after the negative ones had failed as required (S1 brief, coordinator's correction).
test('healthy: a correct pair passes, and passes the release check once parity is recorded', () => {
  const root = repo();
  assert.deepEqual(checkRepo(root).errors, []);
  assert.ok(codes(checkRepo(root, { release: true })).includes('parity_unrecorded'));
  recordParity(root, 'company-demo', evidenceFile(root));
  const r = checkRepo(root, { release: true });
  assert.deepEqual(r.errors, []);
  assert.equal(r.pairs[0].status, 'current');
});

test('negative: a tree with no skills at all fails instead of passing quietly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-empty-'));
  fs.mkdirSync(path.join(root, 'skills/_shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/_shared/protocol.md'), PROTOCOL.en);
  assert.ok(codes(checkRepo(root)).includes('no_skills'));
});

test('healthy: a single-language repo has no pairs to compare and says so instead of failing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-flat-'));
  fs.mkdirSync(path.join(root, 'skills/_shared'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/_shared/protocol.md'), PROTOCOL.en);
  fs.mkdirSync(path.join(root, 'skills/company-demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/company-demo/SKILL.md'), skillMd({ lang: 'en' }));
  const r = checkRepo(root);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.pairs, [{ name: 'company-demo', status: 'single-language' }]);
  // a broken skill still fails in this layout — the mode is not an excuse to check nothing
  fs.writeFileSync(path.join(root, 'skills/company-demo/SKILL.md'), skillMd({ lang: 'en', extra: '"allowed-tools": Bash\n' }));
  assert.ok(codes(checkRepo(root)).includes('frontmatter_syntax'));
});

test('healthy: sync puts the source protocol back into a hand-edited block', () => {
  const root = repo((f) => { f['skills/pl/company-demo/SKILL.md'] = skillMd({ lang: 'pl', block: '## Protokół\n\nZmienione ręcznie.\n' }); });
  assert.deepEqual(sync(root), ['skills/pl/company-demo/SKILL.md']);
  assert.deepEqual(checkRepo(root).errors, []);
});
