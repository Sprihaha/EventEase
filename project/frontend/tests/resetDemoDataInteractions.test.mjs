import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
let TestRenderer
try { ({ default: TestRenderer } = await import(process.env.EVENTEASE_TEST_RENDERER_PATH ?? 'react-test-renderer')) }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error }
const rendererOptions = { skip: !TestRenderer && 'Matching react-test-renderer is optional; set EVENTEASE_TEST_RENDERER_PATH to run interactions.' }
import { admin, localTarget, resetHarness } from './resetDemoDataHarness.mjs'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const button = (root, text) => root.root.findAllByType('button').find(b => b.children.join('') === text)
const mount = async h => { let root; await act(async () => { root = TestRenderer.create(React.createElement(h.Component)) }); return root }
const open = async root => act(async () => { button(root, 'Reset Demo Data…').props.onClick() })
const fill = async (root, acknowledged = true) => act(async () => {
  const inputs = root.root.findAllByType('input')
  for (const [index, value] of [[0, 'DELETE ALL APPLICATION DATA'], [1, admin.name], [2, 'test-only']]) inputs[index].props.onChange({ target: { value } })
  inputs[3].props.onChange({ target: { checked: acknowledged } })
})
const submit = async root => act(async () => { root.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
const blank = root => {
  const inputs = root.root.findAllByType('input')
  assert.deepEqual(inputs.slice(0, 3).map(input => input.props.value), ['', '', ''])
  assert.equal(inputs[3].props.checked, false)
}

test('real reset component interactions: acknowledgement, masking, failed/cancelled/successful clearing', rendererOptions, async () => {
  const h = await resetHarness(); const root = await mount(h)
  await open(root)
  assert.match(JSON.stringify(root.toJSON()), /127\.0\.0\.1:5433|127\.0\.0\.1/)
  assert.match(JSON.stringify(root.toJSON()), /fixture/)
  assert.equal(root.root.findAllByType('input')[2].props.type, 'password')
  await fill(root, false)
  assert.equal(button(root, 'Permanently delete application data').props.disabled, true)
  await submit(root)
  assert.equal(h.calls.filter(c => c.kind === 'reset').length, 0)
  await fill(root)
  h.fail(new Error('mock reset refused'))
  await submit(root)
  assert.equal(h.calls.filter(c => c.kind === 'reset').length, 1)
  blank(root)
  assert.match(JSON.stringify(root.toJSON()), /Reset failed\. No success was confirmed/)
  await fill(root)
  await act(async () => { button(root, 'Cancel').props.onClick() })
  assert.equal(root.root.findAllByType('form').length, 0)
  await open(root); blank(root)
  await fill(root); h.fail(null); await submit(root)
  assert.equal(root.root.findAllByType('input').length, 0)
  assert.match(JSON.stringify(root.toJSON()), /Application data cleared/)
  await act(async () => root.unmount())
})

test('real reset component clears on identity change/signout and blocks unverified/disabled production targets', rendererOptions, async () => {
  const h = await resetHarness(); const root = await mount(h)
  await open(root); await fill(root)
  h.setUser({ ...admin, id: 'other-admin', name: 'otheradmin' })
  await act(async () => root.update(React.createElement(h.Component)))
  assert.equal(root.root.findAllByType('input').length, 0)
  h.setUser({ ...admin, role: 'customer' })
  await act(async () => root.update(React.createElement(h.Component)))
  assert.equal(root.toJSON(), null)
  h.setUser(admin); h.setTarget({ ...localTarget, environment: 'production', requiresProductionOverride: true, enabled: false })
  await act(async () => root.update(React.createElement(h.Component)))
  await open(root)
  assert.match(JSON.stringify(root.toJSON()), /production/)
  assert.match(JSON.stringify(root.toJSON()), /WARNING:/)
  assert.equal(button(root, 'Permanently delete application data').props.disabled, true)
  assert.equal(h.calls.filter(c => c.kind === 'reset').length, 0)
  await act(async () => root.unmount())
})
