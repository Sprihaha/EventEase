import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, ticket, initialMatch } from './exchangeBrowserFixtures.mjs'
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18446'
test('Direct autocomplete requires selection, handles unavailable/empty lookup, and preserves Public creation', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    await page.getByRole('button', { name: 'Request EaseXchange', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const submit = dialog.getByRole('button', { name: 'Create request', exact: true })
    await dialog.locator('button[aria-haspopup="listbox"]').nth(1).click()
    await dialog.getByRole('option', { name: /Fixture concert/ }).click()
    await page.waitForFunction(() => !document.querySelector('dialog')?.textContent.includes('Loading event categories'))
    await dialog.locator('button[aria-haspopup="listbox"]').first().click()
    await dialog.getByRole('option', { name: 'Direct', exact: true }).click()
    const input = dialog.getByRole('combobox', { name: 'Recipient customer username' })
    await input.fill('b')
    await dialog.getByText('Type at least 2 characters, then select a customer username.', { exact: true }).waitFor()
    assert.deepEqual(state.lookups, [])
    assert.equal(await submit.isDisabled(), true)
    await input.fill('missing')
    await dialog.getByText('User not found', { exact: true }).waitFor()
    assert.equal(await submit.isDisabled(), true)
    state.lookupFailure = true
    await input.fill('bo')
    await dialog.getByRole('button', { name: 'Retry username search' }).waitFor()
    assert.equal(await dialog.getByText('User not found', { exact: true }).count(), 0)
    assert.equal(await submit.isDisabled(), true)
    state.lookupFailure = false
    await dialog.getByRole('button', { name: 'Retry username search' }).click()
    await input.focus()
    await dialog.getByRole('option', { name: 'BobFan', exact: true }).waitFor()
    await input.press('ArrowDown')
    await input.press('Enter')
    assert.equal(await input.inputValue(), 'BobFan')
    await dialog.getByText('This user has an eligible ticket for this event.', { exact: true }).waitFor()
    assert.equal(await submit.isEnabled(), true)
    // Editing a selected username immediately invalidates submission.
    await input.fill('BobFanx')
    assert.equal(await submit.isDisabled(), true)
    await input.fill('BO')
    await dialog.getByRole('option', { name: 'BobFan', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await submit.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(state.writes.length, 1)
    assert.equal(state.writes[0].payload.recipientUsername, 'BobFan')
    await page.getByRole('button', { name: 'Request EaseXchange', exact: true }).click()
    await dialog.locator('button[aria-haspopup="listbox"]').nth(1).click()
    await dialog.getByRole('option', { name: /Fixture concert/ }).click()
    await submit.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(state.writes[1].payload.requestType, 'PUBLIC')
    assert.equal('recipientUsername' in state.writes[1].payload, false)
    assert.deepEqual(state.forbidden, [])
    assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('expired Public listings and Direct invitations show actual expiry and cannot be acted on', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    const expired = { requestId: 'expired', eventId: ticket.eventId, eventName: ticket.eventName,
      offeredTicketId: 'expired-ticket', offeredCategoryType: 'STANDARD', offeredSeatSection: 'Floor',
      desiredCategoryType: null, desiredSeatSection: null, allowCrossTier: false, expiresAt: '2000-01-01T00:00:00Z' }
    state.listings = [expired]; state.invitations = [expired]
    await page.goto(`${base}/community?tab=exchange&view=listings`)
    const section = page.getByRole('region', { name: 'EaseXchange', exact: true })
    const blocked = section.getByRole('button', { name: 'Expiry time passed', exact: true })
    await blocked.waitFor()
    assert.equal(await blocked.isDisabled(), true)
    assert.equal(await section.locator('time').getAttribute('datetime'), expired.expiresAt)
    await section.getByRole('button', { name: 'Direct invitations', exact: true }).click()
    const invitation = section.getByRole('button', { name: 'Invitation expired', exact: true })
    await invitation.waitFor()
    assert.equal(await invitation.isDisabled(), true)
    assert.equal(await section.locator('time').getAttribute('datetime'), expired.expiresAt)
    assert.deepEqual(state.writes, [])
    assert.deepEqual(state.forbidden, [])
  } finally { await close() }
})

test('acceptance needs confirmation, cannot be withdrawn, and never triggers settlement', { timeout: 30_000 }, async () => {
  const { page, state, close } = await fixture()
  try {
    await page.goto(`${base}/community?tab=exchange&view=mine&match=match-a`)
    const dialog = page.getByRole('dialog')
    const accept = dialog.getByRole('button', { name: 'Accept match', exact: true })
    await accept.waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Cancel match', exact: true }).count(), 0)
    page.once('dialog', popup => { assert.match(popup.message(), /acceptance cannot be withdrawn/); void popup.dismiss() })
    await accept.click()
    assert.equal(state.writes.length, 0)
    page.once('dialog', popup => { void popup.accept() })
    await accept.click()
    const accepted = dialog.getByRole('button', { name: 'Accepted', exact: true })
    await accepted.waitFor()
    assert.equal(await accepted.isDisabled(), true)
    assert.equal(await dialog.getByRole('button', { name: 'Reject match', exact: true }).isDisabled(), true)
    assert.deepEqual(state.writes, [{ path: '/exchanges/matches/match-a/accept' }])
    state.match = { ...state.match, bAccepted: true, status: 'READY' }
    await dialog.getByRole('button', { name: 'Refresh match', exact: true }).click()
    await dialog.getByText('Both users accepted.', { exact: true }).waitFor()
    assert.match(await dialog.innerText(), /Awaiting exchange completion/)
    assert.equal(await dialog.getByRole('button', { name: /Cancel match|Complete equal-value swap|Complete simulated settlement|Apply 10% Off/ }).count(), 0)
    assert.equal(state.writes.length, 1)
    state.match = { ...initialMatch }
    await page.reload()
    await dialog.getByRole('button', { name: 'Reject match', exact: true }).click()
    await dialog.getByText('This match was rejected.', { exact: true }).waitFor()
    state.match = { ...initialMatch, expiresAt: '2000-01-01T00:00:00Z' }
    await page.reload()
    await accept.waitFor()
    assert.equal(await accept.isDisabled(), true)
    assert.equal(await dialog.getByRole('button', { name: 'Reject match', exact: true }).isDisabled(), true)
    assert.equal(state.writes.length, 2)
    assert.deepEqual(state.forbidden, [])
    assert.deepEqual(state.errors, [])
  } finally { await close() }
})
