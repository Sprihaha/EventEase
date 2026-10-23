import { useCallback, useEffect, useState } from "react"
import { exchangeErrorMessage } from "./exchangeApi"

type Resource<T> = {
  key: string
  revision: number
  status: "success" | "error"
  data: T | null
  error: string | null
}

/** Retain items during refresh; a changed account/key immediately hides old data. */
export default function useExchangeResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [revision, setRevision] = useState(0)
  const [backgroundRevision, setBackgroundRevision] = useState(0)
  const [result, setResult] = useState<Resource<T> | null>(null)
  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    let running = false
    const fetch = async (silent: boolean) => {
      if (running) return
      running = true
      try {
        const data = await load(controller.signal)
        if (!controller.signal.aborted)
          setResult({ key, revision, status: "success", data, error: null })
      } catch (error) {
        if (!controller.signal.aborted) setResult(previous => {
          const data = previous?.key === key ? previous.data : null
          // A background failure must not replace visible items or flash an alert.
          if (silent && data !== null) return previous
          return { key, revision, status: "error", data, error: exchangeErrorMessage(error) }
        })
      } finally { running = false }
    }
    void fetch(false)
    const timer = window.setInterval(() => void fetch(true), 30_000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [key, revision, backgroundRevision, load])
  const current = key !== null && result?.key === key ? result : null
  return {
    status: key === null ? "idle" as const
      : !current || current.revision !== revision ? "loading" as const : current.status,
    data: current?.data ?? null,
    error: current?.error ?? null,
    reload: useCallback(() => setRevision(value => value + 1), []),
    refresh: useCallback(() => setBackgroundRevision(value => value + 1), []),
  }
}
