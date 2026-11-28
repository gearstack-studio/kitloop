// TC11 S6 at E level (reproduction only): the client still shows capacity, the server answers 409 BORROWING_QUOTA_EXCEEDED.
// Real Vite frontend + real API + PostgreSQL. NO request interception: the stale state is produced by a second
// session of the same borrower using the last slot while the page stays on My requests.
// Usage (from the repository root, servers running, fixture seeded):
//   node artifacts/lab-07/cr-01/rg-03-independent-1dca78a/scripts/tc11-s6-stale409.cjs
const fs = require('node:fs')
const paths = require('./paths.cjs')
const { chromium, request } = paths.requireFrom('e2e', '@playwright/test')

const creds = paths.readCredentials()
const username = creds.users.s6
const results = []
const record = (step, pass, detail) => { results.push({ step, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${step} :: ${JSON.stringify(detail)}`) }

;(async () => {
  const browser = await chromium.launch()
  const api = await request.newContext({ extraHTTPHeaders: { Origin: paths.APP_ORIGIN } })
  try {
    const login = await api.post(`${paths.API_ON}/auth/login`, { data: { username, password: creds.password } })
    const csrf = login.headers()['x-csrf-token']
    const submitApi = assetId => api.post(`${paths.API_ON}/requests`, { data: { assetId }, headers: { 'X-CSRF-Token': csrf } })
    record('seed P = 1 via API', (await submitApi('RG-21')).status() === 201, {})

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const calls = []
    page.on('request', r => { if (r.url().startsWith(paths.API_ON)) calls.push(`${r.method()} ${r.url().slice(paths.API_ON.length)}`) })
    await page.goto(paths.APP_ORIGIN + '/login')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(creds.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.getByRole('link', { name: 'My requests' }).first().click()
    const panel = page.getByRole('region', { name: 'Borrowing limit' })
    await panel.getByText('1 of 2 pending requests').waitFor({ timeout: 10000 })

    // Another session of the same borrower takes the last slot: server P = 2, page still shows P = 1.
    record('other session takes the last slot', (await submitApi('RG-22')).status() === 201, {})
    await page.waitForFunction(() => { const s = document.querySelector('select'); return s && !s.disabled })
    await page.getByLabel('Available equipment').selectOption('RG-23')
    const mark = calls.length
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url() === `${paths.API_ON}/requests` && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Submit request' }).click(),
    ])
    const body = await response.json()
    await page.getByText(body?.error?.message ?? 'You already have two pending requests.').waitFor({ timeout: 10000 })
    await panel.getByText('2 of 2 pending requests').waitFor({ timeout: 10000 })
    const after = calls.slice(mark)
    const posts = after.filter(c => c === 'POST /requests').length
    const reread = after.indexOf('GET /borrowing-quota') > after.indexOf('POST /requests')
    const successNotice = await page.getByText('Borrow request submitted with PENDING status.').count()
    const submitDisabled = await page.getByRole('button', { name: 'Submit request' }).isDisabled()
    await page.screenshot({ path: paths.outputPath('screenshots', 'tc11-s6-stale-409.png'), fullPage: true })
    record('S6: server 409 shown, no success notice, quota re-read, limit shown, one POST',
      response.status() === 409 && body?.error?.code === 'BORROWING_QUOTA_EXCEEDED' && successNotice === 0 && reread && posts === 1 && submitDisabled,
      { status: response.status(), code: body?.error?.code, message: body?.error?.message, successNotice, quotaReReadAfterPost: reread, posts, submitDisabled, callsAfterSubmit: after })
    await context.close()
  } catch (error) {
    record('unexpected error', false, { message: String(error.message).split('\n')[0] })
  } finally {
    await api.dispose(); await browser.close()
    fs.writeFileSync(paths.outputPath('tc11-s6-stale409.json'), JSON.stringify({ note: 'Real API, no interception', results }, null, 2) + '\n')
    process.exitCode = results.every(r => r.pass) ? 0 : 1
  }
})()
