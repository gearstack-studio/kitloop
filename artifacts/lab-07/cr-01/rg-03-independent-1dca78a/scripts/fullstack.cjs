// Reviewer full-stack check (NOT part of the PR). Real Vite frontend + real KitLoop API + real PostgreSQL.
// NO page.route / request interception anywhere: every /api call reaches the running backend.
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const { chromium } = createRequire('D:/SWE_Project/kitloop-rg03-1dca78a/e2e/package.json')('@playwright/test')

const APP = 'http://localhost:5173'
const API = 'http://localhost:3000/api'
const OUT = 'D:/SWE_Project/kitloop-lab7-partA-evidence/screenshots'
fs.mkdirSync(OUT, { recursive: true })
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-credentials.json'), 'utf8'))
const steps = []
let failed = false

function record(step, ok, detail) {
  steps.push({ step, result: ok ? 'PASS' : 'FAIL', detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step} | ${detail}`)
  if (!ok) { failed = true; throw new Error(`${step}: ${detail}`) }
}

async function newBorrowerPage(browser, username, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.apiLog = []
  page.on('response', response => {
    const url = response.url()
    if (url.startsWith(API)) page.apiLog.push(`${response.request().method()} ${url.slice(API.length)} -> ${response.status()}`)
  })
  await page.goto(APP + '/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(creds.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByRole('heading', { name: 'Equipment catalog' }).waitFor({ timeout: 10000 })
  page.label = label
  return page
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/fullstack-${name}.png`, fullPage: true })
const panelText = async page => (await page.getByRole('region', { name: 'Borrowing limit' }).innerText()).replace(/\s+/g, ' ').trim()
async function openRequests(page) {
  await page.getByRole('link', { name: 'My requests' }).first().click()
  await page.getByRole('heading', { name: 'Request equipment' }).waitFor()
}
async function waitUsage(page, text) {
  await page.getByRole('region', { name: 'Borrowing limit' }).getByText(text).waitFor({ timeout: 10000 })
}
async function submitAsset(page, assetId) {
  const selector = page.getByLabel('Available equipment')
  await page.waitForFunction(() => { const s = document.querySelector('#asset-select, select'); return s && !s.disabled })
  await selector.selectOption(assetId)
  await page.getByRole('button', { name: 'Submit request' }).click()
  await page.getByText('Borrow request submitted with PENDING status.').waitFor({ timeout: 10000 })
}
// Direct API calls from the signed-in page, with the session cookie and a CSRF token from /auth/me.
async function apiFromPage(page, method, pathName, body) {
  return page.evaluate(async ({ API, method, pathName, body }) => {
    const me = await fetch(API + '/auth/me', { credentials: 'include' })
    const token = me.headers.get('X-CSRF-Token') ?? ''
    const response = await fetch(API + pathName, { method, credentials: 'include',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { API, method, pathName, body })
}

;(async () => {
  const browser = await chromium.launch()
  const started = new Date().toISOString()
  try {
    // 1. Borrower A signs in; starts at P = 0.
    const a = await newBorrowerPage(browser, creds.users.borrowerA, 'A')
    await openRequests(a)
    await waitUsage(a, '0 of 2 pending requests')
    record('A1 initial quota', true, await panelText(a))
    await shot(a, '01-a-initial-0-of-2')

    // 2. First and second pending requests through the UI.
    await submitAsset(a, 'E2E-CAM-01')
    await waitUsage(a, '1 of 2 pending requests')
    record('A2 first request accepted', true, await panelText(a))
    await shot(a, '02-a-first-request-1-of-2')
    await submitAsset(a, 'E2E-LAP-01')
    await waitUsage(a, '2 of 2 pending requests')
    const submitDisabled = await a.getByRole('button', { name: 'Submit request' }).isDisabled()
    const selectorDisabled = await a.getByLabel('Available equipment').isDisabled()
    record('A3 second request accepted; limit reached in UI', submitDisabled && selectorDisabled,
      `${await panelText(a)} | Submit disabled=${submitDisabled}, selector disabled=${selectorDisabled}`)
    await shot(a, '03-a-limit-reached-2-of-2')

    // 3. Catalog shows the restriction.
    await a.getByRole('link', { name: 'Equipment dashboard' }).first().click()
    const tripod = a.getByRole('button', { name: /Tripod, E2E-TRI-01/ })
    await tripod.waitFor()
    const tripodText = (await tripod.innerText()).trim()
    record('A4 catalog restriction at 2 pending', tripodText === 'Limit reached' && await tripod.isDisabled(),
      `Tripod control text="${tripodText}" disabled=${await tripod.isDisabled()} aria-label="${await tripod.getAttribute('aria-label')}"`)
    await shot(a, '04-a-catalog-limit-reached')

    // 4. Backend rejects a third request (direct API call, bypassing the disabled UI).
    const third = await apiFromPage(a, 'POST', '/requests', { assetId: 'E2E-TRI-01' })
    const quotaAfterThird = await apiFromPage(a, 'GET', '/borrowing-quota')
    const mineAfterThird = await apiFromPage(a, 'GET', '/requests/mine')
    const tripodRows = mineAfterThird.body.filter(r => r.assetId === 'E2E-TRI-01').length
    record('A5 backend rejects third request', third.status === 409 && third.body?.error?.code === 'BORROWING_QUOTA_EXCEEDED'
      && quotaAfterThird.body.pendingRequests === 2 && tripodRows === 0,
      `POST /requests -> ${third.status} ${third.body?.error?.code}; quota after=${JSON.stringify(quotaAfterThird.body)}; Tripod rows for A=${tripodRows}`)

    // 5. Cancel a pending request; quota recovers.
    await openRequests(a)
    await waitUsage(a, '2 of 2 pending requests')
    await a.getByRole('button', { name: 'Cancel request for Camera' }).click()
    await a.getByText('Request cancelled.').waitFor({ timeout: 10000 })
    await waitUsage(a, '1 of 2 pending requests')
    await a.waitForFunction(() => { const s = document.querySelector('select'); return s && !s.disabled })
    const selectorEnabled = !(await a.getByLabel('Available equipment').isDisabled())
    const quotaAfterCancel = await apiFromPage(a, 'GET', '/borrowing-quota')
    record('A6 cancel restores capacity', selectorEnabled && quotaAfterCancel.body.pendingRequests === 1 && quotaAfterCancel.body.canSubmitRequest === true,
      `${await panelText(a)} | selector enabled=${selectorEnabled} | API quota=${JSON.stringify(quotaAfterCancel.body)}`)
    await shot(a, '05-a-after-cancel-1-of-2')

    // 6. New request after recovery.
    await submitAsset(a, 'E2E-TRI-01')
    await waitUsage(a, '2 of 2 pending requests')
    record('A7 new request after recovery accepted', true, await panelText(a))
    await shot(a, '06-a-after-recovery-2-of-2')

    // 7. Persistence after a full page reload.
    await a.reload()
    await a.getByRole('heading', { name: 'Request equipment' }).waitFor({ timeout: 10000 })
    await waitUsage(a, '2 of 2 pending requests')
    const listText = (await a.getByRole('region', { name: 'My requests' }).innerText()).replace(/\s+/g, ' ')
    const persisted = /Laptop/.test(listText) && /Tripod/.test(listText) && /CANCELLED|Cancelled/i.test(listText)
    record('A8 state persists after reload', persisted && await a.getByRole('button', { name: 'Submit request' }).isDisabled(),
      `${await panelText(a)} | list mentions Laptop, Tripod and the cancelled Camera=${persisted}`)
    await shot(a, '07-a-after-reload-2-of-2')

    // 8. Borrower isolation: B has an independent quota, cannot see or cancel A's requests, cannot read A's quota.
    const b = await newBorrowerPage(browser, creds.users.borrowerB, 'B')
    await openRequests(b)
    await waitUsage(b, '0 of 2 pending requests')
    const bList = (await b.getByRole('region', { name: 'My requests' }).innerText()).replace(/\s+/g, ' ')
    const aPending = (await apiFromPage(a, 'GET', '/requests/mine')).body.filter(r => r.status === 'PENDING')
    const foreignCancel = await apiFromPage(b, 'POST', `/requests/${aPending[0].id}/cancel`, {})
    const foreignQuota = await apiFromPage(b, 'GET', `/borrowing-quota?borrowerId=${creds.ids.borrowerA}`)
    record('B1 isolation', !/Laptop|Tripod/.test(bList) && foreignCancel.status === 404 && foreignQuota.status === 400,
      `B panel: ${await panelText(b)}; B list shows A's items=${/Laptop|Tripod/.test(bList)}; B cancels A's request -> ${foreignCancel.status}; B reads quota?borrowerId=A -> ${foreignQuota.status}`)
    await shot(b, '08-b-independent-0-of-2')
    await submitAsset(b, 'E2E-LAP-01') // same asset A has pending: allowed, requests do not reserve
    await waitUsage(b, '1 of 2 pending requests')
    await a.reload()
    await waitUsage(a, '2 of 2 pending requests')
    record('B2 B requests an asset A has pending; A unaffected', true, `B: ${await panelText(b)} | A after reload: ${await panelText(a)}`)
    await shot(b, '09-b-requests-same-asset-1-of-2')

    fs.writeFileSync(`${OUT}/fullstack-api-log-A.txt`, a.apiLog.join('\n') + '\n')
    fs.writeFileSync(`${OUT}/fullstack-api-log-B.txt`, b.apiLog.join('\n') + '\n')
  } catch (error) {
    if (!failed) steps.push({ step: 'unexpected error', result: 'FAIL', detail: String(error.message).split('\n')[0] })
    console.log('ERROR', String(error.message).split('\n')[0])
  } finally {
    await browser.close()
    fs.writeFileSync(`${OUT}/fullstack-results.json`, JSON.stringify({ note: 'FULL-STACK: real API and PostgreSQL, no request interception',
      app: APP, api: API, started, finished: new Date().toISOString(), steps }, null, 2) + '\n')
    process.exitCode = steps.every(s => s.result === 'PASS') && steps.length > 0 ? 0 : 1
  }
})()
