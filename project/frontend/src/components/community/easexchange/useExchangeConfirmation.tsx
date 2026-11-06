import { useCallback, useEffect, useId, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button } from "../../ui"

type Confirmation = { title: string; message: string; confirmLabel: string; destructive?: boolean }

/** Resolve dismissal and unmount as false so only explicit confirmation can mutate. */
export default function useExchangeConfirmation() {
  const [options, setOptions] = useState<Confirmation | null>(null)
  const resolve = useRef<((confirmed: boolean) => void) | null>(null)
  useEffect(() => () => { resolve.current?.(false); resolve.current = null }, [])
  const confirm = useCallback((next: Confirmation) => {
    if (resolve.current) return Promise.resolve(false)
    return new Promise<boolean>(done => { resolve.current = done; setOptions(next) })
  }, [])
  const finish = (confirmed: boolean) => {
    resolve.current?.(confirmed)
    resolve.current = null
    setOptions(null)
  }
  return { confirm, confirmation: options && <ExchangeConfirmation options={options} onFinish={finish} /> }
}

function ExchangeConfirmation({ options, onFinish }: { options: Confirmation; onFinish: (value: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    dialog?.querySelector<HTMLButtonElement>("[data-go-back]")?.focus()
    return () => {
      dialog?.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return <dialog ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-message`}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onFinish(false) }}
    onClose={event => { event.stopPropagation(); if (ref.current && !ref.current.open) onFinish(false) }}
    onKeyDown={event => {
      if (event.key !== "Tab") return
      const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}
    className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-brand-purple/15 bg-white p-5 text-brand-deep shadow-xl backdrop:bg-brand-deep/40 sm:p-7">
    <div className="flex items-center justify-between gap-3">
      <h2 id={`${id}-title`} className="font-brand text-xl font-bold">{options.title}</h2>
      <Button variant="ghost" size="sm" aria-label="Close confirmation" onClick={() => onFinish(false)}><X className="h-5 w-5" /></Button>
    </div>
    <p id={`${id}-message`} className="mt-4 text-sm">{options.message}</p>
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <Button data-go-back variant="outline" onClick={() => onFinish(false)}>Go Back</Button>
      <Button variant={options.destructive ? "danger" : "primary"} onClick={() => onFinish(true)}>{options.confirmLabel}</Button>
    </div>
  </dialog>
}
