import React from "react"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SourceTextModule, SyntheticModule, createContext } from "node:vm"
import ts from "typescript"

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src")
export const admin = { id: "reset-admin", name: "admin", role: "admin" }
export const localTarget = { environment: "development", databaseHost: "127.0.0.1", databasePort: 5433,
  databaseName: "fixture", databaseSchema: "test_schema", requiresProductionOverride: false,
  enabled: true, targetId: "a".repeat(64) }

export async function resetHarness() {
  let user = admin
  let target = localTarget
  let failure = null
  const calls = []
  const context = createContext({ AbortController, window: { location: { reload() {} } } })
  const modules = new Map()
  const synthetic = (id, exports) => new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
  }, { context, identifier: id })
  async function load(path) {
    if (modules.has(path)) return modules.get(path)
    let m
    if (path === "react") m = synthetic(path, { ...React, default: React })
    else if (path === "react/jsx-runtime") m = synthetic(path, await import("react/jsx-runtime"))
    else if (path.endsWith("/lib/store.tsx")) m = synthetic(path, { useStore: () => ({ user }) })
    else if (path.endsWith("/lib/backendApi.ts")) m = synthetic(path, {
      getDemoResetTarget: async () => { calls.push({ kind: "target" }); return target },
      resetDemoData: async input => { calls.push({ kind: "reset", input }); if (failure) throw failure; return { deleted: { events: 1 }, message: "cleared" } },
    })
    else if (path.endsWith("/components/ui.tsx")) m = synthetic(path, {
      Button: ({ children, type, disabled, onClick }) => React.createElement("button", { type, disabled, onClick }, children),
      Card: ({ children }) => React.createElement("section", null, children),
      Field: ({ label, children }) => React.createElement("label", null, label, children),
      Input: props => React.createElement("input", props),
    })
    else {
      const output = ts.transpileModule(await readFile(path, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText
      m = new SourceTextModule(output, { context, identifier: path })
    }
    modules.set(path, m)
    await m.link(async (specifier, parent) => {
      if (!specifier.startsWith(".")) return load(specifier)
      const base = resolve(dirname(parent.identifier), specifier)
      for (const extension of [".tsx", ".ts"]) {
        try { await readFile(base + extension); return load(base + extension) } catch (error) { if (error.code !== "ENOENT") throw error }
      }
      throw new Error("Missing import " + specifier)
    })
    return m
  }
  const component = await load(resolve(sourceRoot, "components/ResetDemoData.tsx"))
  await component.evaluate()
  return { Component: component.namespace.default,
    confirmation: modules.get(resolve(sourceRoot, "lib/resetConfirmation.ts")).namespace,
    calls, setUser(value) { user = value }, setTarget(value) { target = value }, fail(value) { failure = value } }
}
