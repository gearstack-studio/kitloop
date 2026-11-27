import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const database = 'kitloop_rg01_cli_test'
const url = new URL(process.env.DATABASE_URL)
assert.equal(url.hostname, '127.0.0.1')
assert.equal(url.pathname, `/${database}`)
const { PrismaClient } = createRequire(resolve('package.json'))('@prisma/client')
const prisma = new PrismaClient()
const assetId = `RG01-${randomUUID()}`

function reconcile(...args) {
  const output = execFileSync(process.execPath, [
    'dist/lifecycle-cli.js', 'reconcile', `--asset=${assetId}`, ...args,
  ], {
    encoding: 'utf8',
    env: { ...process.env, REQUEST_LIFECYCLE_WRITES: 'enabled', BORROWING_QUOTA: 'disabled' },
  })
  const result = JSON.parse(output)
  assert.equal(result.database, database)
  assert.deepEqual(result.conflicts, [])
  return result
}

try {
  const stale = await prisma.$transaction(async tx => {
    const users = await Promise.all(['BORROWER', 'BORROWER', 'CUSTODIAN'].map(role =>
      tx.user.create({ data: { role, username: randomUUID(), passwordHash: 'unused-synthetic-fixture' } })))
    const [winner, competitor, custodian] = users
    await tx.asset.create({ data: { assetId, name: 'RG-01 fixture', category: 'Test', description: 'Synthetic' } })
    const checkedOut = await tx.borrowRequest.create({
      data: { assetId, borrowerId: winner.id, status: 'CHECKED_OUT' },
    })
    await tx.loan.create({
      data: {
        assetId, requestId: checkedOut.id, borrowerId: winner.id, checkoutCustodianId: custodian.id,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    })
    return tx.borrowRequest.create({ data: { assetId, borrowerId: competitor.id } })
  })
  const read = () => prisma.borrowRequest.findUniqueOrThrow({ where: { id: stale.id } })
  const dryRun = reconcile()
  assert.equal(dryRun.mode, 'dry-run')
  assert.equal(dryRun.before.staleOnActiveLoan, 1)
  assert.deepEqual(dryRun.before, dryRun.after)
  assert.deepEqual(await read(), stale)

  const apply = reconcile('--apply', `--confirm-database=${database}`)
  assert.equal(apply.mode, 'apply')
  assert.deepEqual(apply.closed, [stale.id])
  assert.equal(apply.after.staleOnActiveLoan, 0)
  const closed = await read()
  assert.equal(closed.status, 'DECLINED')
  assert.equal(closed.closeReason, 'ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER')
  assert.ok(closed.closedAt)
  assert.equal(closed.closedById, null)

  const rerun = reconcile()
  assert.equal(rerun.before.staleOnActiveLoan, 0)
  assert.deepEqual(rerun.closed, [])
  assert.deepEqual(await read(), closed)
  console.log(JSON.stringify({ dryRun, apply, rerun }, null, 2))
} finally {
  await prisma.$disconnect()
}
