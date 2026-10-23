// Optional browser regression checks against a locally served production build.
// EVENTEASE_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs node --test tests/exchangeBrowser.mjs
// All APIs are intercepted. No application data or remote services are accessed.
import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
const { chromium } = await import(process.env.EVENTEASE_PLAYWRIGHT_PATH ?? 'playwright')
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18443'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
let browser
before(async () => { browser = await chromium.launch({ headless: true,
  ...(process.env.EVENTEASE_CHROME_PATH ? { executablePath: process.env.EVENTEASE_CHROME_PATH } : {}) }) })
after(async () => { await browser?.close() })
const expiry = '2099-01-01T00:00:00Z'
const ticket = { id: 'ticket-a', eventId: 'event-a', eventName: 'Local fixture concert', categoryType: 'STANDARD', categoryId: 'cat-a', seatSection: 'Floor', seatLabel: 'A-1', price: 120, status: 'VALID', eligible: true }
const request = { id: 'request-a', requesterUserId: 'user-a', offeredTicketId: ticket.id, eventId: ticket.eventId, eventName: ticket.eventName, offeredCategoryType: ticket.categoryType, offeredSeatSection: ticket.seatSection, desiredCategoryType: null, desiredSeatSection: null, allowCrossTier: false, requestType: 'PUBLIC', status: 'OPEN', expiresAt: expiry, createdAt: '2026-10-23T00:00:00Z' }
const match = { id: 'match-a', requestAId: request.id, requestBId: 'request-b', ticketA: ticket, ticketB: { ...ticket, id: 'ticket-b', seatLabel: 'A-2' }, aAccepted: true, bAccepted: true, status: 'READY', expiresAt: expiry, updatedAt: '2026-10-23T00:00:00Z' }
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const state = { failCreate: false, created: [], polls: {}, hold: false, release: null, account: 'user-a', match, activity: [] }
  const page = await context.newPage()
  await page.addInitScript(() => sessionStorage.setItem('eventease-access-token', `fixture.${btoa(JSON.stringify({ exp: 4070908800 }))}.signature`))
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(base).origin) return route.continue()
    if (url.origin !== 'http://127.0.0.1:18765' || !url.pathname.startsWith('/api/v1/')) return route.abort()
    const path = url.pathname.slice('/api/v1'.length)
    state.polls[path] = (state.polls[path] ?? 0) + 1
    if (state.hold && path === '/exchanges/mine') state.onPoll?.()
    if (state.hold && ['/exchanges/listings', '/exchanges/mine', '/exchanges/activity'].includes(path)) await new Promise(resolve => { (state.release ??= []).push(resolve) })
    let body = []
    let status = 200
    if (path === '/auth/me') body = { id: state.account, username: state.account, role: 'CUSTOMER', email: null, mustChangePassword: false, passwordChangeable: true }
    else if (path === '/events' || path === '/me/bookings') body = { items: [], totalPages: 1, total: 0 }
    else if (path === '/exchanges/eligible-tickets') body = [ticket]
    else if (path.endsWith('/options')) body = [{ id: 'cat-a', type: 'STANDARD', name: 'Actual Floor', sections: ['Floor'] }, { id: 'cat-b', type: 'VIP', name: 'Actual Balcony', sections: ['Balcony'] }]
    else if (path === '/exchanges/mine') body = { requests: state.created, matches: state.created.length ? [state.match] : [] }
    else if (path === '/exchanges/activity') body = state.activity
    else if (path.startsWith('/exchanges/matches/')) body = state.match
    else if (path === '/exchanges' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      if (state.failCreate) { status = 422; body = { error: { code: 'INVALID_PREFERENCE', message: 'Fixture rejection' } } }
      else { body = { ...request, ...payload }; state.created = [body] }
    } else if (path === '/exchanges/listings') body = [{ ...request, requestId: 'public-listing', offeredPrice: 120, offeredSeatLabel: 'A-1' }]
    await route.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': base } })
  })
  return { context, page, state }
}

