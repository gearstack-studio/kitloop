// MOCKED FRONTEND VERIFICATION for CR-01 #82, post-review states at 9bc49cb — not production and not full-stack evidence.
// Drives the local Vite dev server (http://127.0.0.1:5199, serving client/ of the checkout that contains this file) and
// fulfils every API call with synthetic mocked data through Playwright route interception. No backend or database is used.
// Usage (from the repository root, with the dev server running): node artifacts/lab-07/cr-01/screenshots/post-review-9bc49cb/ui-verify-post-review.mocked.cjs
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const repo = path.resolve(__dirname, '../../../../..')
const { chromium } = createRequire(path.join(repo, 'e2e', 'package.json'))('@playwright/test')

const APP = 'http://127.0.0.1:5199'
const OUT = __dirname
const quota = p => ({ pendingRequests: p, maxPendingRequests: 2, remainingRequestCapacity: Math.max(0, 2 - p), canSubmitRequest: p < 2 })
const asset = (assetId, name, category, available = true) => ({ assetId, name, category, description: `Synthetic ${name.toLowerCase()} for mocked verification`, available })
const assets = [asset('CAM-01', 'Camera', 'Camera'), asset('LAP-01', 'Laptop', 'Computer'), asset('MIC-01', 'Microphone', 'Audio', false), asset('TRI-01', 'Tripod', 'Camera')]
const pending = (id, a) => ({ id, assetId: a.assetId, borrowerId: 'B1', status: 'PENDING', submittedAt: '2026-11-26T09:00:00Z', closedAt: null, closeReason: null, asset: { assetId: a.assetId, name: a.name, category: a.category } })
const [, lap] = assets
const me = { id: 'B1', role: 'BORROWER', username: 'mock.borrower' }
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }

