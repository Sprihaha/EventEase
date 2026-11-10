// EasePoints Rulebook and Utilities

export const EASEPOINTS_RULES = {
  POINTS_PER_APPROVED_PHOTO: 23,
  POINTS_PER_COMPLETED_EXCHANGE: 5,
  POINTS_PER_QUALIFYING_QUESTION: 7,
  REDEMPTION_COST_POINTS: 100,
  DISCOUNT_PERCENT: 10, // 10% max per exchange
  MAX_DISCOUNT_PERCENT: 10,
} as const

const STORAGE_PREFIX = "eventease_easepoints_"
const AWARDED_PIX_PREFIX = "eventease_awarded_pix_"
const AWARDED_EXCHANGE_PREFIX = "eventease_awarded_exchange_"

export function getAwardedExchangeIds(userId: string): Set<string> {
  if (!userId) return new Set()
  const key = `${AWARDED_EXCHANGE_PREFIX}${userId}`
  const saved = localStorage.getItem(key)
  if (saved) {
    try {
      const arr = JSON.parse(saved)
      if (Array.isArray(arr)) return new Set(arr)
    } catch {
      // ignore
    }
  }
  return new Set()
}

export function awardCompletedExchangePointsOnce(userId: string, matchId: string): boolean {
  if (!userId || !matchId) return false
  const awarded = getAwardedExchangeIds(userId)
  if (awarded.has(matchId)) {
    return false
  }
  awarded.add(matchId)
  localStorage.setItem(`${AWARDED_EXCHANGE_PREFIX}${userId}`, JSON.stringify(Array.from(awarded)))
  awardEasePoints(userId, EASEPOINTS_RULES.POINTS_PER_COMPLETED_EXCHANGE, "Completed ticket exchange")
  return true
}

export function getAwardedPixIds(userId: string): Set<string> {
  if (!userId) return new Set()
  const key = `${AWARDED_PIX_PREFIX}${userId}`
  const saved = localStorage.getItem(key)
  if (saved) {
    try {
      const arr = JSON.parse(saved)
      if (Array.isArray(arr)) return new Set(arr)
    } catch {
      // ignore
    }
  }
  return new Set()
}

export function markPixAsAwarded(userId: string, pixId: string): void {
  if (!userId || !pixId) return
  const set = getAwardedPixIds(userId)
  set.add(pixId)
  const key = `${AWARDED_PIX_PREFIX}${userId}`
  localStorage.setItem(key, JSON.stringify(Array.from(set)))
}

/**
 * Awards points for an approved EasePix photo exactly once.
 * Returns true if points were newly awarded, or false if already awarded before.
 */
export function awardApprovedEasePixPointsOnce(userId: string, pixId: string): boolean {
  if (!userId || !pixId) return false
  const awarded = getAwardedPixIds(userId)
  if (awarded.has(pixId)) {
    return false
  }
  markPixAsAwarded(userId, pixId)
  awardEasePoints(userId, EASEPOINTS_RULES.POINTS_PER_APPROVED_PHOTO, "Approved EasePix photo")
  return true
}

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

