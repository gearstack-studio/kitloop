// LOCAL rehearsal of RG-05.E3–E9 (+ auto-decline) and the Release 1 disabled contract. NOT production verification.
// Real HTTP to real API instances on localhost; synthetic fixture users/assets; no interception or mocks.
//   API_ON  = http://localhost:3000/api  (BORROWING_QUOTA=enabled, REQUEST_LIFECYCLE_WRITES=enabled)
//   API_OFF = http://localhost:3001/api  (BORROWING_QUOTA=disabled, REQUEST_LIFECYCLE_WRITES=disabled) = Release 1 config
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { request } = createRequire('D:/SWE_Project/kitloop-rg03-1dca78a/e2e/package.json')('@playwright/test')

const ORIGIN = 'http://localhost:5173'
const API_ON = 'http://localhost:3000/api', API_OFF = 'http://localhost:3001/api'
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-credentials.json'), 'utf8'))
const results = []
const record = (item, pass, detail) => { results.push({ item, result: pass ? 'PASS' : 'FAIL', detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${item} :: ${JSON.stringify(detail)}`) }

async function login(api, key) {
  const ctx = await request.newContext({ extraHTTPHeaders: { Origin: ORIGIN } })
  const r = await ctx.post(`${api}/auth/login`, { data: { username: creds.users[key], password: creds.password } })
  if (r.status() !== 200) throw new Error(`login ${key} -> ${r.status()}`)
  const csrf = r.headers()['x-csrf-token']
  const body = await r.json()
  const call = async (method, p, data) => {
    const res = await ctx.fetch(api + p, { method, data, headers: method === 'GET' ? {} : { 'X-CSRF-Token': csrf } })
    let json = null; try { json = await res.json() } catch {}
    return { status: res.status(), json, headers: res.headers() }
  }
  return { ctx, features: body.features, get: p => call('GET', p), post: (p, d = {}) => call('POST', p, d), raw: ctx }
}
const due = () => new Date(Date.now() + 3 * 86_400_000).toISOString()
const pendingCount = async s => (await s.get('/requests/mine')).json.filter(r => r.status === 'PENDING').length
const code = r => r.json?.error?.code ?? null

;(async () => {
  const sessions = []
  try {
    const cust = await login(API_ON, 'custodian'); sessions.push(cust)
    const unassigned = await login(API_ON, 'unassigned'); sessions.push(unassigned)

    // E3: quota GET contract
    {
      const b = await login(API_ON, 'e3'); sessions.push(b)
      await b.post('/requests', { assetId: 'RG-01' })
      const q = await b.get('/borrowing-quota'), qc = await cust.get('/borrowing-quota'), qq = await b.get('/borrowing-quota?x=1')
      const keys = Object.keys(q.json ?? {}).sort()
      record('E3 quota GET contract', q.status === 200 && JSON.stringify(keys) === JSON.stringify(['canSubmitRequest', 'maxPendingRequests', 'pendingRequests', 'remainingRequestCapacity'])
        && q.headers['cache-control'] === 'no-store' && q.json.pendingRequests === await pendingCount(b) && qc.status === 403 && qq.status === 400,
        { borrower: [q.status, q.json, q.headers['cache-control']], custodian: qc.status, query: [qq.status, code(qq)] })
    }
    // E4: enforcement at P = 2, no new row
    let e4Ids
    {
      const b = await login(API_ON, 'e4'); sessions.push(b)
      const r1 = await b.post('/requests', { assetId: 'RG-02' }), r2 = await b.post('/requests', { assetId: 'RG-03' })
      const before = (await b.get('/requests/mine')).json.length
      const r3 = await b.post('/requests', { assetId: 'RG-04' })
      const after = (await b.get('/requests/mine')).json.length
      e4Ids = [r1.json?.id, r2.json?.id]
      record('E4 enforcement at P=2', r1.status === 201 && r2.status === 201 && r3.status === 409 && code(r3) === 'BORROWING_QUOTA_EXCEEDED' && !('fields' in (r3.json?.error ?? {})) && before === after,
        { statuses: [r1.status, r2.status, r3.status], code: code(r3), rowsBefore: before, rowsAfter: after })
      // E5: recovery by cancel
      const c = await b.post(`/requests/${r1.json.id}/cancel`)
      const q = await b.get('/borrowing-quota')
      const n = await b.post('/requests', { assetId: 'RG-04' })
      record('E5 recovery by cancel', c.status === 200 && c.json?.status === 'CANCELLED' && q.json.pendingRequests === 1 && q.json.remainingRequestCapacity === 1 && n.status === 201,
        { cancel: [c.status, c.json?.status], quota: q.json, newRequest: n.status })
    }
    // E6: recovery by assigned-custodian decline; unassigned custodian refused
    {
      const b = await login(API_ON, 'e6'); sessions.push(b)
      const r1 = await b.post('/requests', { assetId: 'RG-05' }); await b.post('/requests', { assetId: 'RG-06' })
      const foreign = await unassigned.post(`/requests/${r1.json.id}/decline`, { reason: 'BORROWER_NOT_ELIGIBLE' })
      const stillPending = (await b.get('/requests/mine')).json.find(r => r.id === r1.json.id).status
      const d = await cust.post(`/requests/${r1.json.id}/decline`, { reason: 'BORROWER_NOT_ELIGIBLE' })
      const q = await b.get('/borrowing-quota'), n = await b.post('/requests', { assetId: 'RG-07' })
      record('E6 recovery by decline (+ unassigned custodian refused)', foreign.status === 404 && stillPending === 'PENDING' && d.status === 200 && d.json?.status === 'DECLINED' && q.json.pendingRequests === 1 && n.status === 201,
        { unassigned: foreign.status, afterUnassigned: stillPending, decline: [d.status, d.json?.status, d.json?.closeReason], quota: q.json, newRequest: n.status })
    }
    // E7: recovery by checkout
    {
      const b = await login(API_ON, 'e7'); sessions.push(b)
      const r1 = await b.post('/requests', { assetId: 'RG-08' }); await b.post('/requests', { assetId: 'RG-09' })
      const co = await cust.post(`/requests/${r1.json.id}/checkout`, { assetId: 'RG-08', dueAt: due() })
      const q = await b.get('/borrowing-quota'), n = await b.post('/requests', { assetId: 'RG-10' })
      record('E7 recovery by checkout', co.status === 201 && co.json?.status === 'ACTIVE' && q.json.pendingRequests === 1 && n.status === 201, { checkout: [co.status, co.json?.status], quota: q.json, newRequest: n.status })
    }
    // E8: active loan does not count
    {
      const b = await login(API_ON, 'e8'); sessions.push(b)
      const r = await b.post('/requests', { assetId: 'RG-11' })
      await cust.post(`/requests/${r.json.id}/checkout`, { assetId: 'RG-11', dueAt: due() })
      const loans = (await b.get('/loans/mine')).json.filter(l => l.status === 'ACTIVE').length
      const q = await b.get('/borrowing-quota')
      const n1 = await b.post('/requests', { assetId: 'RG-12' }), n2 = await b.post('/requests', { assetId: 'RG-13' })
      record('E8 active loan not counted', loans === 1 && q.json.pendingRequests === 0 && n1.status === 201 && n2.status === 201, { activeLoans: loans, quota: q.json, submits: [n1.status, n2.status] })
    }
    // E9: preserved behaviour
    {
      const a = await login(API_ON, 'e9a'); sessions.push(a)
      const b = await login(API_ON, 'e9b'); sessions.push(b)
      const r = await a.post('/requests', { assetId: 'RG-14' })
      const dup = await a.post('/requests', { assetId: 'RG-14' })
      const unavailable = await a.post('/requests', { assetId: 'RG-08' }) // on loan since E7
      const custPost = await cust.post('/requests', { assetId: 'RG-15' })
      const foreign = await b.post(`/requests/${r.json.id}/cancel`)
      const shared1 = await a.post('/requests', { assetId: 'RG-16' }) // a now at P=2 -> use b plus a fresh borrower? keep a at P=1 by cancelling first
      record('E9 preserved behaviour', dup.status === 409 && code(dup) === 'DUPLICATE_REQUEST' && unavailable.status === 409 && code(unavailable) === 'ASSET_UNAVAILABLE'
        && custPost.status === 403 && foreign.status === 404 && shared1.status === 201,
        { duplicate: [dup.status, code(dup)], unavailable: [unavailable.status, code(unavailable)], custodianPost: custPost.status, foreignCancel: foreign.status, aSecond: shared1.status })
      const sharedB = await b.post('/requests', { assetId: 'RG-16' })
      record('E9b two borrowers can request one available asset', sharedB.status === 201, { aOnRG16: shared1.status, bOnRG16: sharedB.status })
    }
    // Auto-decline: competing requests; checkout of one declines the other and lowers its P
    {
      const x = await login(API_ON, 'auto1'); sessions.push(x)
      const y = await login(API_ON, 'auto2'); sessions.push(y)
      const rx = await x.post('/requests', { assetId: 'RG-17' }), ry = await y.post('/requests', { assetId: 'RG-17' })
      const qyBefore = (await y.get('/borrowing-quota')).json.pendingRequests
      const co = await cust.post(`/requests/${rx.json.id}/checkout`, { assetId: 'RG-17', dueAt: due() })
      const yRow = (await y.get('/requests/mine')).json.find(r => r.id === ry.json.id)
      const qyAfter = (await y.get('/borrowing-quota')).json.pendingRequests
      record('Auto-decline on checkout lowers competitor P', co.status === 201 && yRow.status === 'DECLINED' && yRow.closeReason === 'ASSET_CHECKED_OUT_TO_ANOTHER_BORROWER' && qyBefore === 1 && qyAfter === 0,
        { checkout: co.status, competitor: [yRow.status, yRow.closeReason], competitorP: [qyBefore, qyAfter] })
    }
    // Release 1 contract on the disabled instance (both flags disabled)
    {
      const b = await login(API_OFF, 'rel1'); sessions.push(b)
      const q = await b.get('/borrowing-quota')
      const subs = []
      for (const id of ['RG-18', 'RG-19', 'RG-20']) subs.push((await b.post('/requests', { assetId: id })).status)
      const mine = (await b.get('/requests/mine')).json
      const cancel = await b.post(`/requests/${mine[0].id}/cancel`)
      record('Release 1 contract (quota+lifecycle disabled)', q.status === 404 && code(q) === 'BORROWING_QUOTA_DISABLED' && b.features?.borrowingQuota === false
        && b.features?.requestLifecycleActions === false && subs.every(s => s === 201) && cancel.status === 404 && code(cancel) === 'LIFECYCLE_ACTIONS_DISABLED',
        { quotaGet: [q.status, code(q)], features: b.features, thirdRequestAllowed: subs, cancel: [cancel.status, code(cancel)] })
    }
  } catch (error) {
    record('unexpected error', false, { message: String(error.message).split('\n')[0] })
  } finally {
    for (const s of sessions) await s.ctx.dispose()
    fs.writeFileSync(path.join(__dirname, '..', 'logs', '21-rg05-local-rehearsal.json'), JSON.stringify({
      note: 'LOCAL rehearsal against real local API instances with synthetic data. NOT production RG-05 evidence.', results }, null, 2) + '\n')
    process.exitCode = results.every(r => r.result === 'PASS') ? 0 : 1
  }
})()
