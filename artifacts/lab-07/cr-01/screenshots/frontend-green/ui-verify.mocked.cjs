// MOCKED FRONTEND VERIFICATION for CR-01 #82 — not production and not full-stack evidence.
// Serves the local Vite dev build (http://127.0.0.1:5199) and fulfils every API call with synthetic mocked data.
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const req = createRequire(path.join('D:/SWE_Project/kitloop/e2e', 'package.json'))
const { chromium } = req('@playwright/test')

const APP = 'http://127.0.0.1:5199'
const OUT = 'D:/SWE_Project/kitloop/artifacts/lab-07/cr-01/screenshots/frontend-green'
fs.mkdirSync(OUT, { recursive: true })

const quota = p => ({ pendingRequests: p, maxPendingRequests: 2, remainingRequestCapacity: Math.max(0, 2 - p), canSubmitRequest: p < 2 })
const asset = (assetId, name, category, available = true) => ({ assetId, name, category, description: `Synthetic ${name.toLowerCase()} for mocked verification`, available })
const assets = [asset('CAM-01', 'Camera', 'Camera'), asset('LAP-01', 'Laptop', 'Computer'), asset('MIC-01', 'Microphone', 'Audio', false), asset('TRI-01', 'Tripod', 'Camera'), asset('PRJ-01', 'Projector', 'Display')]
const pending = (id, a) => ({ id, assetId: a.assetId, borrowerId: 'B1', status: 'PENDING', submittedAt: '2026-11-26T09:00:00Z', closedAt: null, closeReason: null, asset: { assetId: a.assetId, name: a.name, category: a.category } })
const [cam, lap, , tri, prj] = assets
const me = { id: 'B1', role: 'BORROWER', username: 'mock.borrower' }

const scenarios = [
  { id: '01-available-quota', route: '/requests', history: [pending('R1', lap)], quotas: [quota(1)], expect: ['1 of 2 pending requests', 'You can submit 1 more request.'] },
  { id: '02-full-quota', route: '/requests', history: [pending('R1', lap), pending('R2', tri)], quotas: [quota(2)], expect: ['2 of 2 pending requests', 'Limit reached.'] },
  { id: '03-historical-over-limit', route: '/requests', history: [pending('R1', lap), pending('R2', tri), pending('R3', prj)], quotas: [quota(3)], expect: ['3 of 2 pending requests', 'Limit reached.'] },
  { id: '04-loading', route: '/requests', history: [pending('R1', lap)], quotas: ['hang'], expect: ['Loading borrowing limit…'] },
  { id: '05-error-and-retry', route: '/requests', history: [], quotas: [{ status: 500 }, quota(0)], expect: ['Borrowing limit could not be loaded.'], after: async page => {
      await page.getByRole('button', { name: 'Retry borrowing limit' }).click()
      await page.getByText('0 of 2 pending requests').waitFor()
    }, afterShot: '05b-after-retry' },
  { id: '06-recovery-after-cancellation', route: '/requests', history: [pending('R1', lap), pending('R2', tri)], quotas: [quota(2), quota(1)], expect: ['2 of 2 pending requests'], after: async page => {
      await page.getByRole('button', { name: 'Cancel request for Laptop' }).click()
      await page.getByText('Request cancelled.').waitFor()
      await page.getByText('1 of 2 pending requests').waitFor()
    }, afterShot: '06b-after-cancel' },
  { id: '07-catalog-eligibility-full', route: '/dashboard', history: [pending('R1', lap), pending('R2', tri)], quotas: [quota(2)], expectButtons: ['Request limit reached: Camera, CAM-01 cannot be requested now', 'Request pending: you already have a pending request for Laptop, LAP-01', 'Microphone, MIC-01 is checked out and cannot be requested'] },
  { id: '08-feature-disabled', route: '/requests', history: [pending('R1', lap), pending('R2', tri)], quotas: [quota(2)], features: { requestLifecycleActions: true, borrowingQuota: false }, expectAbsent: 'Borrowing limit' },
  { id: '09-malformed-response', route: '/requests', history: [], quotas: [{ status: 200, body: { pendingRequests: '1', activeLoans: 3 } }], expect: ['Borrowing limit could not be loaded.'] },
]
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }

