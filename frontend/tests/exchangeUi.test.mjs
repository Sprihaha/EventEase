// Render-only contract tests. These fixtures are not imported by the application.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SourceTextModule, SyntheticModule, createContext } from "node:vm"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router"
import ts from "typescript"

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src")
const user = { id: "contract-user", name: "Contract user", role: "customer" }
const ticket = {
  id: "contract-ticket",
  eventId: "contract-event",
  eventName: "Contract event",
  categoryType: "Contract category",
  seatSection: "Contract section",
}
const request = {
  id: "contract-request",
  requesterUserId: user.id,
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
  expiresAt: "2099-01-01T00:00:00Z",
  createdAt: "2026-10-20T00:00:00Z",
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
  expiresAt: request.expiresAt,
}
const success = (data) => ({ status: "success", data, error: null })
const failure = {
  status: "error",
  data: null,
  error: "Exchange service unavailable",
}
const noop = () => {}
async function harness() {
  let currentUser = user
  let resources = {}
  const context = createContext({
    Headers,
    AbortController,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
  })
  const modules = new Map()
  const pendingModules = new Map()
  function synthetic(id, exports) {
    const module = new SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports))
          this.setExport(key, value)
      },
      { context, identifier: id },
    )
    modules.set(id, module)
    return module
  }
  async function load(path) {
    if (pendingModules.has(path)) return pendingModules.get(path)
    const pending = loadUncached(path)
    pendingModules.set(path, pending)
    return pending
  }
  async function loadUncached(path) {
    if (modules.has(path)) return modules.get(path)
    if (path.endsWith("/lib/store.tsx"))
      return synthetic(path, { useStore: () => ({ user: currentUser }) })
    if (path.endsWith("/lib/useExchangeResource.ts"))
      return synthetic(path, {
        default: (key) => ({
          ...(key === null
            ? { status: "idle", data: null, error: null }
            : (resources[key] ?? {
                status: "loading",
                data: null,
                error: null,
              })),
          reload: noop,
        }),
      })
    if (!path.startsWith(sourceRoot))
      return synthetic(path, { ...(await import(path)) })
    const source = await readFile(path, "utf8")
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    const module = new SourceTextModule(output, {
      context,
      identifier: path,
      initializeImportMeta(meta) {
        meta.env = {}
      },
    })
    modules.set(path, module)
    await module.link(async (specifier, parent) => {
      if (!specifier.startsWith(".")) return load(specifier)
      const base = resolve(dirname(parent.identifier), specifier)
      try {
        await readFile(`${base}.tsx`)
        return load(`${base}.tsx`)
      } catch {
        return load(`${base}.ts`)
      }
    })
    return module
  }
  const secure = await load(
    resolve(sourceRoot, "components/SecureExchange.tsx"),
  )
  await secure.evaluate()
  const matchPanel = modules.get(
    resolve(sourceRoot, "components/ExchangeMatchPanel.tsx"),
  )
  return {
    renderInterest(states, account = user) {
      currentUser = account
      resources = states
      return renderToStaticMarkup(React.createElement(MemoryRouter, null,
        React.createElement(secure.namespace.TicketInterestPanel, {
          listing: { requestId: "public-target", eventId: ticket.eventId, eventName: ticket.eventName,
            offeredTicketId: "other-ticket", offeredCategoryType: ticket.categoryType,
            offeredSeatSection: ticket.seatSection, desiredCategoryType: null,
            desiredSeatSection: null, allowCrossTier: false, expiresAt: request.expiresAt },
          onCreated: noop, onChanged: noop,
        })))
    },
    render(view, states, account = user) {
      currentUser = account
      resources = states
      return renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [`/community?tab=exchange&view=${view}`] },
          React.createElement(secure.namespace.default),
        ),
      )
    },
    renderMatch(value, myRequests = [request]) {
      resources = { [match.id]: success(value) }
      return renderToStaticMarkup(
        React.createElement(matchPanel.namespace.default, {
          matchId: match.id,
          myRequests,
          userId: user.id,
          onChanged: noop,
        }),
      )
    },
  }
}
const disabledButtons = (html) =>
  [...html.matchAll(/<button[^>]*disabled=""[^>]*>(.*?)<\/button>/gs)].map(
    (item) => item[1],
  )

test("listings render loading, empty, and unavailable states without demo sellers", async () => {
  const h = await harness()
  assert.match(h.render("listings", {}, null), /Loading exchange data/)
  assert.match(
    h.render("listings", { listings: success([]) }, null),
    /No public exchange listings available/,
  )
  const unavailable = h.render("listings", { listings: failure }, null)
  assert.match(unavailable, /Exchange service unavailable/)
  assert.match(unavailable, /Retry/)
  assert.doesNotMatch(
    unavailable,
    /Mei L\.|Ravi K\.|askPrice|Verified transfer/,
  )
})

