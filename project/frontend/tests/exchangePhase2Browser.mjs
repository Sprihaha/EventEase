import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, ticket, initialMatch } from './exchangeBrowserFixtures.mjs'
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18446'
const listing = { requestId: 'public-target', eventId: ticket.eventId, eventName: ticket.eventName,
  offeredTicketId: 'other-ticket', offeredCategoryType: 'STANDARD', offeredSeatSection: 'Floor', offeredPrice: 100,
  desiredCategoryType: null, desiredSeatSection: null, allowCrossTier: false, expiresAt: '2099-01-01T00:00:00Z' }
const received = { id: 'ticket-b', code: null, status: 'VALID', bookingId: 'booking-b', bookingStatus: 'CONFIRMED',
  event: { id: 'event-a', title: 'Received fixture concert', startAt: '2099-06-01T00:00:00Z', endAt: '2099-06-02T00:00:00Z', venueName: 'Fixture venue', imageUrl: null },
  categoryType: 'STANDARD', categoryName: 'Standard', unitPriceCents: 10000, seatLabel: 'B1', seatSection: 'Floor', checkedInAt: null, exchangedAt: '2026-11-06T00:00:00Z' }
async function openPublic(page) {
  await page.goto(`${base}/community?tab=exchange&view=listings`)
  await page.getByRole('region', { name: 'EaseXchange', exact: true }).getByRole('button', { name: 'Express interest', exact: true }).click()
  return page.getByRole('dialog')
}

