import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { admin, resetHarness } from "./resetDemoDataHarness.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../src")
test("reset controls render for authenticated admin only, with no network request on render", async () => {
  const h = await resetHarness()
  for (const user of [null, { ...admin, role: "customer" }, { ...admin, role: "organizer" }]) {
    h.setUser(user)
    assert.equal(renderToStaticMarkup(React.createElement(h.Component)), "")
  }
  h.setUser(admin)
  assert.match(renderToStaticMarkup(React.createElement(h.Component)), /Reset Demo Data/)
  assert.deepEqual(h.calls, [])
})

test("exact phrase, own username, password, acknowledgement and enabled target are all required", async () => {
  const h = await resetHarness()
  const { canConfirmReset: valid, RESET_CONFIRMATION: phrase } = h.confirmation
  const form = { phrase, username: admin.name, password: "test-only", acknowledged: true }
  assert.equal(valid(form, admin.name, true), true)
  for (const modified of [{ ...form, phrase: phrase.toLowerCase() }, { ...form, username: "other" },
    { ...form, password: "" }, { ...form, acknowledged: false }]) {
    assert.equal(valid(modified, admin.name, true), false)
  }
  assert.equal(valid(form, admin.name, false), false)
})

test("clear action removes every sensitive field and acknowledgement", async () => {
  const h = await resetHarness()
  const { resetConfirmationReducer: reduce, emptyResetConfirmation: empty } = h.confirmation
  let form = empty()
  form = reduce(form, { type: "edit", field: "password", value: "test-only" })
  form = reduce(form, { type: "edit", field: "username", value: admin.name })
  form = reduce(form, { type: "acknowledge", value: true })
  assert.equal(form.password, "test-only")
  assert.deepEqual(JSON.parse(JSON.stringify(reduce(form, { type: "clear" }))), JSON.parse(JSON.stringify(empty())))
})

test("only AdminDashboard imports/mounts reset; component never writes browser storage", async () => {
  const usages = []
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (/\.tsx?$/.test(path)) {
        const source = await readFile(path, "utf8")
        if (/<ResetDemoData\b|from\s+["'][^"']*\/ResetDemoData["']/.test(source)) usages.push(path)
      }
    }
  }
  await walk(root)
  assert.deepEqual(usages, [resolve(root, "pages/AdminDashboard.tsx")])
  for (const name of ["components/ResetDemoData.tsx", "lib/resetConfirmation.ts"]) {
    assert.doesNotMatch(await readFile(resolve(root, name), "utf8"), /localStorage|sessionStorage/)
  }
})
