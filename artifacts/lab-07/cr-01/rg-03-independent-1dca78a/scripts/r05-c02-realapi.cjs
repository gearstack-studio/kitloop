// Reviewer real-API browser check for #91 (NOT part of the PR).
// Real Vite frontend + real KitLoop API + real PostgreSQL. The ONLY interception is on GET /api/borrowing-quota: the
// request is sent to the real API at once (route.fetch), and the REAL response is delivered unchanged after a hold.
// No response body, status or header is invented or altered. Every other call passes through untouched.
// Usage: node r05-c02-realapi.cjs <fixed|prefix>
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { chromium, request: playwrightRequest } = createRequire('D:/SWE_Project/kitloop-rg03-1dca78a/e2e/package.json')('@playwright/test')

const label = process.argv[2]
if (!['fixed', 'prefix'].includes(label)) throw new Error('usage: <fixed|prefix>')
const APP = 'http://localhost:5173', API = 'http://localhost:3000/api'
const OUT = 'D:/SWE_Project/kitloop-lab7-partA-evidence/screenshots'
fs.mkdirSync(OUT, { recursive: true })
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, '.e2e-credentials.json'), 'utf8'))
const results = []
const log = (step, data) => { results.push({ step, ...data }); console.log(`${label} ${step} ${JSON.stringify(data)}`) }

