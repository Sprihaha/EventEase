// EasePoints Rulebook and Utilities
import { useCallback, useEffect, useState } from "react"
import { request } from "./backendApi"

export const EASEPOINTS_RULES = {
  POINTS_PER_APPROVED_PHOTO: 23,
  POINTS_PER_COMPLETED_EXCHANGE: 5,
  POINTS_PER_QUALIFYING_QUESTION: 7,
  REDEMPTION_COST_POINTS: 100,
  DISCOUNT_PERCENT: 10, // 10% max per exchange
  MAX_DISCOUNT_PERCENT: 10,
} as const

// Balances are computed by the server from real activity (approved EasePix, EaseConnect questions,
// completed exchanges) minus redemptions, so every account starts at 0 and matches on every device.
// Keep EASEPOINTS_RULES in sync with backend/app/services/easepoints.py.

export interface EasePointsSummary {
  balance: number
  earned: number
  redeemed: number
  approvedPhotos: number
  questions: number
  completedExchanges: number
}

const EMPTY_SUMMARY: EasePointsSummary = {
  balance: 0, earned: 0, redeemed: 0, approvedPhotos: 0, questions: 0, completedExchanges: 0,
}
const UPDATED_EVENT = "eventease:easepoints-updated"

export function fetchEasePoints(): Promise<EasePointsSummary> {
  return request<EasePointsSummary>("/community/easepoints/me", {}, true)
}

/** Tell every mounted useEasePoints() to re-fetch (after a question, approval or exchange). */
export function notifyEasePointsChanged(): void {
  window.dispatchEvent(new CustomEvent(UPDATED_EVENT))
}

/** Points come from the server; organisers and admins don't earn them. */
export function useEasePoints(user: { id: string; role: string } | null | undefined) {
  const [summary, setSummary] = useState<EasePointsSummary>(EMPTY_SUMMARY)
  const userId = user?.id
  const isCustomer = user?.role === "customer"

  const refresh = useCallback(async () => {
    if (!userId || !isCustomer) {
      setSummary(EMPTY_SUMMARY)
      return
    }
    try {
      setSummary(await fetchEasePoints())
    } catch {
      // Keep the last known balance if the request fails
    }
  }, [userId, isCustomer])

  useEffect(() => {
    void refresh()
    window.addEventListener(UPDATED_EVENT, refresh)
    return () => window.removeEventListener(UPDATED_EVENT, refresh)
  }, [refresh])

  return { points: summary.balance, summary, refresh }
}

export function calculateExchangeDiscount(
  userPoints: number,
  differenceCents: number,
  applyDiscount: boolean,
): {
  discountCents: number
  finalDifferenceCents: number
  pointsToDeduct: number
  remainingPoints: number
  isEligible: boolean
  samePrice: boolean
} {
  const samePrice = differenceCents <= 0
  const isEligible = userPoints >= EASEPOINTS_RULES.REDEMPTION_COST_POINTS && differenceCents > 0

  if (!applyDiscount || !isEligible || samePrice) {
    return {
      discountCents: 0,
      finalDifferenceCents: Math.max(0, differenceCents),
      pointsToDeduct: 0,
      remainingPoints: userPoints,
      isEligible,
      samePrice,
    }
  }

  // Exactly 10% discount on the payable difference. No stacking allowed (max 10%).
  const discountCents = Math.round(differenceCents * (EASEPOINTS_RULES.DISCOUNT_PERCENT / 100))
  const finalDifferenceCents = Math.max(0, differenceCents - discountCents)
  const pointsToDeduct = EASEPOINTS_RULES.REDEMPTION_COST_POINTS
  const remainingPoints = userPoints - pointsToDeduct

  return {
    discountCents,
    finalDifferenceCents,
    pointsToDeduct,
    remainingPoints,
    isEligible,
    samePrice,
  }
}

