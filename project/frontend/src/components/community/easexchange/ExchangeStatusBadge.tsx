import type { ExchangeRequestStatus } from "../../../lib/exchangeTypes"
import { exchangeStatusClasses, exchangeStatusLabels } from "../../../lib/exchangePresentation"

export default function ExchangeStatusBadge({ status }: { status: ExchangeRequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${exchangeStatusClasses[status]}`}>
      {exchangeStatusLabels[status]}
    </span>
  )
}
