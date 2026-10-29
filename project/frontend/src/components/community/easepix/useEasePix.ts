import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { fetchSeats, type LiveSeat } from "../../../lib/ticketingApi"
import {
  backendGetEventLayout,
  backendLikeEasePix,
  type BackendEasePix,
} from "../../../lib/backendApi"
import { vantagePoints } from "../constants"
import {
  parseSeatKey,
  isSeatMatch,
  matchesSectionQuery,
} from "./seatMatching"
import type {
  DisplayPost,
  SearchableOption,
  SectionSegment,
  SectionSeatPhoto,
  Preview360Photo,
  EventItem,
  TicketTier,
} from "../types"

interface UseEasePixParams {
  events: EventItem[]
  displayPosts: DisplayPost[]
  backendEasePixList: BackendEasePix[]
  initialEventId?: string
  reloadCommunityData: () => Promise<void>
  onShowToast: (msg: string) => void
  scrollToSection: (targetId: string) => void
}

export function useEasePix({
  events,
  displayPosts,
  backendEasePixList,
  initialEventId = "",
  reloadCommunityData,
  onShowToast,
  scrollToSection,
}: UseEasePixParams) {
  const [seatVenueInput, setSeatVenueInput] = useState<string>(() => {
    if (initialEventId) {
      const ev = events.find((e) => e.id === initialEventId)
      return ev?.venue ?? ""
    }
    return ""
  })
  const [seatEventIdInput, setSeatEventIdInput] =
    useState<string>(initialEventId)
  const [seatSectionInput, setSeatSectionInput] = useState("")
  const [seatRowInput, setSeatRowInput] = useState("")
  const [seatPhotoInput, setSeatPhotoInput] = useState("")
  const [gallerySearchFilter, setGallerySearchFilter] = useState<{
    eventId?: string
    section?: string
    row?: string
  } | null>(initialEventId ? { eventId: initialEventId } : null)
  const [hasSearched, setHasSearched] = useState(Boolean(initialEventId))
  const [selectedGallerySection, setSelectedGallerySection] =
    useState<string>("all")
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareModalOrigin, setShareModalOrigin] =
    useState<"easepix" | "composer">("easepix")
  const [preview360Photo, setPreview360Photo] =
    useState<Preview360Photo | null>(null)

  // Live real seats fetched dynamically for the selected event
  const [eventSeats, setEventSeats] = useState<LiveSeat[]>([])
  const [loadingSeats, setLoadingSeats] = useState(false)

  const effectiveEventId = useMemo(() => {
    if (seatEventIdInput) return seatEventIdInput
    if (seatVenueInput) {
      const match = events.find(
        (e) => e.venue.toLowerCase() === seatVenueInput.toLowerCase(),
      )
      return match?.id ?? ""
    }
    return ""
  }, [seatEventIdInput, seatVenueInput, events])

  useEffect(() => {
    if (!effectiveEventId) {
      setEventSeats([])
      return
    }
    let active = true
    setLoadingSeats(true)
    fetchSeats(effectiveEventId)
      .then((seats) => {
        if (active) {
          setEventSeats(seats)
          setLoadingSeats(false)
        }
      })
      .catch(() => {
        if (active) {
          setEventSeats([])
          setLoadingSeats(false)
        }
      })
    return () => {
      active = false
    }
  }, [effectiveEventId])

  const selectedEvent = events.find((e) => e.id === effectiveEventId)

  // Venue options
  const venueOptions: SearchableOption[] = useMemo(() => {
    const uniqueVenues = Array.from(
      new Set(events.map((e) => e.venue).filter(Boolean)),
    )
    return uniqueVenues.map((v) => ({
      value: v,
      label: v,
    }))
  }, [events])

  // Event options (filtered by selected venue if a venue is selected)
  const eventOptions: SearchableOption[] = useMemo(() => {
    const filteredEvents = seatVenueInput
      ? events.filter(
          (e) => e.venue.toLowerCase() === seatVenueInput.toLowerCase(),
        )
      : events
    return filteredEvents.map((ev) => ({
      value: ev.id,
      label: ev.title,
    }))
  }, [events, seatVenueInput])

  const handleSeatVenueInputChange = (venue: string) => {
    setSeatVenueInput(venue)
    setSeatEventIdInput("")
    setSeatSectionInput("")
    setSeatRowInput("")
    const matchingEv = events.find(
      (e) => e.venue.toLowerCase() === venue.toLowerCase(),
    )
    setGallerySearchFilter(matchingEv?.id ? { eventId: matchingEv.id } : null)
    setHasSearched(false)
    setSelectedGallerySection("all")
  }

  const handleSeatEventIdInputChange = (eventId: string) => {
    setSeatEventIdInput(eventId)
    const selectedEv = events.find((e) => e.id === eventId)
    if (
      selectedEv &&
      (!seatVenueInput ||
        seatVenueInput.toLowerCase() !== selectedEv.venue.toLowerCase())
    ) {
      setSeatVenueInput(selectedEv.venue)
    }
    setSeatSectionInput("")
    setSeatRowInput("")
    setGallerySearchFilter(eventId ? { eventId } : null)
    setHasSearched(false)
    setSelectedGallerySection("all")
  }

  // Section options
  const sectionOptions: SearchableOption[] = useMemo(() => {
    if (!effectiveEventId || !selectedEvent) return []

    const seatSections = Array.from(
      new Set(
        eventSeats.map((s) => s.seatSection || s.categoryName).filter(Boolean),
      ),
    )
    if (seatSections.length > 0) {
      return seatSections.map((sec) => {
        const secSeats = eventSeats.filter(
          (s) => (s.seatSection || s.categoryName) === sec,
        )
        const rows = Array.from(new Set(secSeats.map((s) => s.row))).sort()
        const minRow = rows[0]
        const maxRow = rows[rows.length - 1]
        const rowRange =
          rows.length > 1 ? `Rows ${minRow}–${maxRow}` : `Row ${minRow}`
        return {
          value: sec,
          label: sec,
          sublabel: `${secSeats.length} seats · ${rowRange}`,
        }
      })
    }

    if (selectedEvent.tiers && selectedEvent.tiers.length > 0) {
      return selectedEvent.tiers.map((t: TicketTier) => ({
        value: t.name,
        label: t.name,
        sublabel: `S$${t.price.toFixed(2)} · ${t.total} seats`,
      }))
    }

    return [
      { value: "Cat 1", label: "Cat 1", sublabel: "Premier Sightlines" },
      { value: "Cat 2", label: "Cat 2", sublabel: "Standard Seating" },
      { value: "General Admission", label: "General Admission", sublabel: "Free Seating" },
    ]
  }, [effectiveEventId, selectedEvent, eventSeats])

  // Row and seat options
  const rowSeatOptions: SearchableOption[] = useMemo(() => {
    if (!effectiveEventId || !selectedEvent) return []

    const filteredSeats = seatSectionInput
      ? eventSeats.filter(
          (s) =>
            (s.seatSection || s.categoryName).toLowerCase() ===
            seatSectionInput.toLowerCase(),
        )
      : eventSeats

    if (filteredSeats.length > 0) {
      const uniqueRows = Array.from(
        new Set(filteredSeats.map((s) => s.row)),
      ).sort()

      const rowOptions: SearchableOption[] = uniqueRows.map((r) => {
        const seatsInRow = filteredSeats.filter((s) => s.row === r)
        const minSeat = Math.min(...seatsInRow.map((s) => s.number))
        const maxSeat = Math.max(...seatsInRow.map((s) => s.number))
        const secName =
          seatsInRow[0]?.seatSection || seatsInRow[0]?.categoryName || ""
        return {
          value: `Row ${r}`,
          label: `Row ${r}`,
          sublabel: `Seats ${minSeat}–${maxSeat}${
            secName ? ` (${secName})` : ""
          }`,
        }
      })

      const specificSeatOptions: SearchableOption[] = filteredSeats.map((s) => {
        const secName = s.seatSection || s.categoryName
        return {
          value: `Row ${s.row} · Seat ${s.number}`,
          label: `Row ${s.row} · Seat ${s.number}`,
          sublabel: `${secName ? `${secName} · ` : ""}${s.categoryName}${
            s.isAccessible ? " (Wheelchair)" : ""
          }`,
        }
      })

      return [...rowOptions, ...specificSeatOptions]
    }

    if (selectedEvent.rows && selectedEvent.rows > 0) {
      const generated: SearchableOption[] = []
      for (let r = 1; r <= Math.min(selectedEvent.rows, 26); r++) {
        const rowLetter = String.fromCharCode(64 + r)
        generated.push({
          value: `Row ${rowLetter}`,
          label: `Row ${rowLetter}`,
          sublabel: `Seats 1–${selectedEvent.cols ?? 10}`,
        })
      }
      return generated
    }

    return [
      { value: "Row A", label: "Row A", sublabel: "Front Row" },
      { value: "Row B", label: "Row B", sublabel: "Tier 1" },
      { value: "Row C", label: "Row C", sublabel: "Tier 1" },
      { value: "General", label: "General", sublabel: "Open Seating" },
    ]
  }, [effectiveEventId, selectedEvent, seatSectionInput, eventSeats])

  // When venue changes or is cleared, reset event, section and row/seat selections to empty
  const prevVenueRef = useRef(seatVenueInput)
  useEffect(() => {
    if (prevVenueRef.current !== seatVenueInput) {
      prevVenueRef.current = seatVenueInput
      setSeatEventIdInput("")
      setSeatSectionInput("")
      setSeatRowInput("")
    }
  }, [seatVenueInput])

  // When event changes or is cleared, reset section and row/seat selections to empty
  const prevEventIdRef = useRef(seatEventIdInput)
  useEffect(() => {
    if (prevEventIdRef.current !== seatEventIdInput) {
      prevEventIdRef.current = seatEventIdInput
      setSeatSectionInput("")
      setSeatRowInput("")
    }
  }, [seatEventIdInput])

  // When section changes, reset row/seat selection to empty
  const prevSectionRef = useRef(seatSectionInput)
  useEffect(() => {
    if (prevSectionRef.current !== seatSectionInput) {
      prevSectionRef.current = seatSectionInput
      setSeatRowInput("")
    }
  }, [seatSectionInput])

  // If selected section becomes invalid when options change, clear it (do not auto-populate)
  useEffect(() => {
    if (
      seatSectionInput &&
      sectionOptions.length > 0 &&
      !sectionOptions.some(
        (s) => s.value.toLowerCase() === seatSectionInput.toLowerCase(),
      )
    ) {
      setSeatSectionInput("")
    }
  }, [sectionOptions, seatSectionInput])

  // If selected row/seat becomes invalid when options change, clear it (do not auto-populate)
  useEffect(() => {
    if (
      seatRowInput &&
      rowSeatOptions.length > 0 &&
      !rowSeatOptions.some(
        (r) => r.value.toLowerCase() === seatRowInput.toLowerCase(),
      )
    ) {
      setSeatRowInput("")
    }
  }, [rowSeatOptions, seatRowInput])

  // Open 360 viewer modal
  const handleOpenEaseExplore = useCallback(
    async (sectionOverride?: string) => {
      const targetEventId = gallerySearchFilter?.eventId || seatEventIdInput
      // Event is optional for EaseXplore 360° views - resolve event if ID provided or by matching venue
      const ev = targetEventId
        ? events.find((e) => e.id === targetEventId)
        : seatVenueInput
          ? events.find(
              (e) => e.venue.toLowerCase() === seatVenueInput.toLowerCase(),
            )
          : events[0]

      const targetVenueName = seatVenueInput || ev?.venue || "Venue"

      const targetSection =
        sectionOverride ||
        (selectedGallerySection !== "all" ? selectedGallerySection : null) ||
        gallerySearchFilter?.section ||
        seatSectionInput ||
        (sectionOptions[0]?.value ?? "Main Seating")

      const secLower = targetSection.toLowerCase()
      const matched =
        secLower.includes("balcony") ||
        secLower.includes("concession") ||
        secLower.includes("upper") ||
        secLower.includes("tier 3")
          ? vantagePoints[2]
          : secLower.includes("accessible") ||
              secLower.includes("wheelchair") ||
              secLower.includes("step-free")
            ? vantagePoints[3]
            : secLower.includes("vip") ||
                secLower.includes("cat 1") ||
                secLower.includes("floor") ||
                secLower.includes("pen") ||
                secLower.includes("stage")
              ? vantagePoints[0]
              : vantagePoints[1]

      let externalTourUrl: string | null = null
      let detectedVenueName = targetVenueName

      if (ev?.id) {
        try {
          const layout = await backendGetEventLayout(ev.id)
          if (layout?.easeexplore360Url) {
            externalTourUrl = layout.easeexplore360Url
          }
          if (layout?.venueName) {
            detectedVenueName = layout.venueName
          }
        } catch {
          // Layout endpoint optional
        }
      }

      const finalVenueName = detectedVenueName || targetVenueName || "Venue"

      setPreview360Photo({
        url: matched.image,
        title:
          targetEventId && ev?.title
            ? `${finalVenueName} · ${ev.title}`
            : finalVenueName,
        section: targetSection,
        elevation: matched.elevation,
        fov: matched.fov,
        externalTourUrl,
        venueName: finalVenueName,
      })
    },
    [
      gallerySearchFilter,
      seatVenueInput,
      seatEventIdInput,
      events,
      selectedGallerySection,
      seatSectionInput,
      sectionOptions,
    ],
  )

  // Like EasePix
  const handleLikeEasePix = async (pixId: string) => {
    try {
      await backendLikeEasePix(pixId)
      await reloadCommunityData()
      onShowToast("Liked EasePix photo! ❤️")
    } catch {
      onShowToast("Liked EasePix photo! ❤️")
    }
  }

  // Find seat views search action
  const handleFindSeatViews = () => {
    if (!seatVenueInput && !seatEventIdInput) {
      onShowToast("Please select a venue to search seat views")
      return
    }
    setHasSearched(true)

    const searchedSec = seatSectionInput.trim()
    const searchedRow = seatRowInput.trim()

    const matchedSecObj = searchedSec
      ? sectionOptions.find(
          (sec) =>
            sec.value.toLowerCase() === searchedSec.toLowerCase() ||
            sec.label.toLowerCase().includes(searchedSec.toLowerCase()) ||
            searchedSec.toLowerCase().includes(sec.label.toLowerCase()),
        )
      : null

    let deducedSection = ""
    if (!searchedSec && searchedRow && eventSeats.length > 0) {
      const matchedSeat = eventSeats.find(
        (s) =>
          isSeatMatch(searchedRow, `Row ${s.row}`) ||
          isSeatMatch(searchedRow, `${s.row}-${s.number}`),
      )
      if (matchedSeat?.seatSection) {
        deducedSection = matchedSeat.seatSection
      }
    }

    const targetSection = matchedSecObj
      ? matchedSecObj.value
      : searchedSec || deducedSection || "all"

    setGallerySearchFilter({
      eventId: seatEventIdInput,
      section: searchedSec || (deducedSection ? deducedSection : undefined),
      row: searchedRow || undefined,
    })
    setSelectedGallerySection(targetSection)

    const evTitle =
      events.find((e) => e.id === seatEventIdInput)?.title ?? "Selected Event"
    const venueName =
      seatVenueInput ||
      events.find((e) => e.id === seatEventIdInput)?.venue ||
      evTitle
    if (targetSection !== "all" && searchedRow) {
      onShowToast(`Showing ${targetSection} · ${searchedRow} (Highlighted)`)
    } else if (targetSection !== "all") {
      onShowToast(`Showing ${targetSection} seat views`)
    } else {
      onShowToast(`Showing seat views for ${venueName}`)
    }
    scrollToSection("seat-search-results")
  }

  // Clear search filter
  const handleClearSearchFilter = () => {
    setGallerySearchFilter(null)
    setHasSearched(false)
    setSelectedGallerySection("all")
    setSeatVenueInput("")
    setSeatEventIdInput("")
    setSeatSectionInput("")
    setSeatRowInput("")
    onShowToast("Search filters cleared")
  }

  // Dynamic section calculation
  const { orderedSections, sectionsToDisplay, totalPhotos } = useMemo(() => {
    const targetEventId = gallerySearchFilter?.eventId || effectiveEventId
    if (!targetEventId && !seatVenueInput) {
      return { orderedSections: [], sectionsToDisplay: [], totalPhotos: 0 }
    }

    const venueEvents = seatVenueInput
      ? events
          .filter((e) => e.venue.toLowerCase() === seatVenueInput.toLowerCase())
          .map((e) => e.id)
      : []

    const userEventPhotos = displayPosts.filter((p) => {
      if (!p.photo) return false
      if (seatEventIdInput) return p.eventId === seatEventIdInput
      if (venueEvents.length > 0) return venueEvents.includes(p.eventId)
      return p.eventId === targetEventId
    })
    const backendEventPix = backendEasePixList.filter((pix) => {
      if (seatEventIdInput && pix.eventId) return pix.eventId === seatEventIdInput
      if (seatVenueInput) {
        if (pix.venueName && pix.venueName.toLowerCase().includes(seatVenueInput.toLowerCase())) {
          return true
        }
        if (pix.eventId && venueEvents.includes(pix.eventId)) {
          return true
        }
      }
      if (targetEventId && pix.eventId === targetEventId) return true
      return false
    })

    const searchedRow = (gallerySearchFilter?.row || seatRowInput || "").trim()
    const matchesSearchedSeat = (seatStr: string) =>
      isSeatMatch(searchedRow, seatStr)
    const searchedSecTrimmed = (
      gallerySearchFilter?.section ||
      seatSectionInput ||
      ""
    ).trim()

    const baseCatalog: SectionSegment[] = sectionOptions.map((opt) => {
      const secName = opt.label
      const secSeats = eventSeats.filter(
        (s) => s.seatSection.toLowerCase() === secName.toLowerCase(),
      )
      const rows = Array.from(new Set(secSeats.map((s) => s.row))).sort()
      const rowRange =
        rows.length > 0
          ? rows.length > 1
            ? `Rows ${rows[0]} – ${rows[rows.length - 1]}`
            : `Row ${rows[0]}`
          : "General Seating"

      return {
        id: `sec-${secName.toLowerCase().replace(/\s+/g, "-")}`,
        name: secName,
        tier: opt.sublabel ?? "Reserved Tier",
        rowRange,
        photos: [],
      }
    })

    // Include any custom sections found in uploaded photos for this venue
    backendEventPix.forEach((pix) => {
      if (
        pix.section &&
        !baseCatalog.some((sec) =>
          matchesSectionQuery(sec.name, pix.section),
        )
      ) {
        baseCatalog.push({
          id: `sec-${pix.section.toLowerCase().replace(/\s+/g, "-")}`,
          name: pix.section,
          tier: "Venue Seating",
          rowRange: pix.rowLabel ? `Row ${pix.rowLabel}` : "General",
          photos: [],
        })
      }
    })

    if (
      searchedSecTrimmed &&
      !baseCatalog.some((sec) =>
        matchesSectionQuery(sec.name, searchedSecTrimmed),
      )
    ) {
      baseCatalog.push({
        id: `sec-${searchedSecTrimmed.toLowerCase().replace(/\s+/g, "-")}`,
        name: searchedSecTrimmed,
        tier: "Reserved Seating",
        rowRange: "General Tier",
        photos: [],
      })
    }

    const searchedSectionQuery = (
      gallerySearchFilter?.section ||
      seatSectionInput ||
      ""
    )
      .trim()
      .toLowerCase()

    const dynamicSections = baseCatalog.map((sec) => {
      const matchedBackendPix: SectionSeatPhoto[] = backendEventPix
        .filter((pix) => {
          const secNorm = sec.name.toLowerCase().replace(/^section\s+/i, "")
          const pixSecNorm = pix.section
            .toLowerCase()
            .replace(/^section\s+/i, "")
          return pixSecNorm.includes(secNorm) || secNorm.includes(pixSecNorm)
        })
        .map((pix) => ({
          photo: pix.photoUrl,
          authorName: pix.authorName,
          section: sec.name,
          seat: pix.rowLabel
            ? pix.seatNumber
              ? `${sec.name} · Row ${pix.rowLabel} Seat ${pix.seatNumber}`
              : `${sec.name} · ${pix.rowLabel}`
            : `${sec.name} · Verified Seat`,
          vibe: pix.caption || "Sightline view from this seat",
          isVerified: pix.isVerified,
          pixId: pix.id,
          likesCount: pix.likesCount,
        }))

      const matchedUserPosts: SectionSeatPhoto[] = userEventPhotos
        .filter((p) => {
          if (!p.section) return false
          const secNorm = sec.name.toLowerCase().replace(/^section\s+/i, "")
          const postSecNorm = p.section
            .toLowerCase()
            .replace(/^section\s+/i, "")
          return postSecNorm.includes(secNorm) || secNorm.includes(postSecNorm)
        })
        .map((p) => ({
          photo: p.photo!,
          authorName: p.author,
          section: sec.name,
          seat: p.seatLabel
            ? `${sec.name} · ${p.seatLabel}`
            : p.section
              ? `${p.section}`
              : `${sec.name} · Verified Seat`,
          vibe: p.body.slice(0, 85) + (p.body.length > 85 ? "…" : ""),
          isVerified: p.isVerified ?? true,
        }))

      const seenPhotos = new Set<string>()
      const allSecPhotos: SectionSeatPhoto[] = []
      for (const item of [...matchedBackendPix, ...matchedUserPosts]) {
        if (!seenPhotos.has(item.photo)) {
          seenPhotos.add(item.photo)
          allSecPhotos.push(item)
        }
      }

      const isTargetSection = Boolean(
        searchedSectionQuery
          ? matchesSectionQuery(sec.name, searchedSectionQuery)
          : true,
      )

      let prioritizedPhotos: SectionSeatPhoto[]
      if (searchedRow && isTargetSection) {
        const matchingPhotos = allSecPhotos.filter((p) =>
          matchesSearchedSeat(p.seat),
        )
        const remainingPhotos = allSecPhotos.filter(
          (p) => !matchesSearchedSeat(p.seat),
        )

        if (matchingPhotos.length > 0) {
          prioritizedPhotos = [...matchingPhotos, ...remainingPhotos]
        } else if (allSecPhotos.length > 0) {
          const targetKey = parseSeatKey(searchedRow)
          let closestBeforePhoto: SectionSeatPhoto | null = null
          let maxBeforeDiff = -Infinity
          let closestAfterPhoto: SectionSeatPhoto | null = null
          let minAfterDiff = Infinity

          allSecPhotos.forEach((p) => {
            const pKey = parseSeatKey(p.seat)
            if (targetKey.type !== "unknown" && pKey.type === targetKey.type) {
              const diff = pKey.val - targetKey.val
              if (diff < 0 && diff > maxBeforeDiff) {
                maxBeforeDiff = diff
                closestBeforePhoto = p
              } else if (diff > 0 && diff < minAfterDiff) {
                minAfterDiff = diff
                closestAfterPhoto = p
              }
            }
          })

          if (
            !closestBeforePhoto &&
            !closestAfterPhoto &&
            allSecPhotos.length > 0
          ) {
            closestAfterPhoto = allSecPhotos[0]
          }

          const closestPair = [closestBeforePhoto, closestAfterPhoto].filter(
            Boolean,
          ) as SectionSeatPhoto[]
          const others = allSecPhotos.filter((p) => !closestPair.includes(p))
          prioritizedPhotos = [...closestPair, ...others]
        } else {
          prioritizedPhotos = allSecPhotos
        }
      } else {
        prioritizedPhotos = allSecPhotos
      }

      return {
        ...sec,
        photos: prioritizedPhotos,
      }
    })

    let ordered = dynamicSections
    if (searchedSectionQuery) {
      ordered = [...dynamicSections].sort((a, b) => {
        const aMatch = matchesSectionQuery(a.name, searchedSectionQuery)
        const bMatch = matchesSectionQuery(b.name, searchedSectionQuery)
        if (aMatch && !bMatch) return -1
        if (!aMatch && bMatch) return 1
        return 0
      })
    }

    const total = ordered.reduce((sum, sec) => sum + sec.photos.length, 0)

    const toDisplay =
      selectedGallerySection === "all"
        ? ordered
        : ordered.filter(
            (sec) =>
              sec.name
                .toLowerCase()
                .includes(selectedGallerySection.toLowerCase()) ||
              selectedGallerySection
                .toLowerCase()
                .includes(sec.name.toLowerCase()),
          )

    return {
      orderedSections: ordered,
      sectionsToDisplay: toDisplay,
      totalPhotos: total,
    }
  }, [
    gallerySearchFilter,
    seatEventIdInput,
    displayPosts,
    backendEasePixList,
    seatRowInput,
    seatSectionInput,
    sectionOptions,
    eventSeats,
    selectedGallerySection,
  ])

  return {
    seatVenueInput,
    setSeatVenueInput,
    venueOptions,
    handleSeatVenueInputChange,
    seatEventIdInput,
    setSeatEventIdInput,
    eventOptions,
    handleSeatEventIdInputChange,
    seatSectionInput,
    setSeatSectionInput,
    seatRowInput,
    setSeatRowInput,
    seatPhotoInput,
    setSeatPhotoInput,
    gallerySearchFilter,
    setGallerySearchFilter,
    hasSearched,
    setHasSearched,
    selectedGallerySection,
    setSelectedGallerySection,
    isShareModalOpen,
    setIsShareModalOpen,
    shareModalOrigin,
    setShareModalOrigin,
    preview360Photo,
    setPreview360Photo,
    eventSeats,
    loadingSeats,
    sectionOptions,
    rowSeatOptions,
    orderedSections,
    sectionsToDisplay,
    totalPhotos,
    handleOpenEaseExplore,
    handleLikeEasePix,
    handleFindSeatViews,
    handleClearSearchFilter,
  }
}
