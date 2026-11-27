// Shared, portable paths and safety checks for the RG-03 reviewer scripts (reproduction only; not application code).
// Every script resolves the same credential file and output folder through this module, so nothing depends on a
// particular drive or checkout location.
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const SCRIPTS_DIR = __dirname
const EVIDENCE_DIR = path.resolve(SCRIPTS_DIR, '..')

// Repository root: KITLOOP_ROOT if set, otherwise the checkout that contains this evidence folder
// (scripts/ -> rg-03-independent-1dca78a/ -> cr-01/ -> lab-07/ -> artifacts/ -> root).
const REPO_ROOT = path.resolve(process.env.KITLOOP_ROOT || path.join(SCRIPTS_DIR, '..', '..', '..', '..', '..'))
for (const required of ['server/package.json', 'client/package.json', 'e2e/package.json']) {
  if (!fs.existsSync(path.join(REPO_ROOT, required))) {
    throw new Error(`KitLoop checkout not found at ${REPO_ROOT} (missing ${required}). Set KITLOOP_ROOT to the repository root.`)
  }
}

// Generated per-run credentials (git-ignored by ../.gitignore). Written by fixture.mts, read by every runner,
// deleted by cleanup.cjs.
const CREDENTIALS_FILE = path.join(SCRIPTS_DIR, '.e2e-credentials.json')

// Runtime output for reproductions (git-ignored). Kept apart from the committed historical logs/ and screenshots/.
const OUTPUT_DIR = path.resolve(process.env.RG03_OUTPUT_DIR || path.join(EVIDENCE_DIR, 'reproduction-output'))

// Local endpoints only. Overridable for a different local port layout, but never a remote host.
const APP_ORIGIN = process.env.RG03_APP_ORIGIN || 'http://localhost:5173'
const API_ON = process.env.RG03_API_ON || 'http://localhost:3000/api'
const API_OFF = process.env.RG03_API_OFF || 'http://localhost:3001/api'
for (const value of [APP_ORIGIN, API_ON, API_OFF]) {
  const host = new URL(value).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') throw new Error(`Refusing non-local endpoint ${value}`)
}

/** Validates DATABASE_URL before any connection: local host and a dedicated kitloop_rg03_* test database. */
function assertSafeDatabase(expectedName) {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is not set')
  const url = new URL(raw)
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('Refusing non-local database host')
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!/^kitloop_rg03_[a-z0-9_]+$/.test(name)) throw new Error(`Refusing database "${name}": must match ^kitloop_rg03_[a-z0-9_]+$`)
  if (expectedName && name !== expectedName) throw new Error(`Refusing database "${name}": expected "${expectedName}"`)
  return name
}

function readCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) throw new Error(`No credentials at ${CREDENTIALS_FILE}; run fixture.mts first`)
  return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'))
}

function outputPath(...parts) {
  const target = path.join(OUTPUT_DIR, ...parts)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  return target
}

function requireFrom(pkgDir, id) {
  return require('node:module').createRequire(path.join(REPO_ROOT, pkgDir, 'package.json'))(id)
}

module.exports = { SCRIPTS_DIR, EVIDENCE_DIR, REPO_ROOT, CREDENTIALS_FILE, OUTPUT_DIR, APP_ORIGIN, API_ON, API_OFF,
  assertSafeDatabase, readCredentials, outputPath, requireFrom }
