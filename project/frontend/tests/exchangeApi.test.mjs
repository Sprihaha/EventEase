// Contract fixtures exist only in this isolated test VM. The application has no fallback data.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SourceTextModule, createContext } from "node:vm"
import test from "node:test"
import ts from "typescript"

const sourceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib",
)
const expiresAt = "2099-01-01T00:00:00Z"
const ticket = {
  id: "contract-ticket",
  eventId: "contract-event",
  eventName: "Contract event",
  categoryType: "Contract category",
  seatSection: "Contract section",
}
const eligible = { ...ticket, status: "VALID", eligible: true }
const request = {
  id: "contract-request",
  requesterUserId: "contract-user",
  offeredTicketId: ticket.id,
  eventId: ticket.eventId,
  eventName: ticket.eventName,
  offeredCategoryType: ticket.categoryType,
  offeredSeatSection: ticket.seatSection,
  desiredCategoryType: null,
  desiredSeatSection: null,
  allowCrossTier: false,
  requestType: "PUBLIC",
  status: "OPEN",
  expiresAt,
  createdAt: "2026-10-20T00:00:00Z",
}
const listing = {
  requestId: request.id,
  eventId: ticket.eventId,
  eventName: ticket.eventName,
  offeredTicketId: ticket.id,
  offeredCategoryType: ticket.categoryType,
  offeredSeatSection: ticket.seatSection,
  desiredCategoryType: null,
  desiredSeatSection: null,
  allowCrossTier: false,
  expiresAt,
}
const match = {
  id: "contract-match",
  requestAId: request.id,
  requestBId: "contract-other-request",
  ticketA: ticket,
  ticketB: { ...ticket, id: "contract-other-ticket" },
  aAccepted: false,
  bAccepted: false,
  status: "PENDING",
  expiresAt,
}
const payload = {
  offeredTicketId: ticket.id,
  desiredCategoryType: null,
  desiredSeatSection: null,
  allowCrossTier: false,
  requestType: "PUBLIC",
}
const plain = (value) => JSON.parse(JSON.stringify(value))
function snake(value) {
  if (Array.isArray(value)) return value.map(snake)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        snake(item),
      ]),
    )
  return value
}
async function harness() {
  const calls = []
  let response
  const context = createContext({
    Headers,
    FormData,
    AbortController,
    sessionStorage: { getItem: () => "contract-token" },
    fetch: async (url, init) => {
      calls.push({ url, ...init })
      if (response instanceof Error) throw response
      return response
    },
  })
  const modules = new Map()
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    const source = await readFile(path, "utf8")
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    const module = new SourceTextModule(output, {
      context,
      identifier: path,
      initializeImportMeta(meta) {
        meta.env = { VITE_API_BASE_URL: "https://contract.invalid/" }
      },
    })
    modules.set(path, module)
    await module.link((specifier, parent) =>
      load(resolve(dirname(parent.identifier), `${specifier}.ts`)),
    )
    return module
  }
  const module = await load(resolve(sourceRoot, "exchangeApi.ts"))
  await module.evaluate()
  return {
    api: module.namespace,
    calls,
    respond(body, status = 200) {
      response = new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    },
    fail(error) {
      response = error
    },
    raw(body) {
      response = new Response(body, {
        headers: { "Content-Type": "application/json" },
      })
    },
  }
}

test("all eleven endpoints use the shared backend URL, correct verbs, and private authentication", async () => {
  const h = await harness()
  const signal = new AbortController().signal
  const checks = [
    [
      "getEligibleExchangeTickets",
      [signal],
      [eligible],
      "/eligible-tickets",
      "GET",
    ],
    ["getExchangeListings", [signal], [listing], "/listings", "GET"],
    ["createExchangeRequest", [payload], request, "", "POST"],
    [
      "getMyExchanges",
      [signal],
      { requests: [request], matches: [match] },
      "/mine",
      "GET",
    ],
    [
      "getCompatibleMatches",
      ["request /id", signal],
      [listing],
      "/request%20%2Fid/matches",
      "GET",
    ],
    [
      "expressInterest",
      ["request /id", "target"],
      match,
      "/request%20%2Fid/interest",
      "POST",
    ],
    [
      "getExchangeMatch",
      ["match /id", signal],
      match,
      "/matches/match%20%2Fid",
      "GET",
    ],
    [
      "acceptExchangeMatch",
      [match.id],
      { ...match, aAccepted: true },
      `/matches/${match.id}/accept`,
      "POST",
    ],
    [
      "rejectExchangeMatch",
      [match.id],
      { ...match, status: "REJECTED" },
      `/matches/${match.id}/reject`,
      "POST",
    ],
    [
      "cancelExchangeMatch",
      [match.id],
      { ...match, status: "CANCELLED" },
      `/matches/${match.id}/cancel`,
      "POST",
    ],
    [
      "cancelExchangeRequest",
      [request.id],
      { ...request, status: "CANCELLED" },
      `/${request.id}/cancel`,
      "POST",
    ],
  ]
  for (const [name, args, body, path, method] of checks) {
    h.respond(body)
    assert.deepEqual(plain(await h.api[name](...args)), body, name)
    const call = h.calls.at(-1)
    assert.equal(
      call.url,
      `https://contract.invalid/api/v1/exchanges${path}`,
      name,
    )
    assert.equal(call.method ?? "GET", method, name)
    assert.equal(
      call.headers.get("Authorization"),
      name === "getExchangeListings" ? null : "Bearer contract-token",
      name,
    )
    if (method === "GET") assert.equal(call.signal, signal, name)
    if (method === "POST" && call.body)
      assert.equal(call.headers.get("Content-Type"), "application/json", name)
  }
})