test("private views require sign-in and unavailable eligible tickets disable creation", async () => {
  const h = await harness()
  assert.match(h.render("mine", {}, null), /Sign in to use EaseXchange/)
  assert.match(h.render("create", {}, null), /Sign in to use EaseXchange/)
  const unavailable = h.render("create", { "eligible-tickets": failure })
  assert.match(unavailable, /Exchange service unavailable/)
  assert.match(unavailable, /<fieldset disabled=""/)
  assert.ok(disabledButtons(unavailable).includes("Create request"))
  const empty = h.render("create", { "eligible-tickets": success([]) })
  assert.match(empty, /No eligible tickets available/)
  assert.ok(disabledButtons(empty).includes("Create request"))
})

test("My Exchanges shows real empty and error states and all request status filters", async () => {
  const h = await harness()
  assert.match(
    h.render("mine", { [`mine:${user.id}`]: failure }),
    /Exchange service unavailable/,
  )
  const empty = h.render("mine", {
    [`mine:${user.id}`]: success({ requests: [], matches: [] }),
  })
  assert.match(empty, /You have no exchange requests or matches yet/)
  for (const status of ["OPEN", "MATCHED", "COMPLETED", "CANCELLED", "EXPIRED"])
    assert.match(empty, new RegExp(`<option value="${status}">`))
})

test("READY exposes settlement and hides acceptance controls; missing prices disable settlement", async () => {
  const h = await harness()
  const html = h.renderMatch({
    ...match,
    status: "READY",
    aAccepted: true,
    bAccepted: true,
  })
  assert.match(html, /Both users accepted\. Awaiting settlement\./)
  assert.doesNotMatch(html, /Exchange completed|Accept match|Reject match/)
  assert.ok(!disabledButtons(html).includes("Cancel match"))
  assert.ok(disabledButtons(html).includes("Complete simulated settlement"))
  const priced = h.renderMatch({
    ...match,
    status: "READY",
    aAccepted: true,
    bAccepted: true,
    ticketA: { ...ticket, price: 50 },
    ticketB: { ...ticket, id: "other", price: 75 },
  })
  assert.match(priced, /Your simulated payment: S\$25\.00/)
  assert.ok(!disabledButtons(priced).includes("Complete simulated settlement"))
})

test("pending acceptance, expiry, missing ownership, and terminal states restrict actions", async () => {
  const h = await harness()
  const waiting = h.renderMatch({ ...match, aAccepted: true })
  assert.match(waiting, /Waiting for the other participant/)
  assert.ok(disabledButtons(waiting).includes("Accepted"))
  assert.ok(disabledButtons(waiting).includes("Reject match"))
  assert.ok(!disabledButtons(waiting).includes("Cancel match"))
  const expired = h.renderMatch({ ...match, expiresAt: "2000-01-01T00:00:00Z" })
  for (const action of ["Accept match", "Reject match", "Cancel match"])
    assert.ok(disabledButtons(expired).includes(action))
  assert.match(expired, /expiry time has passed/)
  const unknown = h.renderMatch(match, [])
  assert.match(unknown, /participant details are unavailable/)
  for (const action of ["Accept match", "Reject match", "Cancel match"])
    assert.ok(disabledButtons(unknown).includes(action))
  for (const status of ["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"])
    assert.doesNotMatch(
      h.renderMatch({ ...match, status }),
      /Accept match|Reject match|Cancel match/,
    )
})

test("public interest selects eligible owned tickets without requiring any existing request", async () => {
  const h = await harness()
  const key = `interest-tickets:${user.id}:public-target`
  const html = h.renderInterest({ [key]: success([
    { ...ticket, status: "VALID", eligible: true },
    { ...ticket, id: "reserved-ticket", status: "VALID", eligible: false },
    { ...ticket, id: "unrelated-ticket", eventId: "other-event", status: "VALID", eligible: true },
  ]) })
  assert.match(html, /Your eligible ticket/)
  assert.match(html, new RegExp(`<option value="${ticket.id}">`))
  assert.doesNotMatch(html, /reserved-ticket|unrelated-ticket|Your open exchange request|Create a public request/)
  assert.match(html, /No separate public request is needed/)
  assert.match(html, /Both participants must accept/)
})

test("public interest has private loading, error, empty and signed-out states", async () => {
  const h = await harness()
  const key = `interest-tickets:${user.id}:public-target`
  assert.match(h.renderInterest({}), /Loading exchange data/)
  const empty = h.renderInterest({ [key]: success([]) })
  assert.match(empty, /You do not currently have an eligible ticket for this exchange/)
  assert.ok(disabledButtons(empty).includes("Express interest"))
  assert.match(h.renderInterest({ [key]: failure }), /Exchange service unavailable/)
  const signedOut = h.renderInterest({ [key]: success([{ ...ticket, eligible: true, status: "VALID" }]) }, null)
  assert.match(signedOut, /Sign in to express interest/)
  assert.doesNotMatch(signedOut, /contract-ticket|Your eligible ticket/)
})