async function mockApi(page, scenario) {
  let history = JSON.parse(JSON.stringify(scenario.history))
  const quotas = [...scenario.quotas]
  const features = scenario.features ?? { requestLifecycleActions: true, borrowingQuota: true }
  const cors = { 'Access-Control-Allow-Origin': APP, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-CSRF-Token' }
  const reply = (route, body, status = 200) => route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json', 'X-CSRF-Token': 'mock-csrf' }, body: JSON.stringify(body) })
  await page.route('http://localhost:3000/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    switch (url.pathname) {
      case '/api/auth/me': return reply(route, { ...me, features })
      case '/api/assets': return reply(route, assets)
      case '/api/requests/mine': return reply(route, history)
      case '/api/loans/mine': return reply(route, [])
      case '/api/borrowing-quota': {
        const next = quotas.length > 1 ? quotas.shift() : quotas[0]
        if (next === 'hang') return // never fulfilled: loading state
        if (next.status) return reply(route, next.body ?? { error: { message: 'Mocked failure' } }, next.status)
        return reply(route, next)
      }
    }
    const cancel = /^\/api\/requests\/([^/]+)\/cancel$/.exec(url.pathname)
    if (cancel && request.method() === 'POST') {
      history = history.map(item => item.id === cancel[1] ? { ...item, status: 'CANCELLED', closedAt: '2026-11-27T04:00:00Z', closeReason: 'CANCELLED_BY_BORROWER' } : item)
      return reply(route, history.find(item => item.id === cancel[1]))
    }
    return reply(route, { error: { message: `Unmocked ${request.method()} ${url.pathname}` } }, 404)
  })
}

;(async () => {
  const browser = await chromium.launch()
  const results = []
  for (const scenario of scenarios) {
    for (const [name, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' })
      const page = await context.newPage()
      await mockApi(page, scenario)
      const checks = []
      try {
        await page.goto(APP + scenario.route)
        await page.getByText(scenario.route === '/dashboard' ? 'Equipment catalog' : 'My requests', { exact: true }).first().waitFor({ timeout: 10000 })
        for (const text of scenario.expect ?? []) { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 }); checks.push(`text "${text}" visible`) }
        for (const label of scenario.expectButtons ?? []) { await page.getByRole('button', { name: label }).waitFor({ timeout: 5000 }); checks.push(`button "${label}"`) }
        if (scenario.expectAbsent) {
          await page.waitForTimeout(500)
          const count = await page.getByRole('region', { name: scenario.expectAbsent }).count()
          if (count !== 0) throw new Error(`${scenario.expectAbsent} region should be absent`)
          checks.push(`no "${scenario.expectAbsent}" region`)
        }
        if (scenario.route === '/requests' && !scenario.expectAbsent) {
          const submit = page.getByRole('button', { name: /Submit request|Submitting/ })
          checks.push(`Submit disabled=${await submit.isDisabled()}`)
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        checks.push(`horizontal overflow=${overflow}px`)
        await page.screenshot({ path: `${OUT}/mocked-${scenario.id}-${name}.png`, fullPage: true })
        if (scenario.after) {
          await scenario.after(page)
          await page.screenshot({ path: `${OUT}/mocked-${scenario.afterShot}-${name}.png`, fullPage: true })
          checks.push(`after-step "${scenario.afterShot}" ok; Submit disabled=${await page.getByRole('button', { name: /Submit request/ }).isDisabled()}`)
        }
        results.push({ scenario: scenario.id, viewport: name, result: 'PASS', checks })
      } catch (error) {
        await page.screenshot({ path: `${OUT}/mocked-${scenario.id}-${name}-FAILED.png`, fullPage: true }).catch(() => {})
        results.push({ scenario: scenario.id, viewport: name, result: 'FAIL', error: String(error.message).split('\n')[0], checks })
      }
      await context.close()
    }
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/mocked-ui-verification.json`, JSON.stringify({ note: 'MOCKED FRONTEND VERIFICATION — synthetic API responses via Playwright route interception; not production or full-stack evidence', app: APP, results }, null, 2))
  for (const r of results) console.log(r.result, r.scenario, r.viewport, r.error ?? '', '|', r.checks.join('; '))
})()
