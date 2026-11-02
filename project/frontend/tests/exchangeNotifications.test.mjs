import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/exchangeNotifications.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const event = (id, action, extra = {}) => ({ id, action, createdAt: '2026-11-02T12:00:00Z', eventName: 'Fixture event', ownAction: false, matchId: 'match-1', requestId: null, ...extra });

test('only relevant participant events appear; own routine actions are quiet', () => {
  const input = [event('invite', 'EXCHANGE_OPEN', { matchId: null }), event('own', 'EXCHANGE_OPEN', { ownAction: true }), event('accept', 'EXCHANGE_ACCEPTED', { ownAction: true }), event('done', 'EXCHANGE_COMPLETED', { ownAction: true }), event('unknown', 'OTHER_ACTION')];
  assert.deepEqual(api.exchangeNotifications(input).map(item => item.id).sort(), ['done', 'invite']);
});

test('duplicate proposal events become one notification and different matches stay separate', () => {
  const items = api.exchangeNotifications([event('a', 'EXCHANGE_MATCHED'), event('b', 'EXCHANGE_PENDING'), event('c', 'EXCHANGE_PENDING', { matchId: 'match-2' })]);
  assert.equal(items.length, 2);
  assert.equal(new Set(items.map(item => item.matchId)).size, 2);
});

test('both-accepted guidance replaces redundant acceptance alerts', () => {
  assert.deepEqual(api.exchangeNotifications([event('a', 'EXCHANGE_ACCEPTED'), event('b', 'EXCHANGE_READY')]).map(item => item.action), ['EXCHANGE_READY']);
  assert.equal(api.exchangeNotifications([event('a', 'EXCHANGE_ACCEPTED', { matchId: 'match-2' }), event('b', 'EXCHANGE_READY')]).length, 2);
});

test('deep links distinguish invitations, own request updates, and matches', () => {
  assert.equal(api.notificationLink(event('a', 'EXCHANGE_OPEN', { matchId: null })), '/community?tab=exchange&view=invitations');
  assert.equal(api.notificationLink(event('b', 'EXCHANGE_CANCELLED', { matchId: null })), '/community?tab=exchange&view=mine');
  assert.equal(api.notificationLink(event('c', 'EXCHANGE_READY', { matchId: 'match&1' })), '/community?tab=exchange&view=mine&match=match%261');
});

test('read storage rejects malformed input, removes duplicates, and bounds history', () => {
  assert.deepEqual(api.parseReadNotifications('{broken'), []);
  assert.deepEqual(api.parseReadNotifications('{}'), []);
  assert.deepEqual(api.parseReadNotifications('["a",null,42,"a","b"]'), ['a', 'b']);
  assert.equal(api.parseReadNotifications(JSON.stringify(Array.from({ length: 700 }, (_, i) => String(i)))).length, 500);
});

test('read storage keys isolate accounts', () => {
  assert.notEqual(api.notificationReadKey('user-a'), api.notificationReadKey('user-b'));
});