test('Public interest: zero/one/multiple tickets, closing selection, dismissing confirmation and irreversible offer', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    state.listings = [listing]; state.eligibleTickets = []
    let dialog = await openPublic(page)
    await dialog.getByText("You don't have any eligible tickets for this exchange.", { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Express interest', exact: true }).isDisabled(), true)
    await page.keyboard.press('Escape')
    state.eligibleTickets = [ticket]
    dialog = await openPublic(page)
    const chooser = dialog.locator('button[aria-haspopup="listbox"]')
    await chooser.click()
    assert.equal(await dialog.getByRole('option').count(), 2) // placeholder + one ticket
    await dialog.getByRole('option', { name: /Ticket 1/ }).click()
    await page.keyboard.press('Escape')
    assert.equal(state.writes.length, 0)
    state.eligibleTickets = [ticket, { ...ticket, id: 'ticket-c', seatLabel: 'C2' }]
    dialog = await openPublic(page)
    await chooser.click()
    assert.equal(await dialog.getByRole('option').count(), 3)
    await dialog.getByRole('option', { name: /Ticket 2.*C2/ }).click()
    const submit = dialog.getByRole('button', { name: 'Express interest', exact: true })
    await submit.click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Go Back', exact: true }).click()
    assert.equal(state.writes.length, 0)
    await submit.click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm offer', exact: true }).click()
    await dialog.getByRole('button', { name: 'Accepted', exact: true }).waitFor()
    assert.equal(state.writes.length, 1)
    assert.deepEqual(state.writes[0], { path: '/exchanges/public-target/ticket-interest', payload: { offeredTicketId: 'ticket-c' } })
    assert.equal(await dialog.getByRole('button', { name: 'Reject match', exact: true }).isDisabled(), true)
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('Direct eligibility indicator blocks invitation; recipient can reject invitation without offering a ticket', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    state.recipientEligible = false
    await page.goto(`${base}/community?tab=exchange&view=create&ticket=ticket-a`)
    const dialog = page.getByRole('dialog')
    await dialog.locator('button[aria-haspopup="listbox"]').first().click()
    await dialog.getByRole('option', { name: 'Direct', exact: true }).click()
    const recipient = dialog.getByRole('combobox', { name: 'Recipient customer username' })
    await recipient.fill('bo')
    await dialog.getByRole('option', { name: 'BobFan', exact: true }).click()
    await dialog.getByText('This user has no eligible tickets for this event.', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Create request', exact: true }).isDisabled(), true)
    state.recipientEligible = true
    await recipient.fill('bobb')
    await dialog.getByRole('option', { name: 'Bobby', exact: true }).click()
    await dialog.getByText('This user has an eligible ticket for this event.', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Create request', exact: true }).isEnabled(), true)
    await page.keyboard.press('Escape')
    state.invitations = [listing]; state.eligibleTickets = []
    await page.goto(`${base}/community?tab=exchange&view=invitations`)
    await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
    await dialog.getByText("You don't have any eligible tickets for this exchange.", { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Reject invitation', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Go Back', exact: true }).click()
    assert.deepEqual(state.writes, [])
    await page.getByRole('button', { name: 'Reject invitation', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm rejection', exact: true }).click()
    await page.getByText('Invitation rejected', { exact: true }).waitFor()
    assert.deepEqual(state.writes, [{ path: '/exchanges/public-target/reject-invitation' }])
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('equal completion redirects to received ticket; dashboard retains exchanged filter and history pagination', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    state.match = { ...initialMatch, bAccepted: true }
    state.ownedTickets = [received]
    state.activity = Array.from({ length: 23 }, (_, n) => ({ id: `event-${n}`, action: 'EXCHANGE_COMPLETED', createdAt: `2026-11-06T00:${String(n).padStart(2, '0')}:00Z`, eventName: 'Fixture concert', ownAction: true, matchId: 'match-a', requestId: null }))
    await page.goto(`${base}/community?tab=exchange&view=mine&match=match-a`)
    await page.getByRole('dialog').getByRole('button', { name: 'Accept match', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm acceptance', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/dashboard/customer' && url.searchParams.get('exchange') === 'completed')
    await page.getByText('Exchange completed. Your received tickets are now in My Tickets.', { exact: true }).waitFor()
    await page.getByText('Received fixture concert', { exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Exchange Ticket', exact: true }).count(), 0)
    await page.getByRole('button', { name: /^Exchanged/ }).click()
    await page.getByText('Received fixture concert', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Booking history', exact: true }).click()
    await page.getByText('Page 1 of 3', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByText('Page 2 of 3', { exact: true }).waitFor()
    assert.deepEqual(state.writes, [{ path: '/exchanges/matches/match-a/accept' }])
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('only payer sees Pay; declined, pending and cancelled payments do not complete; successful payment redirects', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    state.match = { ...initialMatch, status: 'READY', aAccepted: true, bAccepted: true, amountCents: 2500, isPayer: false, paymentStatus: 'PENDING', ticketB: { ...ticket, id: 'ticket-b', price: 125 } }
    state.ownedTickets = [received]
    await page.goto(`${base}/community?tab=exchange&view=mine&match=match-a`)
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Both users accepted.', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: /^Pay S\$/ }).count(), 0)
    state.match.isPayer = true
    await dialog.getByRole('button', { name: 'Refresh match', exact: true }).click()
    const pay = dialog.getByRole('button', { name: 'Pay S$25.00 difference', exact: true })
    await pay.waitFor()
    await pay.click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Go Back', exact: true }).click()
    assert.deepEqual(state.writes, [])
    for (const [method, status] of [['mock_fail', 'FAILED'], ['mock_pending', 'PENDING'], ['mock_cancel', 'CANCELLED']]) {
      await dialog.getByLabel('Simulated payment result').selectOption(method)
      await pay.click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm payment', exact: true }).click()
      await dialog.getByText(new RegExp(`Payment status: ${status}`)).waitFor()
      assert.equal(new URL(page.url()).pathname, '/community')
      assert.equal(state.match.status, 'READY')
    }
    await dialog.getByLabel('Simulated payment result').selectOption('mock_success')
    await pay.click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm payment', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/dashboard/customer')
    await page.getByText('Received fixture concert', { exact: true }).waitFor()
    assert.equal(state.writes.length, 4)
    assert.equal(state.writes.at(-1).payload.paymentMethod, 'mock_success')
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('proposal and payment notifications open the match; completion notifications open My Tickets', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    const activity = (id, action) => ({ id, action, createdAt: '2026-11-06T00:00:00Z', eventName: 'Fixture concert', ownAction: false, matchId: 'match-a', requestId: null })
    state.activity = [activity('proposal', 'EXCHANGE_PENDING')]
    state.ownedTickets = [received]
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    const bell = page.getByRole('button', { name: /Exchange notifications, / })
    const panel = page.getByRole('region', { name: 'Exchange notifications', exact: true })
    const dialog = page.getByRole('dialog')
    await bell.click()
    await panel.getByRole('link', { name: /Exchange proposal received/ }).click()
    await dialog.getByRole('button', { name: 'Accept match', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Close exchange details', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.waitForURL(url => !url.searchParams.has('match'))
    state.activity = [activity('payment', 'EXCHANGE_PAYMENT_REQUIRED')]
    await page.evaluate(() => window.dispatchEvent(new Event('eventease:exchange-activity-changed')))
    await bell.click()
    await panel.getByRole('link', { name: /price difference payment is required/ }).click()
    await dialog.getByRole('button', { name: 'Accept match', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Close exchange details', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.waitForURL(url => !url.searchParams.has('match'))
    state.activity = [activity('completion', 'EXCHANGE_COMPLETED')]
    await page.evaluate(() => window.dispatchEvent(new Event('eventease:exchange-activity-changed')))
    await bell.click()
    await panel.getByRole('link', { name: /Exchange completed/ }).click()
    await page.waitForURL(url => url.pathname === '/dashboard/customer' && url.searchParams.get('exchange') === 'completed')
    await page.getByText('Received fixture concert', { exact: true }).waitFor()
    assert.deepEqual(state.writes, [])
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})
