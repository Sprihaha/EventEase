import { useCallback, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import {
  createExchangeRequest,
  exchangeErrorMessage,
  getEligibleExchangeTickets,
  getExchangeOptions,
  getRecipientEligibility,
} from "../../../lib/exchangeApi";
import type { ExchangeRequest } from "../../../lib/exchangeTypes";
import useExchangeResource from "../../../lib/useExchangeResource";
import ExchangeSelect from "./ExchangeSelect";
import RecipientAutocomplete from "./RecipientAutocomplete";
import { useStore } from "../../../lib/store";
import { Badge, Button, Card, Field } from "../../ui";

export type SwapRequestPanelProps = {
  onCreated: (request: ExchangeRequest) => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
};

export function SwapRequestPanel({ onCreated, onCancel, onPendingChange }: SwapRequestPanelProps) {
  const { user } = useStore();
  const tickets = useExchangeResource(
    user ? `eligible-tickets:${user.id}` : null,
    getEligibleExchangeTickets,
  );
  const [ticketId, setTicketId] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("ticket") ?? ""
      : "",
  );
  const [desiredCategory, setDesiredCategory] = useState("");
  const [desiredSection, setDesiredSection] = useState("");
  const [allowCrossTier, setAllowCrossTier] = useState(false);
  const [requestType, setRequestType] = useState<"PUBLIC" | "DIRECT">("PUBLIC");
  const [recipientUsername, setRecipientUsername] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [recipientRevision, setRecipientRevision] = useState(0);
  const selectRecipient = useCallback((username: string) => {
    setRecipientUsername(username);
    setSelectedRecipient(username);
  }, []);
  const validRecipient = requestType === "PUBLIC" || (!!selectedRecipient && selectedRecipient === recipientUsername);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const eligibleTickets =
    tickets.data?.filter((ticket) => ticket.eligible) ?? [];
  const selected = eligibleTickets.find((ticket) => ticket.id === ticketId);

  const loadRecipientEligibility = useCallback((signal: AbortSignal) =>
    getRecipientEligibility(selected?.id ?? "", selectedRecipient ?? "", AbortSignal.any([signal, AbortSignal.timeout(10_000)])), [selected?.id, selectedRecipient]);
  const recipientEligibility = useExchangeResource(
    requestType === "DIRECT" && selected && validRecipient && user
      ? `recipient:${user.id}:${selected.id}:${selectedRecipient}:${recipientRevision}` : null, loadRecipientEligibility);
  const canInvite = requestType === "PUBLIC" || (recipientEligibility.status === "success" && recipientEligibility.data === true);

  const loadOptions = useCallback(
    (signal: AbortSignal) => getExchangeOptions(selected?.id ?? "", signal),
    [selected?.id],
  );
  const options = useExchangeResource(
    selected && user ? `options:${user.id}:${selected.id}` : null,
    loadOptions,
  );
  const availableCategories = (options.data ?? []).filter(
    (item) => allowCrossTier || item.type.toLowerCase() === selected?.categoryType.toLowerCase(),
  );
  const category = availableCategories.find((item) => item.id === desiredCategory);
  const sections = [
    ...new Set((category ? [category] : availableCategories).flatMap((item) => item.sections)),
  ];
  const validPreferences =
    options.status === "success" &&
    (!desiredCategory || !!category) &&
    (!desiredSection || sections.includes(desiredSection));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || tickets.status !== "success" || !validPreferences || !validRecipient || !canInvite || submitting.current)
      return;
    submitting.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const result = await createExchangeRequest({
        offeredTicketId: selected.id,
        desiredCategoryId: category?.id ?? null,
        desiredCategoryType: category?.type ?? null,
        desiredSeatSection: desiredSection.trim() || null,
        allowCrossTier,
        requestType,
        ...(requestType === "DIRECT" ? { recipientUsername: selectedRecipient! } : {}),
      });
      onCreated(result);
    } catch (cause) {
      if (requestType === "DIRECT") setSelectedRecipient(null);
      setError(
        `${exchangeErrorMessage(cause)} Creation was not confirmed. Check My Exchanges before submitting again.`,
      );
      tickets.refresh();
    } finally {
      submitting.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <Badge tone="accent">
        <Repeat className="h-3 w-3" /> <span className="font-feature italic font-black">EaseXchange</span>
      </Badge>
      <h2 className="mt-3 font-brand text-2xl font-bold text-brand-deep">
        Create exchange request
      </h2>
      <p className="mt-2 text-sm text-muted">
        Offer one eligible ticket. The exchange service validates ownership and
        availability.
      </p>
      {tickets.status === "loading" && (
        <p role="status" className="mt-5 text-sm text-muted">
          Loading eligible tickets…
        </p>
      )}
      {tickets.error && (
        <div
          role="alert"
          className="mt-5 space-y-3 rounded-2xl bg-brand-lilac/60 p-4 text-sm"
        >
          <p>{tickets.error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={tickets.reload}
          >
            Retry eligible tickets
          </Button>
        </div>
      )}
      {tickets.status === "success" && !eligibleTickets.length && (
        <p
          role="status"
          className="mt-5 rounded-2xl bg-brand-lilac/60 p-4 text-sm text-muted"
        >
          No eligible tickets available.
        </p>
      )}
      <form className="mt-5 space-y-5" onSubmit={submit} aria-busy={pending}>
        <fieldset
          disabled={
            pending || tickets.status !== "success" || !eligibleTickets.length
          }
          className="space-y-5 disabled:opacity-60"
        >
          <Field label="Request Type">
            <ExchangeSelect
              aria-label="Request Type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as "PUBLIC" | "DIRECT")}
            >
              <option value="PUBLIC">Public</option>
              <option value="DIRECT">Direct</option>
            </ExchangeSelect>
          </Field>
          {requestType === "DIRECT" && (
            <div className="space-y-2"><RecipientAutocomplete value={recipientUsername} selected={validRecipient}
              onChange={value => { setRecipientUsername(value); setSelectedRecipient(null); setRecipientRevision(n => n + 1) }}
              onSelect={selectRecipient} />
              {!selected && <p className="text-xs text-muted">Select your offered ticket first to check recipient eligibility.</p>}
              {selected && validRecipient && <>
                {recipientEligibility.status === "loading" && <p role="status" className="text-sm text-muted">Checking recipient eligibility…</p>}
                {recipientEligibility.status === "success" && <p role="status" className={`rounded-xl border p-3 text-sm font-semibold ${recipientEligibility.data ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  {recipientEligibility.data ? "This user has an eligible ticket for this event." : "This user has no eligible tickets for this event."}
                </p>}
                {recipientEligibility.error && <div role="alert"><p className="text-sm text-danger">Recipient eligibility could not be checked.</p><Button type="button" size="sm" variant="outline" onClick={recipientEligibility.reload}>Retry eligibility check</Button></div>}
              </>}
            </div>
          )}
          <Field label="Ticket to Offer">
            <ExchangeSelect
              aria-label="Ticket to Offer"
              required
              value={selected?.id ?? ""}
              onChange={(event) => {
                setTicketId(event.target.value);
                setRecipientRevision(n => n + 1);
                setDesiredCategory("");
                setDesiredSection("");
              }}
            >
              <option value="">Select an eligible owned ticket</option>
              {eligibleTickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {ticket.eventName} · {ticket.categoryType} · Section {ticket.seatSection}
                  {ticket.seatLabel ? ` · Seat ${ticket.seatLabel}` : ""}
                </option>
              ))}
            </ExchangeSelect>
            <p className="mt-2 text-xs text-muted">
              The offered ticket determines the event and its available categories and sections.
            </p>
          </Field>
          <div>
            <label className="flex items-center gap-3 text-sm text-brand-deep">
              <input
                type="checkbox"
                checked={allowCrossTier}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setAllowCrossTier(checked);
                  const nextCategories = (options.data ?? []).filter(
                    (item) => checked || item.type.toLowerCase() === selected?.categoryType.toLowerCase(),
                  );
                  const nextCategory = nextCategories.find((item) => item.id === desiredCategory);
                  if (desiredCategory && !nextCategory) setDesiredCategory("");
                  const nextSections = (nextCategory ? [nextCategory] : nextCategories)
                    .flatMap((item) => item.sections);
                  if (desiredSection && !nextSections.includes(desiredSection)) setDesiredSection("");
                }}
                className="h-4 w-4 accent-brand-purple"
              />{" "}
              Allow cross-tier suggestions
            </label>
            <p className="mt-2 text-xs text-muted">
              {allowCrossTier
                ? "Choose any available tier for this event. Different tiers may involve a price difference."
                : "Exchanges stay within the same tier as your offered ticket."}
            </p>
          </div>
          <Field label="Desired Category">
            <ExchangeSelect
              aria-label="Desired Category"
              value={desiredCategory}
              disabled={!selected || options.status !== "success"}
              onChange={(e) => {
                setDesiredCategory(e.target.value);
                setDesiredSection("");
              }}
            >
              <option value="">
                {selected ? (allowCrossTier ? "Any event category" : "Any same-tier category") : "Choose Ticket to Offer above first"}
              </option>
              {availableCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.type}
                </option>
              ))}
            </ExchangeSelect>
          </Field>
          <Field label="Desired Seat Section">
            <ExchangeSelect
              aria-label="Desired Seat Section"
              value={desiredSection}
              disabled={!selected || options.status !== "success"}
              onChange={(e) => setDesiredSection(e.target.value)}
            >
              <option value="">
                {selected ? (allowCrossTier ? "Any event section" : "Any same-tier section") : "Choose Ticket to Offer above first"}
              </option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </ExchangeSelect>
          </Field>
          {selected && options.status === "loading" && (
            <p role="status" className="text-sm text-muted">
              Loading event categories and sections…
            </p>
          )}
          {options.error && (
            <div role="alert">
              <p>{options.error}</p>
              <Button type="button" variant="outline" onClick={options.reload}>
                Retry event options
              </Button>
            </div>
          )}
          <p className="text-sm text-muted">
            New requests expire within 72 hours and before the final seven days of the event.
            Review the actual expiry shown on your request. Acceptance cannot be withdrawn;
            equal-value exchanges complete automatically after both participants accept. Any price difference must be paid before tickets transfer.
          </p>
          <Button type="submit" disabled={!selected || !validPreferences || !validRecipient || !canInvite || pending}>
            {pending ? "Creating request…" : "Create request"}
          </Button>
        </fieldset>
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 p-4 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}

export default SwapRequestPanel;