async function mockApi(page, { history, quotas, submit }) {
  const calls = []
  let release
  const held = new Promise(resolve => { release = resolve })
  const cors = { 'Access-Control-Allow-Origin': APP, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-CSRF-Token' }
  const reply = (route, body, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json', 'X-CSRF-Token': 'mock-csrf' }, body: JSON.stringify(body) })
  const queue = [...quotas]
  await page.route('http://localhost:3000/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    calls.push(`${request.method()} ${url.pathname}`)
    switch (url.pathname) {
      case '/api/auth/me': return reply(route, { ...me, features: { requestLifecycleActions: true, borrowingQuota: true } })
      case '/api/assets': return reply(route, assets)
      case '/api/requests/mine': return reply(route, history)
      case '/api/loans/mine': return reply(route, [])
      case '/api/borrowing-quota': {
        const next = queue.length > 1 ? queue.shift() : queue[0]
        if (next === 'held') { const value = await held; return reply(route, value) }
        if (next.status) return reply(route, next.body ?? { error: { message: 'Mocked failure' } }, next.status)
        return reply(route, next)
      }
      case '/api/requests':
        if (request.method() === 'POST' && submit) return reply(route, submit.body, submit.status)
    }
    return reply(route, { error: { message: `Unmocked ${request.method()} ${url.pathname}` } }, 404)
  })
  return { calls, release }
}

const scenarios = [
  {
    // Finding F-03: a failed quota read on the catalog has its own label and an accessible Retry; Retry recovers.
    id: 'catalog-quota-error', route: '/dashboard', history: [], quotas: [{ status: 500, body: {} }, quota(0)],
    async run(page, api, shot, checks) {
      const camera = page.getByRole('button', { name: /Borrowing limit unavailable: Camera, CAM-01/ })
      await camera.waitFor({ timeout: 10000 })
      checks.push(`Camera control text="${(await camera.innerText()).trim()}" disabled=${await camera.isDisabled()}`)
      await page.getByText('Borrowing limit could not be loaded.').waitFor()
      const retry = page.getByRole('button', { name: 'Retry borrowing limit' })
      checks.push(`role=button name="Retry borrowing limit" count=${await retry.count()} disabled=${await retry.isDisabled()}`)
      await retry.focus()
      checks.push(`Retry focusable=${await retry.evaluate(el => el === document.activeElement)}`)
      await shot('catalog-quota-error')
      await page.keyboard.press('Enter')
      const available = page.getByRole('button', { name: /Request to borrow Camera, CAM-01/ })
      await available.waitFor({ timeout: 5000 })
      checks.push(`after Retry (keyboard Enter): Camera text="${(await available.innerText()).trim()}" disabled=${await available.isDisabled()}; quota GETs=${api.calls.filter(c => c === 'GET /api/borrowing-quota').length}; alert gone=${(await page.getByText('Borrowing limit could not be loaded.').count()) === 0}`)
      await shot('catalog-after-retry')
    },
  },
  {
    // Finding F-01: after HTTP 409 the quota is invalidated; submission stays disabled while the re-read is held open.
    id: 'pending-refresh-after-409', route: '/requests', history: [pending('R1', lap)], quotas: [quota(1), 'held'],
    submit: { status: 409, body: { error: { code: 'BORROWING_QUOTA_EXCEEDED', message: 'You already have two pending requests.' } } },
    async run(page, api, shot, checks) {
      await page.getByText('1 of 2 pending requests').waitFor({ timeout: 10000 })
      const selector = page.getByLabel('Available equipment')
      await page.waitForFunction(() => !document.querySelector('select')?.disabled)
      await selector.selectOption('CAM-01')
      const submit = page.getByRole('button', { name: 'Submit request' })
      await submit.click()
      await page.getByText('You already have two pending requests.').waitFor()
      await page.waitForTimeout(300)
      checks.push(`while quota re-read held: Submit disabled=${await submit.isDisabled()}, selector disabled=${await selector.isDisabled()}`)
      checks.push(`panel loading text visible=${await page.getByText('Loading borrowing limit…').isVisible()}`)
      await submit.click({ force: true, timeout: 1000 }).catch(() => {})
      checks.push(`POST /api/requests count while held (after a forced second click)=${api.calls.filter(c => c === 'POST /api/requests').length}`)
      await shot('pending-refresh-after-409')
      api.release(quota(2))
      await page.getByText('2 of 2 pending requests').waitFor({ timeout: 5000 })
      checks.push(`after fresh full quota: Submit disabled=${await submit.isDisabled()}; POST count=${api.calls.filter(c => c === 'POST /api/requests').length}`)
      await shot('after-fresh-full-quota')
    },
  },
]

;(async () => {
  const browser = await chromium.launch()
  const results = []
  for (const scenario of scenarios) {
    for (const [name, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' })
      const page = await context.newPage()
      const api = await mockApi(page, scenario)
      const checks = []
      const shot = async label => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        checks.push(`[${label}] horizontal overflow=${overflow}px`)
        await page.screenshot({ path: path.join(OUT, `mocked-${label}-${name}.png`), fullPage: true })
      }
      try {
        await page.goto(APP + scenario.route)
        await scenario.run(page, api, shot, checks)
        results.push({ scenario: scenario.id, viewport: name, result: 'PASS', checks })
      } catch (error) {
        results.push({ scenario: scenario.id, viewport: name, result: 'FAIL', error: String(error.message).split('\n')[0], checks })
      }
      await context.close()
    }
  }
  await browser.close()
  fs.writeFileSync(path.join(OUT, 'mocked-post-review-verification.json'), JSON.stringify({
    note: 'MOCKED FRONTEND VERIFICATION — synthetic API responses via Playwright route interception; not production or full-stack evidence',
    app: APP, capturedAt: new Date().toISOString(), results }, null, 2) + '\n')
  for (const r of results) console.log(r.result, r.scenario, r.viewport, r.error ?? '', '|', r.checks.join('; '))
  process.exitCode = results.every(r => r.result === 'PASS') ? 0 : 1
})()
