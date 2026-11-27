// Removes the generated per-run credentials after a reproduction. Leaves committed evidence untouched.
// Usage: node artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/cleanup.cjs [--output]
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const paths = require('./paths.cjs')

const removed = []
if (fs.existsSync(paths.CREDENTIALS_FILE)) { fs.rmSync(paths.CREDENTIALS_FILE); removed.push(path.relative(paths.REPO_ROOT, paths.CREDENTIALS_FILE)) }
if (process.argv.includes('--output') && fs.existsSync(paths.OUTPUT_DIR)) {
  fs.rmSync(paths.OUTPUT_DIR, { recursive: true }); removed.push(path.relative(paths.REPO_ROOT, paths.OUTPUT_DIR))
}
console.log(removed.length ? `removed: ${removed.join(', ')}` : 'nothing to remove')
console.log(`credentials file present: ${fs.existsSync(paths.CREDENTIALS_FILE)}`)
