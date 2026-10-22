import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SourceTextModule, createContext } from "node:vm"
import test from "node:test"
import ts from "typescript"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../src/lib")
async function harness(
  env = {
    VITE_API_BASE_URL: "http://127.0.0.1:8001",
    VITE_LOCAL_SANDBOX: "true",
  },
) {
  const calls = []
  let responses = []
  const context = createContext({
    Headers,
    URL,
    sessionStorage: { getItem: () => "local-token" },
    fetch: async (url, init) => {
      calls.push({ url, ...init })
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    },
  })
  const modules = new Map()
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const output = ts.transpileModule(await readFile(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const m = new SourceTextModule(output, {
      context,
      identifier: path,
      initializeImportMeta(meta) {
        meta.env = env
      },
    })
    modules.set(path, m)
    await m.link((spec, parent) =>
      load(resolve(dirname(parent.identifier), `${spec}.ts`)),
    )
    return m
  }
  const m = await load(resolve(root, "ticketingApi.ts"))
  await m.evaluate()
  return {
    api: m.namespace,
    backend: modules.get(resolve(root, "backendApi.ts")).namespace,
    calls,
    respond(...items) {
      responses = items.map(
        ([body, status = 200]) =>
          new Response(JSON.stringify(body), { status }),
      )
    },
  }
}

test("demo reset client sends confirmation privately and preserves backend refusals (mock fetch only)", async () => {
  const h = await harness()
  const input = { confirmation: "DELETE ALL APPLICATION DATA", username: "admin", password: "test-only", acknowledged: true, targetId: "a".repeat(64) }
  h.respond([{ deleted: { events: 2 }, message: "cleared" }])
  const response = await h.backend.resetDemoData(input)
  assert.equal(response.deleted.events, 2)
  const call = h.calls[0]
  assert.equal(call.url, "http://127.0.0.1:8001/api/v1/admin/reset-demo-data")
  assert.equal(call.method, "POST")
  assert.equal(call.headers.get("Authorization"), "Bearer local-token")
  assert.deepEqual(JSON.parse(call.body), input)
  for (const status of [401, 403, 409, 500]) {
    h.respond([{ error: { message: "Reset refused" } }, status])
    await assert.rejects(h.backend.resetDemoData(input), /Reset refused/)
  }
})

test("reset target preview is authenticated and malformed target/results fail closed", async () => {
  const h = await harness()
  const target = { environment: "test", databaseHost: "127.0.0.1", databasePort: 5433,
    databaseName: "fixture", databaseSchema: "test_schema", requiresProductionOverride: false,
    enabled: false, targetId: "b".repeat(64) }
  h.respond([target])
  assert.deepEqual(JSON.parse(JSON.stringify(await h.backend.getDemoResetTarget())), target)
  assert.equal(h.calls[0].url, "http://127.0.0.1:8001/api/v1/admin/reset-demo-data/target")
  assert.equal(h.calls[0].headers.get("Authorization"), "Bearer local-token")
  h.respond([{ environment: "production" }])
  await assert.rejects(h.backend.getDemoResetTarget(), /could not be verified/)
  h.respond([{}])
  await assert.rejects(h.backend.resetDemoData({}), /not confirmed/)
})

test("seat holds submit only real seat/category IDs and quantities, with idempotency", async () => {
  const h = await harness()
  h.respond([{ id: "booking" }])
  await h.api.holdSeats(
    "event",
    [
      {
        id: "seat-1",
        ticketCategoryId: "category",
        priceCents: 1,
        label: "A1",
      },
      {
        id: "seat-2",
        ticketCategoryId: "category",
        priceCents: 999999,
        label: "A2",
      },
    ],
    "stable-key",
  )
  const call = h.calls[0]
  assert.equal(call.url, "http://127.0.0.1:8001/api/v1/bookings")
  assert.equal(call.headers.get("Authorization"), "Bearer local-token")
  assert.equal(call.headers.get("Idempotency-Key"), "stable-key")
  assert.deepEqual(JSON.parse(call.body), {
    eventId: "event",
    seatIds: ["seat-1", "seat-2"],
    items: [{ ticketCategoryId: "category", quantity: 2 }],
  })
})

test("booking history loads all pages and never fabricates bookings on failure", async () => {
  const h = await harness()
  h.respond([{ items: [{ id: "first" }], totalPages: 2 }], [
    { items: [{ id: "second" }], totalPages: 2 },
  ])
  assert.deepEqual(JSON.parse(JSON.stringify(await h.api.fetchBookings())), [
    { id: "first" },
    { id: "second" },
  ])
  h.respond([{ error: { message: "unavailable" } }, 503])
  await assert.rejects(h.api.fetchBookings(), /unavailable/)
})

test("payment failure and invalid verification remain errors; verification is read-only", async () => {
  const h = await harness()
  h.respond([{ error: { message: "declined" } }, 402])
  await assert.rejects(h.api.payBooking("booking", true), /declined/)
  assert.deepEqual(JSON.parse(h.calls[0].body), { paymentMethod: "mock_fail" })
  h.respond([{ error: { message: "not found" } }, 404])
  await assert.rejects(h.api.verifyTicket("old /code"), /not found/)
  assert.equal(
    h.calls[1].url,
    "http://127.0.0.1:8001/api/v1/tickets/old%20%2Fcode/verify",
  )
  assert.equal(h.calls[1].method, undefined)
})

test("local sandbox refuses a nonlocal API origin before making any request", async () => {
  await assert.rejects(
    harness({
      VITE_API_BASE_URL: "https://example.invalid",
      VITE_LOCAL_SANDBOX: "true",
    }),
    /nonlocal API/,
  )
})

test("persistent local development also refuses a nonlocal API origin", async () => {
  await assert.rejects(
    harness({
      VITE_API_BASE_URL: "https://example.invalid",
      VITE_LOCAL_ONLY: "true",
    }),
    /nonlocal API/,
  )
})

test("category-only events reserve quantities using backend category IDs and a stable key", async () => {
  const h = await harness()
  h.respond([{ id: "booking" }])
  await h.api.holdCategories(
    "event",
    [{ ticketCategoryId: "category", quantity: 2 }],
    "category-key",
  )
  const call = h.calls[0]
  assert.deepEqual(JSON.parse(call.body), {
    eventId: "event",
    items: [{ ticketCategoryId: "category", quantity: 2 }],
  })
  assert.equal(call.headers.get("Idempotency-Key"), "category-key")
})
