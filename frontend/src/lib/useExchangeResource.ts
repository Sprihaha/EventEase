import { useCallback, useEffect, useState } from "react"
import { exchangeErrorMessage } from "./exchangeApi"

type Resource<T> = {
  key: string
  status: "success"
  data: T
} | {
  key: string
  status: "error"
  error: string
}

/** No cache or persistence. A changed identity immediately hides the previous response. */
export default function useExchangeResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<Resource<T> | null>(null)
  const identity = key === null ? null : `${key}:${revision}`
  useEffect(() => {
    if (identity === null) return
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ key: identity, status: "success", data })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key: identity,
            status: "error",
            error: exchangeErrorMessage(error),
          })
      },
    )
    return () => controller.abort()
  }, [identity, load])
  const current = result?.key === identity ? result : null
  return {
    status:
      identity === null
        ? "idle" as const
        : (current?.status ?? "loading" as const),
    data: current?.status === "success" ? current.data : null,
    error: current?.status === "error" ? current.error : null,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  }
}