test("snake_case mapping covers requests, nullable preferences, tickets, listings, and nested matches", async () => {
  const h = await harness()
  const ready = { ...match, status: "READY", aAccepted: true, bAccepted: true }
  h.respond(snake({ requests: [request], matches: [ready] }))
  assert.deepEqual(plain(await h.api.getMyExchanges()), {
    requests: [request],
    matches: [ready],
  })
  h.respond(snake([eligible]))
  assert.deepEqual(plain(await h.api.getEligibleExchangeTickets()), [eligible])
  h.respond(snake([{ ...listing, requesterDisplayName: "Contract name" }]))
  assert.deepEqual(plain(await h.api.getExchangeListings()), [
    { ...listing, requesterDisplayName: "Contract name" },
  ])
})

test("create and interest payloads contain only the intended inputs", async () => {
  const h = await harness()
  h.respond(request)
  await h.api.createExchangeRequest({
    ...payload,
    ownerId: "must-not-send",
    status: "COMPLETED",
    price: 999,
    qr: "must-not-send",
    aAccepted: true,
  })
  assert.deepEqual(JSON.parse(h.calls.at(-1).body), payload)
  h.respond(match)
  await h.api.expressInterest(request.id, "target-request")
  assert.deepEqual(JSON.parse(h.calls.at(-1).body), {
    targetRequestId: "target-request",
  })
})

test("settlement uses the authenticated backend and requires a complete confirmed match response", async () => {
  const h = await harness()
  const completed = {
    ...match,
    status: "COMPLETED",
    aAccepted: true,
    bAccepted: true,
  }
  h.respond(completed)
  assert.deepEqual(
    plain(await h.api.settleExchangeMatch(match.id, true)),
    completed,
  )
  const call = h.calls.at(-1)
  assert.equal(
    call.url,
    `https://contract.invalid/api/v1/exchanges/matches/${match.id}/settle`,
  )
  assert.equal(call.headers.get("Authorization"), "Bearer contract-token")
  assert.deepEqual(JSON.parse(call.body), { paymentMethod: "mock_fail" })
  h.respond(undefined, 204)
  await assert.rejects(h.api.settleExchangeMatch(match.id))
})

test("no successful fallback on HTTP errors, transport failure, 204, or invalid JSON", async () => {
  const h = await harness()
  for (const status of [401, 403, 404, 409, 422, 500, 503]) {
    h.respond({ detail: "Contract failure" }, status)
    await assert.rejects(
      h.api.getExchangeListings(),
      (error) => error.status === status,
    )
    h.respond({ detail: "Contract failure" }, status)
    await assert.rejects(
      h.api.acceptExchangeMatch(match.id),
      (error) => error.status === status,
    )
  }
  h.fail(new TypeError("Network unavailable"))
  await assert.rejects(
    h.api.createExchangeRequest(payload),
    /Network unavailable/,
  )
  h.respond(null, 204)
  await assert.rejects(h.api.cancelExchangeMatch(match.id), {
    name: "ExchangeContractError",
  })
  h.raw("invalid-json")
  await assert.rejects(h.api.getExchangeListings())
  h.respond(null)
  await assert.rejects(h.api.getMyExchanges(), {
    name: "ExchangeContractError",
  })
})

test("malformed records and inconsistent READY never become confirmed exchange state", async () => {
  const h = await harness()
  for (const invalid of [
    { ...match, status: "READY" },
    { ...match, aAccepted: "true" },
    { ...match, status: "UNKNOWN" },
    { ...match, expiresAt: "not-a-date" },
    { ...match, expiresAt: "2026-10-20T10:00:00" },
    { ...match, ticketA: null },
  ]) {
    h.respond(invalid)
    await assert.rejects(h.api.acceptExchangeMatch(match.id), {
      name: "ExchangeContractError",
    })
  }
  h.respond({ items: [listing] })
  await assert.rejects(h.api.getExchangeListings(), {
    name: "ExchangeContractError",
  })
  const { desiredCategoryType, ...missingPreference } = request
  h.respond(missingPreference)
  await assert.rejects(h.api.createExchangeRequest(payload), {
    name: "ExchangeContractError",
  })
  h.respond([{ ...eligible, eligible: "yes" }])
  await assert.rejects(h.api.getEligibleExchangeTickets(), {
    name: "ExchangeContractError",
  })
})

