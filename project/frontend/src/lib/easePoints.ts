// EasePoints Rulebook and Utilities

export const EASEPOINTS_RULES = {
  POINTS_PER_APPROVED_PHOTO: 23,
  POINTS_PER_COMPLETED_EXCHANGE: 17,
  POINTS_PER_QUALIFYING_QUESTION: 3,
  REDEMPTION_COST_POINTS: 100,
  DISCOUNT_PERCENT: 10, // 10% max per exchange
  MAX_DISCOUNT_PERCENT: 10,
} as const

const STORAGE_PREFIX = "eventease_easepoints_"

export function getUserEasePoints(userId: string): number {
  if (!userId) return 0
  const key = `${STORAGE_PREFIX}${userId}`
  const saved = localStorage.getItem(key)
  if (saved !== null) {
    const val = parseInt(saved, 10)
    return isNaN(val) ? 46 : val
  }
  // Initialize new active user with a starting balance (e.g. 2 qualifying photos = 46 pts)
  const initial = 46
  localStorage.setItem(key, initial.toString())
  return initial
}

export function setUserEasePoints(userId: string, points: number): void {
  if (!userId) return
  const key = `${STORAGE_PREFIX}${userId}`
  localStorage.setItem(key, Math.max(0, points).toString())
  // Dispatch custom event so all open views update simultaneously
  window.dispatchEvent(new CustomEvent("eventease:easepoints-updated", { detail: { userId, points } }))
}

export function awardEasePoints(userId: string, amount: number, reason?: string): number {
  if (!userId || amount <= 0) return getUserEasePoints(userId)
  const current = getUserEasePoints(userId)
  const updated = current + amount
  setUserEasePoints(userId, updated)
  return updated
}

export function deductEasePoints(userId: string, amount: number): boolean {
  if (!userId || amount <= 0) return false
  const current = getUserEasePoints(userId)
  if (current < amount) return false
  const updated = current - amount
  setUserEasePoints(userId, updated)
  return true
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

