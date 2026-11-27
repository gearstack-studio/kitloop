// Removes the generated per-run credentials after a reproduction. Leaves committed evidence untouched.
// Usage: node artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/cleanup.cjs [--output]
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const paths = require('./paths.cjs')

function assertSafeOutput() {
  const allowed = path.join(paths.EVIDENCE_DIR, 'reproduction-output')
  const samePath = (a, b) => {
    const normalized = value => process.platform === 'win32' ? path.normalize(value).toLowerCase() : path.normalize(value)
    return normalized(a) === normalized(b)
  }
  const refuse = reason => { throw new Error(`Refusing automatic output cleanup: ${reason}. Remove custom output directories manually.`) }

  if (!samePath(paths.OUTPUT_DIR, allowed)) refuse('target is not the default reproduction-output directory')
  if (!samePath(fs.realpathSync.native(paths.EVIDENCE_DIR), paths.EVIDENCE_DIR)) refuse('evidence path contains a symlink or junction')

  let entry
  try { entry = fs.lstatSync(allowed) } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  if (entry.isSymbolicLink() || !entry.isDirectory() || !samePath(fs.realpathSync.native(allowed), allowed)) {
    refuse('default output is not a real directory inside the evidence folder')
  }
  return true
}

const removeOutput = process.argv.includes('--output') && assertSafeOutput()
const removed = []
if (fs.existsSync(paths.CREDENTIALS_FILE)) { fs.rmSync(paths.CREDENTIALS_FILE); removed.push(path.relative(paths.REPO_ROOT, paths.CREDENTIALS_FILE)) }
if (removeOutput) {
  fs.rmSync(paths.OUTPUT_DIR, { recursive: true }); removed.push(path.relative(paths.REPO_ROOT, paths.OUTPUT_DIR))
}
console.log(removed.length ? `removed: ${removed.join(', ')}` : 'nothing to remove')
console.log(`credentials file present: ${fs.existsSync(paths.CREDENTIALS_FILE)}`)
