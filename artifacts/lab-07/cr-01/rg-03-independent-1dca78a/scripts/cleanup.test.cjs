'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const script = path.join(__dirname, 'cleanup.cjs')
const source = fs.readFileSync(process.env.RG03_CLEANUP_SOURCE || script, 'utf8')

// Run the script with a filesystem spy. No call here can delete a real path.
function spyCleanup(outputDir, { output = true, credentials = false, symlink = false, evidenceSymlink = false } = {}) {
  const previous = process.env.RG03_OUTPUT_DIR
  if (outputDir === undefined) delete process.env.RG03_OUTPUT_DIR
  else process.env.RG03_OUTPUT_DIR = outputDir
  delete require.cache[require.resolve('./paths.cjs')]
  let paths
  try { paths = require('./paths.cjs') } finally {
    if (previous === undefined) delete process.env.RG03_OUTPUT_DIR
    else process.env.RG03_OUTPUT_DIR = previous
    delete require.cache[require.resolve('./paths.cjs')]
  }

  const calls = []
  const fakeFs = {
    existsSync: target => target === paths.OUTPUT_DIR || (credentials && target === paths.CREDENTIALS_FILE),
    lstatSync: () => ({ isDirectory: () => !symlink, isSymbolicLink: () => symlink }),
    realpathSync: target => (symlink && target === paths.OUTPUT_DIR) || (evidenceSymlink && target === paths.EVIDENCE_DIR)
      ? path.join(os.tmpdir(), 'redirected') : target,
    rmSync: (...args) => calls.push(args),
  }
  fakeFs.realpathSync.native = fakeFs.realpathSync
  const lines = []
  let error
  try {
    vm.runInNewContext(source, {
      require: id => id === 'node:fs' ? fakeFs : id === 'node:path' ? path : paths,
      process: { argv: ['node', script, ...(output ? ['--output'] : [])] },
      console: { log: line => lines.push(line) },
    }, { filename: script })
  } catch (caught) { error = caught }
  return { calls, error, lines, paths }
}

test('without --output, removes credentials and preserves output', () => {
  const result = spyCleanup(undefined, { output: false, credentials: true })
  assert.equal(result.error, undefined)
  assert.deepEqual(result.calls.map(([target]) => target), [result.paths.CREDENTIALS_FILE])
})

test('default reproduction-output with --output is allowed', () => {
  const result = spyCleanup(undefined)
  assert.equal(result.error, undefined)
  assert.deepEqual(result.calls.map(([target]) => target), [result.paths.OUTPUT_DIR])
})

for (const [name, target] of [
  ['checkout root', () => require('./paths.cjs').REPO_ROOT],
  ['evidence root', () => require('./paths.cjs').EVIDENCE_DIR],
  ['scripts directory', () => require('./paths.cjs').SCRIPTS_DIR],
  ['historical logs', () => path.join(require('./paths.cjs').EVIDENCE_DIR, 'logs')],
  ['custom directory outside checkout', () => path.join(os.tmpdir(), 'rg03-custom-output')],
  ['path traversal outside default directory', () => path.join(require('./paths.cjs').EVIDENCE_DIR, 'reproduction-output', '..', 'screenshots')],
]) {
  test(`refuses ${name} with zero deletions`, () => {
    const result = spyCleanup(target())
    assert.deepEqual(result.calls.map(([path]) => path), [])
    assert.match(String(result.error), /Refusing automatic output cleanup/)
  })
}

test('refuses symlink or junction output with zero deletions', () => {
  const result = spyCleanup(undefined, { symlink: true })
  assert.deepEqual(result.calls.map(([path]) => path), [])
  assert.match(String(result.error), /Refusing automatic output cleanup/)
})

test('refuses an evidence-path symlink or junction with zero deletions', () => {
  const result = spyCleanup(undefined, { evidenceSymlink: true })
  assert.deepEqual(result.calls.map(([path]) => path), [])
  assert.match(String(result.error), /Refusing automatic output cleanup/)
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rg03-cleanup-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const pkg of ['server', 'client', 'e2e']) {
    fs.mkdirSync(path.join(root, pkg))
    fs.writeFileSync(path.join(root, pkg, 'package.json'), '{}')
  }
  const evidence = path.join(root, 'artifacts', 'lab-07', 'cr-01', 'rg-03-independent-1dca78a')
  const scripts = path.join(evidence, 'scripts')
  fs.mkdirSync(scripts, { recursive: true })
  fs.writeFileSync(path.join(scripts, 'cleanup.cjs'), source)
  fs.copyFileSync(path.join(__dirname, 'paths.cjs'), path.join(scripts, 'paths.cjs'))
  const output = path.join(evidence, 'reproduction-output')
  const credentials = path.join(scripts, '.e2e-credentials.json')
  const run = (args = [], outputDir) => {
    const env = { ...process.env, KITLOOP_ROOT: root }
    if (outputDir === undefined) delete env.RG03_OUTPUT_DIR
    else env.RG03_OUTPUT_DIR = outputDir
    return spawnSync(process.execPath, [path.join(scripts, 'cleanup.cjs'), ...args], { cwd: root, env, encoding: 'utf8' })
  }
  return { output, credentials, run }
}

test('disposable fixture: credentials removed, output preserved without --output', t => {
  const { output, credentials, run } = fixture(t)
  fs.mkdirSync(output)
  fs.writeFileSync(path.join(output, 'marker'), 'keep')
  fs.writeFileSync(credentials, '{}')
  assert.equal(run().status, 0)
  assert.equal(fs.existsSync(credentials), false)
  assert.equal(fs.existsSync(path.join(output, 'marker')), true)
})

test('disposable fixture: default output removed, repeated and absent cleanup succeed', t => {
  const { output, credentials, run } = fixture(t)
  fs.mkdirSync(output)
  fs.writeFileSync(path.join(output, 'marker'), 'delete')
  fs.writeFileSync(credentials, '{}')
  assert.equal(run(['--output']).status, 0)
  assert.equal(fs.existsSync(output), false)
  assert.equal(fs.existsSync(credentials), false)
  const second = run(['--output'])
  assert.equal(second.status, 0)
  assert.match(second.stdout, /nothing to remove/)
})

test('disposable fixture: custom output is preserved and --output fails before credential removal', t => {
  const { credentials, run } = fixture(t)
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'rg03-custom-'))
  t.after(() => fs.rmSync(custom, { recursive: true, force: true }))
  fs.writeFileSync(path.join(custom, 'marker'), 'keep')
  fs.writeFileSync(credentials, '{}')
  const refused = run(['--output'], custom)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /Refusing automatic output cleanup/)
  assert.equal(fs.existsSync(credentials), true)
  assert.equal(fs.existsSync(path.join(custom, 'marker')), true)
  assert.equal(run([], custom).status, 0)
  assert.equal(fs.existsSync(credentials), false)
  assert.equal(fs.existsSync(path.join(custom, 'marker')), true)
})