test('modal, field order, real option IDs, error preservation, successful close, Escape and cancel', async () => {
  const { context, page, state } = await fixture()
  try {
    await page.goto(`${base}/community?tab=exchange`)
    await page.getByRole('button', { name: 'Create Request', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    const labels = await dialog.locator('label > span').allTextContents()
    assert.deepEqual(labels.filter(x => ['Request Type', 'Desired Category', 'Desired Seat Section', 'Ticket to Offer'].includes(x)), ['Request Type', 'Desired Category', 'Desired Seat Section', 'Ticket to Offer'])
    await dialog.getByLabel('Ticket to Offer', { exact: true }).selectOption('ticket-a')
    await dialog.getByLabel('Desired Category', { exact: true }).selectOption('cat-b')
    await dialog.getByLabel('Desired Seat Section', { exact: true }).selectOption('Balcony')
    assert.deepEqual(await dialog.getByLabel('Desired Seat Section', { exact: true }).locator('option').allTextContents(), ['Any event section', 'Balcony'])
    await dialog.getByLabel('Allow cross-tier suggestions').check()
    if (process.env.EVENTEASE_SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.EVENTEASE_SCREENSHOT_DIR}/exchange-modal-desktop.png` })
      await page.setViewportSize({ width: 390, height: 844 })
      const bounds = await dialog.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
      await page.screenshot({ path: `${process.env.EVENTEASE_SCREENSHOT_DIR}/exchange-modal-mobile.png` })
      await page.setViewportSize({ width: 1280, height: 900 })
    }
    state.failCreate = true
    await dialog.getByRole('button', { name: 'Create request', exact: true }).click()
    await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.getByLabel('Desired Category', { exact: true }).inputValue(), 'cat-b')
    assert.equal(await dialog.getByLabel('Desired Seat Section', { exact: true }).inputValue(), 'Balcony')
    state.failCreate = false
    await dialog.getByRole('button', { name: 'Create request', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(state.created[0].desiredCategoryId, 'cat-b')
    assert.equal(state.created[0].desiredCategoryType, 'VIP')
    await page.getByRole('button', { name: 'Create Request', exact: true }).click()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Create Request', exact: true }).click()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
  } finally { await context.close() }
})

test('background polling retains listings, history and activity without loading flicker', { timeout: 45_000 }, async () => {
  const { context, page, state } = await fixture()
  try {
    state.created = [request]
    state.activity = [{ id: 'activity-a', action: 'EXCHANGE_ACCEPTED', ownAction: false, eventName: ticket.eventName, createdAt: request.createdAt, matchId: match.id, requestId: null }]
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    await page.getByText('The other participant accepted', { exact: false }).waitFor()
    await page.getByRole('heading', { name: 'My matches', exact: true }).waitFor()
    await page.getByRole('button', { name: 'View match', exact: true }).waitFor()
    const previous = state.polls['/exchanges/mine']
    const polled = new Promise(resolve => { state.onPoll = resolve })
    state.hold = true
    await polled
    assert.ok(state.polls['/exchanges/mine'] > previous)
    assert.equal(await page.getByRole('button', { name: 'View match', exact: true }).count(), 1)
    assert.equal(await page.getByText('Loading exchange data…', { exact: true }).count(), 0)
    assert.equal(await page.getByText('Loading exchange activity…', { exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Public listings', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: ticket.eventName, exact: true }).count(), 1)
    state.hold = false
    for (const release of state.release ?? []) release()
  } finally { await context.close() }
})

test('activity opens proposal details; equal value needs no payment; history survives page refresh', async () => {
  const { context, page, state } = await fixture()
  try {
    state.created = [request]
    state.activity = [{ id: 'activity-a', action: 'EXCHANGE_READY', ownAction: false, eventName: ticket.eventName, createdAt: request.createdAt, matchId: match.id, requestId: null }]
    await page.goto(`${base}/community?tab=exchange`)
    await page.getByRole('link', { name: /Both accepted/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('heading', { name: 'Ticket you receive' }).waitFor()
    assert.match(await dialog.textContent(), /no payment required/)
    assert.equal(await dialog.getByRole('combobox').count(), 0)
    await dialog.getByRole('button', { name: 'Complete equal-value swap' }).waitFor()
    await page.keyboard.press('Escape')
    state.match = { ...match, status: 'COMPLETED' }
    await page.reload()
    await page.getByText(/Completed 23\/10\/2026|Completed 10\/23\/2026/).first().waitFor()
    assert.ok(await page.getByRole('button', { name: 'View match', exact: true }).count())
  } finally { await context.close() }
})
