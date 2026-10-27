export function parseSeatKey(
  seatStr: string,
): { type: "letter" | "number" | "unknown"; val: number } {
  const rowMatch = seatStr.match(/row\s*([a-z]+|[0-9]+)/i)
  if (rowMatch) {
    const raw = rowMatch[1]
    if (/^[0-9]+$/.test(raw)) {
      return { type: "number", val: parseInt(raw, 10) }
    }
    let score = 0
    for (let i = 0; i < raw.length; i++) {
      score = score * 26 + (raw.toUpperCase().charCodeAt(i) - 64)
    }
    return { type: "letter", val: score }
  }

  const letterMatch = seatStr.match(/\b([a-z]{1,2})\b/i)
  if (letterMatch) {
    const raw = letterMatch[1]
    let score = 0
    for (let i = 0; i < raw.length; i++) {
      score = score * 26 + (raw.toUpperCase().charCodeAt(i) - 64)
    }
    return { type: "letter", val: score }
  }

  const numMatch = seatStr.match(/\b([0-9]+)\b/)
  if (numMatch) {
    return { type: "number", val: parseInt(numMatch[1], 10) }
  }

  return { type: "unknown", val: 0 }
}

export function parseSeatParts(
  str: string,
): { row: string | null; seat: string | null; norm: string } {
  const norm = str.toLowerCase().trim()
  const rowMatch = norm.match(/\brow\s*([a-z0-9]+)\b/i)
  const seatMatch = norm.match(/\bseat\s*([0-9]+|[a-z0-9]+)\b/i)

  let standaloneRow: string | null = null
  let standaloneNum: string | null = null

  if (!rowMatch && !seatMatch) {
    const singleLetterMatch = norm.match(/\b([a-z]{1,2})\b/i)
    if (singleLetterMatch) standaloneRow = singleLetterMatch[1].toLowerCase()
    const numMatch = norm.match(/\b([0-9]+)\b/)
    if (numMatch) standaloneNum = numMatch[1].replace(/^0+/, "")
  }

  const row = (rowMatch ? rowMatch[1] : standaloneRow)?.toLowerCase() ?? null
  const rawSeat = seatMatch ? seatMatch[1] : standaloneNum
  const seat = rawSeat ? rawSeat.replace(/^0+/, "") : null

  return { row, seat, norm }
}

export function isSeatMatch(searchedStr: string, seatStr: string): boolean {
  if (!searchedStr || !seatStr) return false
  const search = parseSeatParts(searchedStr)
  const target = parseSeatParts(seatStr)

  // If user searched for both row and seat (e.g., "Row A Seat 12")
  if (search.row && search.seat) {
    return target.row === search.row && target.seat === search.seat
  }

  // If user searched for specific row (e.g., "Row A" or "A")
  if (search.row && !search.seat) {
    return target.row === search.row
  }

  // If user searched for specific seat number (e.g., "Seat 12" or "12")
  if (!search.row && search.seat) {
    return target.seat === search.seat || target.row === search.seat
  }

  // Fallback for custom descriptive strings: check word-level token match with stop words excluded
  const stopWords = new Set(["row", "seat", "seats", "section", "sec"])
  const searchTokens = search.norm
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok && !stopWords.has(tok))

  if (searchTokens.length === 0) return false

  const targetTokens = new Set(
    target.norm
      .replace(/[^a-z0-9]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^0+/, "")),
  )

  return searchTokens.every((tok) => targetTokens.has(tok.replace(/^0+/, "")))
}

export function matchesSectionQuery(
  sectionName: string,
  query: string,
): boolean {
  if (!query) return false
  const sName = sectionName.toLowerCase().trim()
  const q = query.toLowerCase().trim()
  if (sName === q) return true

  const cleanS = sName.replace(/^section\s+/i, "").trim()
  const cleanQ = q.replace(/^section\s+/i, "").trim()
  if (cleanS === cleanQ) return true

  if (q.includes("section") && !sName.includes("section")) return false
  if (sName.includes("section") && !q.includes("section")) {
    return cleanS === cleanQ
  }

  return false
}
