// Run against an isolated local dev server with VITE_API_BASE_URL=http://127.0.0.1:18765.
// All API requests are intercepted; no remote services or application data are used.
import assert from 'node:assert/strict';
import test from 'node:test';
const { chromium } = await import(process.env.EVENTEASE_PLAYWRIGHT_PATH ?? 'playwright');
const base = process.env.EVENTEASE_BROWSER_URL ?? 'http://127.0.0.1:18444';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));

test('notifications: unread persistence, deep links, new-event toast, mobile, and account isolation', async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.EVENTEASE_CHROME_PATH ? { executablePath: process.env.EVENTEASE_CHROME_PATH } : {}) });
  const context = await browser.newContext();
  let account = 'fixture-a';
  let failed = false;
  const items = [{ id: 'invitation-1', action: 'EXCHANGE_OPEN', createdAt: '2026-11-02T12:00:00Z', eventName: 'Fixture concert', ownAction: false, matchId: null, requestId: 'request-1' }];
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem('eventease-access-token', `fixture.${btoa(JSON.stringify({ exp: 4070908800 }))}.signature`));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin !== 'http://127.0.0.1:18765' || !url.pathname.startsWith('/api/v1/')) return route.abort();
    const path = url.pathname.slice('/api/v1'.length);
    let body = [];
    if (path === '/auth/me') body = { id: account, username: account, role: 'CUSTOMER', email: null, mustChangePassword: false, passwordChangeable: true };
    else if (path === '/events' || path === '/me/bookings') body = { items: [], totalPages: 1, total: 0 };
    else if (path === '/exchanges/mine') body = { requests: [], matches: [] };
    else if (path === '/exchanges/activity') {
      if (failed) return route.fulfill({ status: 503, json: { error: { message: 'Fixture failure' } }, headers: { 'Access-Control-Allow-Origin': base } });
      body = items;
    }
    await route.fulfill({ status: 200, json: body, headers: { 'Access-Control-Allow-Origin': base } });
  });
  try {
    await page.goto(`${base}/events`);
    const bell = () => page.getByRole('button', { name: /Exchange notifications, / });
    await page.getByRole('button', { name: 'Exchange notifications, 1 unread', exact: true }).waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'direct exchange invitation' }).count(), 0);
    await bell().click();
    const panel = page.getByRole('region', { name: 'Exchange notifications', exact: true });
    await panel.getByText('You received a direct exchange invitation', { exact: true }).waitFor();
    assert.match(await bell().getAttribute('aria-label'), /1 unread/);
    await panel.getByRole('link', { name: /You received a direct exchange invitation/ }).click();
    await page.waitForURL('**/community?tab=exchange&view=invitations');
    await page.getByRole('button', { name: 'Exchange notifications, 0 unread', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Exchange notifications, 0 unread', exact: true }).waitFor();
    items.unshift({ ...items[0], id: 'completion-1', action: 'EXCHANGE_COMPLETED', createdAt: '2026-11-02T13:00:00Z', matchId: 'match-1' });
    await page.evaluate(() => window.dispatchEvent(new Event('eventease:exchange-activity-changed')));
    await page.getByRole('status').filter({ hasText: 'Exchange completed' }).waitFor();
    await page.getByRole('button', { name: 'Exchange notifications, 1 unread', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await bell().click();
    await panel.getByRole('button', { name: 'Mark all as read' }).click();
    await page.getByRole('button', { name: 'Exchange notifications, 0 unread', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await panel.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.keyboard.press('Escape');
    assert.equal(await bell().getAttribute('aria-expanded'), 'false');
    account = 'fixture-b';
    await page.reload();
    await page.getByRole('button', { name: 'Exchange notifications, 2 unread', exact: true }).waitFor();
    account = 'fixture-a';
    await page.reload();
    await page.getByRole('button', { name: 'Exchange notifications, 0 unread', exact: true }).waitFor();
    failed = true;
    await page.reload();
    await bell().click();
    await panel.getByRole('button', { name: 'Retry notifications' }).waitFor();
    failed = false;
    await panel.getByRole('button', { name: 'Retry notifications' }).click();
    await panel.getByText('You received a direct exchange invitation', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'Retry notifications' }).count(), 0);
  } finally { await browser.close(); }
});
