import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

const db = new URL(process.env.DATABASE_URL)
assert.equal(db.hostname, '127.0.0.1')
assert.equal(db.pathname, '/pr88_restart_test')
const require = createRequire(resolve('package.json'))
const { PrismaClient } = require('@prisma/client')
const { hashPassword } = await import(pathToFileURL(resolve('dist/password.js')))
const prisma = new PrismaClient()
const password = 'synthetic-restart-test-password'
const origin = process.env.APP_ORIGIN
const base = 'http://127.0.0.1:35888/api'
const env = { ...process.env, PORT: '35888', REQUEST_LIFECYCLE_WRITES: 'enabled', BORROWING_QUOTA: 'enabled' }
let child

async function start() {
  child = spawn(process.execPath, ['dist/index.js'], { env, stdio: 'inherit' })
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.equal(child.exitCode, null, 'API exited during startup')
    try {
      if ((await fetch(base + '/ready')).ok) return child.pid
    } catch {}
    await delay(100)
  }
  throw new Error('API readiness timed out')
}

async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
}

async function login(username) {
  const response = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  assert.equal(response.status, 200)
  return {
    Cookie: response.headers.get('set-cookie').split(';')[0],
    'X-CSRF-Token': response.headers.get('x-csrf-token'),
  }
}

async function api(path, session, status, payload) {
  const response = await fetch(base + path, {
    method: payload ? 'POST' : 'GET',
    headers: { ...session, Origin: origin, 'Content-Type': 'application/json' },
    body: payload && JSON.stringify(payload),
  })
  assert.equal(response.status, status, path)
  return response.json()
}

async function verifyQuota(session, pendingRequests) {
  const result = await api('/borrowing-quota', session, 200)
  assert.deepEqual(result, {
    pendingRequests, maxPendingRequests: 2,
    remainingRequestCapacity: 2 - pendingRequests, canSubmitRequest: pendingRequests < 2,
  })
  console.log(JSON.stringify(result))
}

try {
  const passwordHash = await hashPassword(password)
  const borrower = await prisma.user.create({ data: { username: 'restart-borrower', role: 'BORROWER', passwordHash } })
  const custodian = await prisma.user.create({ data: { username: 'restart-custodian', role: 'CUSTODIAN', passwordHash } })
  for (const assetId of ['RESTART-A', 'RESTART-B']) {
    await prisma.asset.create({ data: {
      assetId, name: assetId, category: 'Test', description: 'Synthetic restart fixture',
      custodianAssets: { create: { custodianId: custodian.id } },
    } })
  }
  const firstPid = await start()
  const session = await login(borrower.username)
  const first = await api('/requests', session, 201, { assetId: 'RESTART-A' })
  const second = await api('/requests', session, 201, { assetId: 'RESTART-B' })
  console.log('Before restart')
  await verifyQuota(session, 2)
  await stop()
  const secondPid = await start()
  assert.notEqual(firstPid, secondPid)
  console.log(`After restart (PID ${firstPid} -> ${secondPid})`)
  await verifyQuota(session, 2)
  const custodianSession = await login(custodian.username)
  await api(`/requests/${first.id}/checkout`, custodianSession, 201, {
    assetId: 'RESTART-A', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  })
  console.log('After checkout')
  await verifyQuota(session, 1)
  const requests = await api('/requests/mine', session, 200)
  const loans = await api('/loans/mine', session, 200)
  assert.deepEqual(requests.filter(item => item.status === 'PENDING').map(item => item.id), [second.id])
  assert.deepEqual(loans.filter(item => item.status === 'ACTIVE').map(item => item.requestId), [first.id])
  await api(`/requests/${second.id}/cancel`, session, 200, {})
  console.log('After cancellation')
  await verifyQuota(session, 0)
  console.log('AC12 process restart and persisted readback passed')
} finally {
  await stop()
  await prisma.$disconnect()
}