async function apiSession(username) {
  const ctx = await playwrightRequest.newContext({ extraHTTPHeaders: { Origin: APP } })
  const login = await ctx.post(`${API}/auth/login`, { data: { username, password: creds.password } })
  if (login.status() !== 200) throw new Error(`api login ${login.status()}`)
  const csrf = login.headers()['x-csrf-token']
  return { ctx, post: (p, data) => ctx.post(API + p, { data, headers: { 'X-CSRF-Token': csrf } }), get: p => ctx.get(API + p) }
}
async function browserSession(browser, username) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.posts = []
  page.on('request', r => { if (r.method() === 'POST' && r.url() === `${API}/requests`) page.posts.push(new Date().toISOString()) })
  page.postResponses = []
  page.on('response', r => { if (r.request().method() === 'POST' && r.url() === `${API}/requests`) page.postResponses.push(r.status()) })
  // Hold support: fetch the real response immediately, deliver it only when released.
  page.hold = null
  page.quotaGets = 0
  await page.route(`${API}/borrowing-quota`, async route => {
    page.quotaGets++
    const response = await route.fetch() // real request to the real API
    if (page.hold) { const h = page.hold; h.count++; await h.released }
    await route.fulfill({ response }) // the real response, unchanged
  })
  return { context, page }
}
function holdQuota(page) {
  let release
  page.hold = { count: 0, released: new Promise(r => { release = r }) }
  return () => { page.hold && (page.hold = null); release() }
}
async function signIn(page, username) {
  await page.goto(APP + '/login')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(creds.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
}

;(async () => {
  const browser = await chromium.launch()
  try {
    // ---------- C02: loading-state accessible name while the real initial quota read is held ----------
    {
      const user = creds.users[label === 'fixed' ? 'c02Fixed' : 'c02Prefix']
      const { page, context } = await browserSession(browser, user)
      const release = holdQuota(page)
      await signIn(page, user)
      const camera = page.getByRole('button', { name: /Camera, E2E-CAM-01/ })
      await camera.waitFor({ timeout: 10000 })
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /E2E-CAM-01/.test(b.getAttribute('aria-label') ?? '') && b.textContent === 'Checking limit'), null, { timeout: 10000 })
      const data = { text: (await camera.innerText()).trim(), ariaLabel: await camera.getAttribute('aria-label'), disabled: await camera.isDisabled(), heldQuotaResponses: page.hold?.count ?? 0 }
      await page.screenshot({ path: `${OUT}/${label}-c02-loading-state.png`, fullPage: true })
      release()
      await page.getByRole('button', { name: /Request to borrow Camera, E2E-CAM-01/ }).waitFor({ timeout: 10000 })
      data.afterRelease = await page.getByRole('button', { name: /Camera, E2E-CAM-01/ }).getAttribute('aria-label')
      data.expectedLoadingName = 'Checking your borrowing limit: Camera, E2E-CAM-01 cannot be requested yet'
      data.pass = data.ariaLabel === data.expectedLoadingName && data.text === 'Checking limit' && data.disabled
      log('C02', data)
      await context.close()
    }

    // ---------- R05: route-entry refresh pending after capacity changed elsewhere ----------
    {
      const user = creds.users[label === 'fixed' ? 'r05Fixed' : 'r05Prefix']
      const api = await apiSession(user)
      const seed = await api.post('/requests', { assetId: 'E2E-LAP-01' }) // P = 1 before the browser session
      const { page, context } = await browserSession(browser, user)
      await signIn(page, user)
      const camera = page.getByRole('button', { name: /Request to borrow Camera, E2E-CAM-01/ })
      await camera.waitFor({ timeout: 10000 })
      await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => /Request to borrow Camera/.test(x.getAttribute('aria-label') ?? '')); return b && !b.disabled })
      // Another session (e.g. a second tab) uses the last slot: the server now has P = 2; this page still holds P = 1.
      const other = await api.post('/requests', { assetId: 'E2E-TRI-01' })
      const serverQuota = await (await api.get('/borrowing-quota')).json()
      const release = holdQuota(page)
      const getsBefore = page.quotaGets
      await camera.click() // selects Camera and enters /requests: route-entry quota re-read starts (held)
      await page.getByRole('heading', { name: 'Request equipment' }).waitFor()
      for (let i = 0; i < 50 && page.quotaGets === getsBefore; i++) await page.waitForTimeout(20)
      await page.waitForTimeout(150)
      const submit = page.getByRole('button', { name: 'Submit request' })
      const during = {
        routeEntryQuotaGetIssued: page.quotaGets > getsBefore, heldResponses: page.hold?.count ?? 0,
        selectorDisabled: await page.getByLabel('Available equipment').isDisabled(),
        submitDisabled: await submit.isDisabled(),
        panel: (await page.getByRole('region', { name: 'Borrowing limit' }).innerText()).replace(/\s+/g, ' ').trim(),
      }
      await page.screenshot({ path: `${OUT}/${label}-r05-route-entry-refresh-pending.png`, fullPage: true })
      // Try every way a user could submit while the refresh is pending.
      await submit.click({ timeout: 1000 }).catch(() => {})
      await page.evaluate(() => document.querySelector('form.request-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      await page.waitForTimeout(500)
      during.postsWhilePending = page.posts.length
      during.postResponsesWhilePending = [...page.postResponses]
      release()
      await page.getByRole('region', { name: 'Borrowing limit' }).getByText('2 of 2 pending requests').waitFor({ timeout: 10000 })
      const after = { panel: (await page.getByRole('region', { name: 'Borrowing limit' }).innerText()).replace(/\s+/g, ' ').trim(),
        submitDisabled: await submit.isDisabled(), postsTotal: page.posts.length, postResponses: [...page.postResponses] }
      await page.screenshot({ path: `${OUT}/${label}-r05-after-fresh-quota.png`, fullPage: true })
      const mine = await (await api.get('/requests/mine')).json()
      const persisted = { pending: mine.filter(r => r.status === 'PENDING').map(r => r.assetId).sort(), cameraRows: mine.filter(r => r.assetId === 'E2E-CAM-01').length }
      log('R05', { seedStatus: seed.status(), otherSessionStatus: other.status(), serverQuotaBeforeEntry: serverQuota, during, after, persisted,
        pass: during.routeEntryQuotaGetIssued && during.selectorDisabled && during.submitDisabled && during.postsWhilePending === 0 && after.postsTotal === 0 && persisted.cameraRows === 0 })
      await context.close(); await api.ctx.dispose()
    }
  } catch (error) {
    log('ERROR', { message: String(error.message).split('\n')[0], pass: false })
  } finally {
    await browser.close()
    fs.writeFileSync(`${OUT}/${label}-r05-c02-results.json`, JSON.stringify({
      note: 'REAL API + PostgreSQL. Only GET /api/borrowing-quota responses were HELD (real response fetched from the API and delivered unchanged after a delay); nothing was mocked.',
      label, app: APP, api: API, results }, null, 2) + '\n')
    process.exitCode = results.length && results.every(r => r.pass) ? 0 : 1
  }
})()
