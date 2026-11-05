// Separate local Vite server. All API requests are mocked and remote traffic blocked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
const { chromium } = await import(process.env.EVENTEASE_PLAYWRIGHT_PATH ?? 'playwright')
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18446'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const expiry = '2099-01-01T00:00:00Z'
const statuses = ['OPEN', 'MATCHED', 'COMPLETED', 'CANCELLED', 'EXPIRED']
const labels = ['Open', 'Matched', 'Completed', 'Cancelled', 'Expired']
const colours = ['oklch(0.459 0.187 3.815)', 'oklch(0.473 0.137 46.201)', 'oklch(0.432 0.095 166.913)', 'oklch(0.444 0.177 26.899)', 'oklch(0.438 0.218 303.724)']
const requests = Array.from({ length: 12 }, (_, i) => ({
  id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
  requesterUserId: 'fixture-user', offeredTicketId: `ticket-${i}`, eventId: `event-${i}`,
  eventName: `Fixture concert ${i + 1}`, offeredCategoryType: 'STANDARD', offeredSeatSection: 'Floor',
  desiredCategoryType: null, desiredSeatSection: null, allowCrossTier: false, requestType: 'PUBLIC',
  status: statuses[i % statuses.length], expiresAt: expiry, createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
}))
const ticket = n => ({ id: `ticket-${n}`, eventId: `event-${n}`, eventName: `Fixture concert ${n + 1}`, categoryType: 'STANDARD', seatSection: 'Floor', seatLabel: 'A1', price: 100 })
const matches = requests.filter(r => r.status !== 'OPEN').map(r => {
  const i = requests.indexOf(r)
  return { id: `match-${i}`, requestAId: `counterpart-${i}`, requestBId: r.id,
    ticketA: { ...ticket(i), id: `counterpart-ticket-${i}`, seatLabel: 'B2' }, ticketB: ticket(i),
    aAccepted: true, bAccepted: true, status: r.status === 'MATCHED' ? 'READY' : r.status,
    expiresAt: expiry, updatedAt: r.createdAt }
})
test('filtering, numbering, match links, refresh, reopening, pagination and mobile', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.EVENTEASE_CHROME_PATH ? { executablePath: process.env.EVENTEASE_CHROME_PATH } : {}) })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const forbidden = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  let history = [...requests].reverse(), mineCalls = 0
  await page.addInitScript(() => sessionStorage.setItem('eventease-access-token', `fixture.${btoa(JSON.stringify({ exp: 4070908800 }))}.signature`))
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice('/api/v1'.length)
      const mockedWrite = method === 'POST' && (path === '/exchanges' || path === '/exchanges/new-request-13/cancel')
      if (url.origin !== 'http://127.0.0.1:18765' || (method !== 'GET' && !mockedWrite)) {
        forbidden.push(`${method} ${url.origin}${url.pathname}`)
        return route.abort()
      }
      let body = []
      if (path === '/auth/me') body = { id: 'fixture-user', username: 'fixture-user', role: 'CUSTOMER', email: null, mustChangePassword: false, passwordChangeable: true }
      else if (path === '/events' || path === '/me/bookings') body = { items: [], totalPages: 1, total: 0 }
      else if (path === '/exchanges/eligible-tickets') body = [{ ...ticket(12), eligible: true, status: 'VALID' }]
      else if (path === '/exchanges' && method === 'POST') {
        body = { ...requests[0], id: 'new-request-13', offeredTicketId: 'ticket-12', eventId: 'event-12', eventName: 'Fixture concert 13', createdAt: '2026-11-06T00:00:00Z' }
        history = [body, ...history]
      }
      else if (path === '/exchanges/new-request-13/cancel' && method === 'POST') {
        body = { ...history.find(r => r.id === 'new-request-13'), status: 'CANCELLED' }
        history = history.map(r => r.id === body.id ? body : r)
      }
      else if (path === '/exchanges/mine') { body = { requests: history, matches }; mineCalls++ }
      else if (path.startsWith('/exchanges/matches/')) body = matches.find(m => path.endsWith(m.id))
      return route.fulfill({ status: 200, json: body, headers: { 'Access-Control-Allow-Origin': base } })
    }
    if (url.origin === new URL(base).origin && method === 'GET') return route.continue()
    return route.abort()
  })
  const section = page.getByRole('region', { name: 'EaseXchange', exact: true })
  const numbers = () => section.getByText(/^Request \d+$/).allTextContents()
  async function choose(label) {
    await section.locator('button[aria-haspopup="listbox"]').click()
    assert.deepEqual(await section.getByRole('option').allTextContents(), ['All statuses', ...labels])
    await section.getByRole('option', { name: label, exact: true }).click()
    const status = statuses[labels.indexOf(label)]
    await page.waitForURL(url => url.searchParams.get('status') === status)
    await page.waitForFunction(selected => {
      const trigger = document.querySelector('section[aria-label="EaseXchange"] button[aria-haspopup="listbox"]')
      return trigger?.textContent.trim() === selected
    }, label)
  }
  try {
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    await section.getByText('Request 12', { exact: true }).waitFor()
    assert.deepEqual(await numbers(), Array.from({ length: 10 }, (_, i) => `Request ${12 - i}`))
    assert.equal(await section.getByRole('heading', { name: /My matches|Suggested matches/i }).count(), 0)
    assert.doesNotMatch(await section.innerText(), /11111111-|PENDING|READY/)
    await section.getByRole('button', { name: 'Next', exact: true }).click()
    assert.deepEqual(await numbers(), ['Request 2', 'Request 1'])
    for (const [i, label] of labels.entries()) {
      await choose(label)
      const expected = [...requests].reverse().filter(r => r.status === statuses[i]).map(r => `Request ${requests.indexOf(r) + 1}`)
      assert.deepEqual(await numbers(), expected)
      assert.equal(await section.getByRole('button', { name: /^View .+ match$/ }).count(), label === 'Open' ? 0 : expected.length)
      const badge = section.locator('span.inline-flex').filter({ hasText: new RegExp(`^${label}$`) }).first()
      assert.equal(await badge.evaluate(el => getComputedStyle(el).color), colours[i])
    }
    await choose('Matched')
    await section.getByRole('button', { name: /^View .+ match$/ }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('heading', { name: 'Request 12 · Match detail', exact: true }).waitFor()
    assert.match(await dialog.innerText(), /Both users accepted\. Awaiting settlement/)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    history = [...requests]
    const calls = mineCalls
    await section.getByRole('button', { name: 'Refresh My Exchanges', exact: true }).click()
    await section.getByText('Request 2', { exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('section[aria-label="EaseXchange"]')?.textContent.includes('Loading exchange data'))
    assert.ok(mineCalls > calls)
    assert.deepEqual(await numbers(), ['Request 2', 'Request 7', 'Request 12'])
    await page.reload()
    await section.getByText('Request 2', { exact: true }).waitFor()
    assert.deepEqual(await numbers(), ['Request 2', 'Request 7', 'Request 12'])
    await section.getByRole('button', { name: 'Public listings', exact: true }).click()
    await section.getByRole('button', { name: 'My Exchanges', exact: true }).click()
    await section.getByText('Request 2', { exact: true }).waitFor()
    assert.deepEqual(await numbers(), ['Request 2', 'Request 7', 'Request 12'])
    await choose('Open')
    assert.equal(await section.getByRole('button', { name: 'Find compatible requests', exact: true }).count(), 0)
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await choose('Expired')
    assert.deepEqual(await numbers(), ['Request 5', 'Request 10'])
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: '/private/tmp/eventease-exchange-statuses-mobile.png', fullPage: true })
    await choose('Open')
    await section.getByRole('button', { name: 'Request EaseXchange', exact: true }).click()
    const createDialog = page.getByRole('dialog')
    await createDialog.locator('button[aria-haspopup="listbox"]').nth(1).click()
    await createDialog.getByRole('option', { name: /Fixture concert 13/ }).click()
    await createDialog.getByRole('button', { name: 'Create request', exact: true }).click()
    const createdNotice = section.getByRole('status').filter({ hasText: /^Request 13 created$/ })
    await createdNotice.waitFor()
    await page.waitForTimeout(4000)
    assert.equal(await createdNotice.isVisible(), true)
    await createdNotice.waitFor({ state: 'detached', timeout: 2000 })
    const header = section.getByText('Request 13', { exact: true }).locator('..').locator('..')
    const cancel = header.getByRole('button', { name: 'Cancel request', exact: true })
    await cancel.waitFor()
    await page.screenshot({ path: '/private/tmp/eventease-request-cancel-mobile.png', fullPage: true })
    await cancel.click()
    const cancelledNotice = section.getByRole('status').filter({ hasText: /^Request 13 cancelled$/ })
    await cancelledNotice.waitFor()
    await page.waitForTimeout(4000)
    assert.equal(await cancelledNotice.isVisible(), true)
    await cancelledNotice.waitFor({ state: 'detached', timeout: 2000 })
    await choose('Expired')
    history = requests.filter(r => r.status === 'OPEN')
    await page.reload()
    await section.getByText('No requests with this status.', { exact: true }).waitFor()
    assert.deepEqual(await numbers(), [])
    assert.equal(await section.getByRole('button', { name: /^View .+ match$/ }).count(), 0)
    assert.deepEqual(forbidden, [])
    assert.deepEqual(errors, [])
  } finally { await context.close(); await browser.close() }
})
