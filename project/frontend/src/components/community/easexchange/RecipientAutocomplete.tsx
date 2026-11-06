import { useEffect, useId, useRef, useState } from "react"
import { searchExchangeRecipients } from "../../../lib/exchangeApi"
import { Input } from "../../ui"

export default function RecipientAutocomplete({ value, selected, onChange, onSelect }: {
  value: string
  selected: boolean
  onChange: (value: string) => void
  onSelect: (username: string) => void
}) {
  const id = useId()
  const [result, setResult] = useState<{ query: string; names: string[]; error: boolean } | null>(null)
  const [revision, setRevision] = useState(0)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const query = value.trim()
  const latestQuery = useRef(query)
  latestQuery.current = query
  useEffect(() => {
    if (selected || query.length < 2) return
    const controller = new AbortController()
    let timeout: number | undefined
    const timer = window.setTimeout(async () => {
      timeout = window.setTimeout(() => {
        controller.abort()
        setResult({ query, names: [], error: true })
      }, 10_000)
      try {
        const names = await searchExchangeRecipients(query, controller.signal)
        if (!controller.signal.aborted && latestQuery.current === query) {
          setResult({ query, names, error: false })
          const exact = names.filter(name => name.toLowerCase() === query.toLowerCase())
          if (exact.length === 1) { onSelect(exact[0]); setOpen(false); setActive(-1) }
        }
      } catch {
        if (!controller.signal.aborted) setResult({ query, names: [], error: true })
      } finally { window.clearTimeout(timeout) }
    }, 300)
    return () => { window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort() }
  }, [query, selected, revision, onSelect])
  const current = result?.query === query ? result : null
  const names = !selected && current && !current.error ? current.names : []
  const showOptions = open && names.length > 0
  const choose = (username: string) => { onSelect(username); setOpen(false); setActive(-1) }
  return (
    <div className="relative" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
    }}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-brand-deep">Recipient customer username</label>
      <Input id={id} role="combobox" autoComplete="off" required maxLength={100}
        aria-autocomplete="list" aria-expanded={showOptions} aria-controls={`${id}-options`}
        aria-activedescendant={showOptions && active >= 0 ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-hint`} value={value}
        onFocus={() => setOpen(true)}
        onChange={event => { latestQuery.current = event.target.value.trim(); onChange(event.target.value); setOpen(true); setActive(-1); setResult(null) }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false) }
          if (names.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault(); setOpen(true)
            setActive(index => event.key === "ArrowDown" ? (index + 1) % names.length : (index <= 0 ? names.length - 1 : index - 1))
          }
          if (event.key === "Enter" && !selected) {
            event.preventDefault()
            if (showOptions && active >= 0) choose(names[active])
          }
        }} />
      {showOptions && <ul id={`${id}-options`} role="listbox" aria-label="Matching customer usernames"
        className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-brand-purple/20 bg-white p-1 shadow-lg">
        {names.map((username, index) => <li key={username} role="option" id={`${id}-option-${index}`} aria-selected={active === index}>
          <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(username)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-lilac ${active === index ? "bg-brand-lilac" : ""}`}>
            {username}
          </button>
        </li>)}
      </ul>}
      <div id={`${id}-hint`} className="mt-2 text-xs text-muted" aria-live="polite">
        {selected ? "Recipient selected. Only this customer can respond to your invitation."
          : query.length < 2 ? "Type a complete customer username or select a suggestion (at least 2 characters)."
          : !current ? "Validating username…"
          : current.error ? <><span>Username search is unavailable. Please try again.</span>{" "}<button type="button" className="font-semibold text-brand-purple underline" onClick={() => { setResult(null); setRevision(n => n + 1); setOpen(true) }}>Retry username search</button></>
          : <>User not found.{names.length > 0 && " Enter the complete username or select a suggestion."}</>}
      </div>
    </div>
  )
}
