import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixture, ticket, request, initialMatch } from './exchangeBrowserFixtures.mjs'
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18446'
const success = 'This user has an eligible ticket for this event.'
const ineligible = 'This user has no eligible tickets for this event.'
async function direct(page) {
  await page.goto(`${base}/community?tab=exchange&view=create&ticket=ticket-a`)
  const dialog = page.getByRole('dialog')
  await dialog.locator('button[aria-haspopup="listbox"]').first().click()
  await dialog.getByRole('option', { name: 'Direct', exact: true }).click()
  return { dialog, input: dialog.getByRole('combobox', { name: 'Recipient customer username' }), submit: dialog.getByRole('button', { name: 'Create request', exact: true }) }
}
function deferred() {
  let release
  const promise = new Promise(resolve => { release = resolve })
  return { promise, release }
}

test('typed exact case-insensitive username resolves without a click; partial and invalid names cannot submit', async () => {
  const { page, state, close } = await fixture()
  try {
    const { dialog, input, submit } = await direct(page)
    await input.fill('bo')
    await dialog.getByRole('option', { name: 'BobFan', exact: true }).waitFor()
    assert.equal(await submit.isDisabled(), true)
    assert.deepEqual(state.eligibilityLookups, [])
    await input.fill('missing')
    await dialog.getByText('User not found.', { exact: true }).waitFor()
    assert.equal(await submit.isDisabled(), true)
    assert.equal(await dialog.getByText(ineligible, { exact: true }).count(), 0)
    await input.fill('bObFaN')
    await dialog.getByText(success, { exact: true }).waitFor()
    assert.equal(await input.inputValue(), 'BobFan')
    assert.equal(await submit.isEnabled(), true)
    await submit.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(state.writes.length, 1)
    assert.equal(state.writes[0].payload.recipientUsername, 'BobFan')
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('Public request creation still submits without recipient lookup', async () => {
  const { page, state, close } = await fixture()
  try {
    await page.goto(`${base}/community?tab=exchange&view=create&ticket=ticket-a`)
    const dialog = page.getByRole('dialog')
    const submit = dialog.getByRole('button', { name: 'Create request', exact: true })
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('dialog button')].find(el => el.textContent === 'Create request')
      return button && !button.disabled
    })
    await submit.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(state.writes.length, 1)
    assert.equal(state.writes[0].payload.requestType, 'PUBLIC')
    assert.equal('recipientUsername' in state.writes[0].payload, false)
    assert.deepEqual(state.lookups, []); assert.deepEqual(state.eligibilityLookups, [])
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('recipient and offered ticket changes clear eligibility; confirmed ineligibility and API errors stay distinct', async () => {
  const { page, state, close } = await fixture()
  try {
    state.eligibleTickets = [ticket, { ...ticket, id: 'ticket-c', eventId: 'event-c', eventName: 'Other concert' }]
    const { dialog, input, submit } = await direct(page)
    await input.fill('BobFan')
    await dialog.getByText(success, { exact: true }).waitFor()
    state.recipientEligible = false
    await input.fill('Bobby')
    assert.equal(await submit.isDisabled(), true)
    assert.equal(await dialog.getByText(success, { exact: true }).count(), 0)
    await dialog.getByText(ineligible, { exact: true }).waitFor()
    assert.equal(await submit.isDisabled(), true)
    state.recipientEligible = true
    await dialog.locator('button[aria-haspopup="listbox"]').nth(1).click()
    await dialog.getByRole('option', { name: /Other concert/ }).click()
    await dialog.getByText(success, { exact: true }).waitFor()
    assert.equal(state.eligibilityLookups.at(-1).ticketId, 'ticket-c')
    state.eligibilityFailure = true
    await input.fill('Charlie')
    await dialog.getByRole('button', { name: 'Retry eligibility check', exact: true }).waitFor()
    assert.equal(await dialog.getByText(ineligible, { exact: true }).count(), 0)
    assert.equal(await submit.isDisabled(), true)
    state.eligibilityFailure = false
    await dialog.getByRole('button', { name: 'Retry eligibility check', exact: true }).click()
    await dialog.getByText(success, { exact: true }).waitFor()
    assert.equal(await submit.isEnabled(), true)
    assert.deepEqual(state.writes, []); assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('lookup failure can retry; delayed username and eligibility responses cannot validate previous input', async () => {
  const { page, state, close } = await fixture()
  const oldLookup = deferred(), oldEligibility = deferred()
  try {
    const { dialog, input, submit } = await direct(page)
    state.lookupFailure = true
    await input.fill('BobFan')
    await dialog.getByRole('button', { name: 'Retry username search', exact: true }).waitFor()
    assert.equal(await submit.isDisabled(), true)
    assert.equal(await dialog.getByText(ineligible, { exact: true }).count(), 0)
    state.lookupFailure = false
    state.lookupGates.BobFan = oldLookup.promise
    const started = page.waitForRequest(r => r.url().includes('/recipients?q=BobFan'))
    await dialog.getByRole('button', { name: 'Retry username search', exact: true }).click()
    await started
    await input.fill('missing')
    await dialog.getByText('User not found.', { exact: true }).waitFor()
    oldLookup.release()
    // A subsequent completed lookup also gives the old response time to arrive.
    state.eligibilityGates.Bobby = oldEligibility.promise
    const eligibilityStarted = page.waitForRequest(r => r.url().includes('/recipients/eligibility') && r.url().includes('username=Bobby'))
    await input.fill('Bobby')
    await eligibilityStarted
    assert.equal(await input.inputValue(), 'Bobby')
    assert.equal(await submit.isDisabled(), true)
    state.recipientEligible = false
    await input.fill('Charlie')
    await dialog.getByText(ineligible, { exact: true }).waitFor()
    oldEligibility.release()
    await input.fill('missing-again')
    await dialog.getByText('User not found.', { exact: true }).waitFor()
    assert.equal(await input.inputValue(), 'missing-again')
    assert.equal(await submit.isDisabled(), true)
    assert.equal(await dialog.getByText(success, { exact: true }).count(), 0)
    assert.deepEqual(state.writes, []); assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { oldLookup.release(); oldEligibility.release(); await close() }
})

test('themed cancellation requires explicit confirmation; Go Back, Escape and close leave request unchanged', async () => {
  const { page, state, close } = await fixture()
  try {
    state.requests = [{ ...request, status: 'OPEN' }]
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    const cancel = page.getByRole('button', { name: 'Cancel request', exact: true })
    const confirmation = page.getByRole('alertdialog', { name: 'Cancel exchange request?' })
    for (const dismiss of ['Go Back', 'Escape', 'Close confirmation']) {
      await cancel.click()
      await confirmation.getByText(/cannot be undone/).waitFor()
      assert.equal(await confirmation.getByRole('button', { name: 'Go Back', exact: true }).evaluate(el => el === document.activeElement), true)
      await page.keyboard.press('Tab')
      assert.equal(await confirmation.getByRole('button', { name: 'Confirm cancellation', exact: true }).evaluate(el => el === document.activeElement), true)
      await page.keyboard.press('Tab')
      assert.equal(await confirmation.getByRole('button', { name: 'Close confirmation', exact: true }).evaluate(el => el === document.activeElement), true)
      if (dismiss === 'Escape') await page.keyboard.press('Escape')
      else await confirmation.getByRole('button', { name: dismiss, exact: true }).click()
      await confirmation.waitFor({ state: 'detached' })
      assert.equal(await cancel.evaluate(el => el === document.activeElement), true)
      assert.deepEqual(state.writes, [])
    }
    await cancel.click()
    await confirmation.getByRole('button', { name: 'Confirm cancellation', exact: true }).click()
    await page.getByText('Request 1 cancelled', { exact: true }).waitFor()
    assert.deepEqual(state.writes, [{ path: '/exchanges/request-a/cancel' }])
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})

test('username lookup timeout offers retry without reporting ticket ineligibility', async () => {
  const { page, state, close } = await fixture()
  const delayed = deferred()
  try {
    const { dialog, input, submit } = await direct(page)
    state.lookupGates.BobFan = delayed.promise
    await page.clock.install()
    const started = page.waitForRequest(r => r.url().includes('/recipients?q=BobFan'))
    await input.fill('BobFan')
    await page.clock.runFor(350)
    await started
    await dialog.getByText('Validating username…', { exact: true }).waitFor()
    await page.clock.runFor(10_001)
    await dialog.getByRole('button', { name: 'Retry username search', exact: true }).waitFor()
    assert.equal(await submit.isDisabled(), true)
    assert.equal(await dialog.getByText(ineligible, { exact: true }).count(), 0)
    delayed.release()
    assert.deepEqual(state.writes, []); assert.deepEqual(state.forbidden, [])
  } finally { delayed.release(); await close() }
})

test('match rejection can be dismissed; View Match and completed detail labels are concise', async () => {
  const { page, state, close } = await fixture()
  try {
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    await page.getByRole('button', { name: 'View Match', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Reject match', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Go Back', exact: true }).click()
    assert.deepEqual(state.writes, [])
    await dialog.getByRole('button', { name: 'Reject match', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm rejection', exact: true }).click()
    await dialog.getByText('This match was rejected.', { exact: true }).waitFor()
    assert.equal(state.writes.length, 1)
    state.match = { ...initialMatch, status: 'COMPLETED', aAccepted: true, bAccepted: true, paymentStatus: 'SUCCEEDED' }
    state.requests = [{ ...request, status: 'COMPLETED' }]
    await page.goto(`${base}/community?tab=exchange&view=mine`)
    await page.getByRole('button', { name: 'View Exchange Details', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'View Matched match', exact: true }).count(), 0)
    assert.deepEqual(state.forbidden, []); assert.deepEqual(state.errors, [])
  } finally { await close() }
})
