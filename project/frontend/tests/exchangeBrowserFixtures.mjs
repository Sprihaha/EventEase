// Isolated browser fixtures. API traffic is always fulfilled locally; all other
// external traffic and unexpected API methods are blocked before reaching a server.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.EVENTEASE_PLAYWRIGHT_PATH ?? 'playwright')
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18446'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const expiry = '2099-01-01T00:00:00Z'
export const ticket = { id: 'ticket-a', eventId: 'event-a', eventName: 'Fixture concert', categoryType: 'STANDARD', seatSection: 'Floor', seatLabel: 'A1', price: 100, eligible: true, status: 'VALID' }
export const request = { id: 'request-a', requesterUserId: 'fixture-user', offeredTicketId: ticket.id, eventId: ticket.eventId, eventName: ticket.eventName, offeredCategoryType: ticket.categoryType, offeredSeatSection: ticket.seatSection,
  desiredCategoryType: null, desiredSeatSection: null, allowCrossTier: false, requestType: 'PUBLIC', status: 'MATCHED', expiresAt: expiry, createdAt: '2026-11-06T00:00:00Z' }
export const initialMatch = { id: 'match-a', requestAId: request.id, requestBId: 'request-b', ticketA: ticket, ticketB: { ...ticket, id: 'ticket-b', seatLabel: 'B1' }, aAccepted: false, bAccepted: false, status: 'PENDING', expiresAt: expiry, amountCents: 0, isPayer: false, paymentStatus: 'NOT_STARTED' }
export async function fixture() {
  const browser = await chromium.launch({ headless: true, ...(process.env.EVENTEASE_CHROME_PATH ? { executablePath: process.env.EVENTEASE_CHROME_PATH } : {}) })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const state = { match: { ...initialMatch }, requests: [request], listings: [], invitations: [], writes: [], forbidden: [], lookups: [], lookupFailure: false, lookupGates: {}, eligibilityGates: {}, eligibilityLookups: [], eligibilityFailure: false, recipientEligible: true, eligibleTickets: [ticket], ownedTickets: [], activity: [], errors: [] }
  page.on('pageerror', error => state.errors.push(error.message))
  page.on('dialog', async dialog => { state.errors.push(`Unexpected native ${dialog.type()} dialog`); await dialog.dismiss() })
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('same key')) state.errors.push(message.text()) })
  await page.addInitScript(() => sessionStorage.setItem('eventease-access-token', `fixture.${btoa(JSON.stringify({ exp: 4070908800 }))}.signature`))
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice('/api/v1'.length)
      if (url.origin !== 'http://127.0.0.1:18765' || (method !== 'GET' && !(method === 'POST' && ['/exchanges', '/exchanges/request-a/cancel', '/exchanges/matches/match-a/accept', '/exchanges/matches/match-a/reject', '/exchanges/matches/match-a/settle', '/exchanges/public-target/ticket-interest', '/exchanges/public-target/reject-invitation'].includes(path)))) {
        state.forbidden.push(`${method} ${url}`); return route.abort()
      }
      let body = [], status = 200
      if (path === '/auth/me') body = { id: 'fixture-user', username: 'fixture-user', role: 'CUSTOMER', email: null, mustChangePassword: false, passwordChangeable: true }
      else if (path === '/events' || path === '/me/bookings') body = { items: [], totalPages: 1, total: 0 }
      else if (path === '/exchanges/eligible-tickets') body = state.eligibleTickets
      else if (path.endsWith('/options')) body = [{ id: 'category-a', type: 'STANDARD', name: 'Standard', sections: ['Floor'] }]
      else if (path === '/me/tickets/history') body = state.ownedTickets
      else if (path === '/exchanges/activity') body = state.activity
      else if (path === '/exchanges/recipients/eligibility') {
        const username = url.searchParams.get('username')
        state.eligibilityLookups.push({ username, ticketId: url.searchParams.get('offeredTicketId') })
        body = { eligible: state.recipientEligible }
        if (state.eligibilityFailure) { status = 503; body = { error: { code: 'UNAVAILABLE', message: 'Unavailable' } } }
        if (state.eligibilityGates[username]) await state.eligibilityGates[username]
      }
      else if (path === '/exchanges/public-target/eligible-tickets') body = state.eligibleTickets
      else if (path === '/exchanges/public-target/ticket-interest') {
        state.writes.push({ path, payload: route.request().postDataJSON() })
        state.match = { ...initialMatch, requestAId: 'counterpart-request', requestBId: request.id, bAccepted: true }; body = state.match
      }
      else if (path === '/exchanges/public-target/reject-invitation') {
        state.writes.push({ path }); state.invitations = []; body = { ...request, requestType: 'DIRECT', status: 'CANCELLED' }
      }
      else if (path === '/exchanges/mine') body = { requests: state.requests, matches: [state.match] }
      else if (path === '/exchanges/listings') body = state.listings
      else if (path === '/exchanges/invitations') body = state.invitations
      else if (path === '/exchanges/recipients') {
        const q = url.searchParams.get('q'); state.lookups.push(q)
        if (state.lookupFailure) { status = 404; body = { error: { code: 'NOT_FOUND', message: 'Unavailable' } } }
        else body = ['BobFan', 'Bobby', 'Charlie'].filter(name => name.toLowerCase().startsWith(q.toLowerCase())).map(username => ({ username }))
        if (state.lookupGates[q]) await state.lookupGates[q]
      }
      else if (path === '/exchanges/request-a/cancel') {
        state.writes.push({ path }); body = { ...state.requests[0], status: 'CANCELLED' }; state.requests = [body]
      }
      else if (path === '/exchanges' && method === 'POST') {
        const payload = route.request().postDataJSON()
        state.writes.push({ path, payload })
        body = { ...request, id: `request-created-${state.writes.length}`, status: 'OPEN', ...payload, createdAt: '2026-11-07T00:00:00Z' }
        state.requests = [body, ...state.requests]
      }
      else if (path.startsWith('/exchanges/matches/')) {
        if (method === 'POST') {
          state.writes.push({ path, ...(path.endsWith('/settle') ? { payload: route.request().postDataJSON() } : {}) })
          if (path.endsWith('/accept')) state.match = { ...state.match, aAccepted: true,
            status: state.match.bAccepted ? (state.match.amountCents ? 'READY' : 'COMPLETED') : 'PENDING' }
          else if (path.endsWith('/settle')) {
            const outcome = route.request().postDataJSON().paymentMethod
            state.match = { ...state.match, status: outcome === 'mock_success' ? 'COMPLETED' : 'READY',
              paymentStatus: { mock_success: 'SUCCEEDED', mock_fail: 'FAILED', mock_pending: 'PENDING', mock_cancel: 'CANCELLED' }[outcome] }
            if (outcome === 'mock_fail') { status = 402; body = { error: { code: 'EXCHANGE_PAYMENT_FAILED', message: 'Declined' } } }
          } else state.match = { ...state.match, status: 'REJECTED' }
        }
        if (status === 200) body = state.match
      }
      return route.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': base } })
    }
    if (url.origin === new URL(base).origin && method === 'GET') return route.continue()
    return route.abort()
  })
  return { page, state, close: async () => { await context.close(); await browser.close() } }
}