test("direct invitations use authentication and creation sends only a recipient username", async () => {
  const h = await harness()
  h.respond([listing])
  assert.deepEqual(plain(await h.api.getExchangeInvitations()), [listing])
  assert.equal(
    h.calls.at(-1).url,
    "https://contract.invalid/api/v1/exchanges/invitations",
  )
  assert.equal(
    h.calls.at(-1).headers.get("Authorization"),
    "Bearer contract-token",
  )
  h.respond({ ...request, requestType: "DIRECT" })
  await h.api.createExchangeRequest({
    ...payload,
    requestType: "DIRECT",
    recipientUsername: "recipient",
    recipientUserId: "must-not-send",
  })
  assert.deepEqual(JSON.parse(h.calls.at(-1).body), {
    ...payload,
    requestType: "DIRECT",
    recipientUsername: "recipient",
  })
})

test("public interest loads private compatible tickets and submits a ticket directly without a source request", async () => {
  const h = await harness()
  const signal = new AbortController().signal
  h.respond([eligible])
  assert.deepEqual(plain(await h.api.getListingEligibleTickets("public /request", signal)), [eligible])
  let call = h.calls.at(-1)
  assert.equal(call.url, "https://contract.invalid/api/v1/exchanges/public%20%2Frequest/eligible-tickets")
  assert.equal(call.headers.get("Authorization"), "Bearer contract-token")
  assert.equal(call.signal, signal)
  h.respond(match)
  assert.deepEqual(plain(await h.api.expressTicketInterest("public /request", ticket.id)), match)
  call = h.calls.at(-1)
  assert.equal(call.url, "https://contract.invalid/api/v1/exchanges/public%20%2Frequest/ticket-interest")
  assert.equal(call.method, "POST")
  assert.equal(call.headers.get("Authorization"), "Bearer contract-token")
  assert.deepEqual(JSON.parse(call.body), { offeredTicketId: ticket.id })
  for (const status of [401, 403, 404, 409, 422, 500]) {
    h.respond({ detail: "Rejected" }, status)
    await assert.rejects(h.api.expressTicketInterest(request.id, ticket.id), error => error.status === status)
  }
  h.respond([{ ...eligible, eligible: "true" }])
  await assert.rejects(h.api.getListingEligibleTickets(request.id), { name: "ExchangeContractError" })
})

test('event option and activity endpoints are authenticated and validate their contracts', async () => {
  const h = await harness()
  const options = [{ id: 'category-id', type: 'STANDARD', name: 'Actual category', sections: ['Actual section'] }]
  h.respond(options)
  assert.deepEqual(plain(await h.api.getExchangeOptions('owned-ticket')), options)
  assert.match(h.calls.at(-1).url, /exchanges\/eligible-tickets\/owned-ticket\/options$/)
  assert.equal(h.calls.at(-1).headers.get('Authorization'), 'Bearer contract-token')
  h.respond([{ ...options[0], sections: [42] }])
  await assert.rejects(h.api.getExchangeOptions('owned-ticket'), /invalid response/)
  const item = { id: 'activity-id', action: 'EXCHANGE_READY', createdAt: expiresAt,
    eventName: 'Actual event', ownAction: false, matchId: 'match-id', requestId: null }
  h.respond([item])
  assert.deepEqual(plain(await h.api.getExchangeActivity()), [item])
  assert.match(h.calls.at(-1).url, /exchanges\/activity$/)
  assert.equal(h.calls.at(-1).headers.get('Authorization'), 'Bearer contract-token')
  h.respond([{ ...item, ownAction: 'false' }])
  await assert.rejects(h.api.getExchangeActivity(), /invalid response/)
})

test('stable desired category IDs and completion timestamps survive API mapping', async () => {
  const h = await harness()
  h.respond({ ...request, desiredCategoryId: 'actual-category' })
  const result = await h.api.createExchangeRequest({ ...payload, desiredCategoryId: 'actual-category' })
  assert.equal(JSON.parse(h.calls.at(-1).body).desiredCategoryId, 'actual-category')
  assert.equal(result.desiredCategoryId, 'actual-category')
  h.respond({ ...match, status: 'COMPLETED', aAccepted: true, bAccepted: true, updatedAt: expiresAt })
  assert.equal((await h.api.getExchangeMatch(match.id)).updatedAt, expiresAt)
})
