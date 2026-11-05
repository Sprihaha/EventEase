// Offline checks: no API or database modules are loaded.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
const source = await readFile(new URL('../src/lib/exchangePresentation.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
const p = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const history = [
  { id: 'old', createdAt: '2026-10-01T00:00:00Z', status: 'CANCELLED' },
  { id: 'tie-b', createdAt: '2026-10-02T00:00:00Z', status: 'MATCHED' },
  { id: 'tie-a', createdAt: '2026-10-02T00:00:00Z', status: 'OPEN' },
]
test('numbers survive reordered responses, status changes, refresh and new requests', () => {
  const original = p.requestNumbers(history)
  assert.deepEqual([...original], [['old', 1], ['tie-a', 2], ['tie-b', 3]])
  assert.deepEqual(p.requestNumbers([...history].reverse()), original)
  assert.deepEqual(p.requestNumbers(history.map(r => ({ ...r, status: 'COMPLETED' }))), original)
  const appended = p.requestNumbers([{ id: 'new', createdAt: '2026-11-01T00:00:00Z' }, ...history])
  for (const [id, number] of original) assert.equal(appended.get(id), number)
  assert.equal(appended.get('new'), 4)
  assert.equal(original.get(history.filter(r => r.status === 'MATCHED')[0].id), 3)
  assert.deepEqual(history.map(r => r.id), ['old', 'tie-b', 'tie-a'])
})
test('five display statuses use the requested labels and colours; READY means Matched', () => {
  assert.deepEqual(Object.values(p.exchangeStatusLabels), ['Open', 'Matched', 'Completed', 'Cancelled', 'Expired'])
  for (const [status, colour] of Object.entries({ OPEN: 'pink', MATCHED: 'amber', COMPLETED: 'emerald', CANCELLED: 'red', EXPIRED: 'purple' }))
    assert.match(p.exchangeStatusClasses[status], new RegExp(`bg-${colour}-50`))
  assert.equal(p.matchDisplayStatus('PENDING'), 'MATCHED')
  assert.equal(p.matchDisplayStatus('READY'), 'MATCHED')
  assert.equal(p.matchDisplayStatus('REJECTED'), 'CANCELLED')
  for (const status of ['COMPLETED', 'CANCELLED', 'EXPIRED']) assert.equal(p.matchDisplayStatus(status), status)
})
