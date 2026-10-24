import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { fetchSeats, type LiveSeat } from "../lib/ticketingApi";
import {
  backendGetEventLayout,
  formatMediaEmbedUrl,
  backendListPosts,
  backendCreatePost,
  backendLikePost,
  backendListEasePix,
  backendCreateEasePix,
  backendLikeEasePix,
  type BackendCommunityPost,
  type BackendEasePix,
  type BackendEasePixCreate,
} from "../lib/backendApi";
import {

  Users,
  Repeat,
  Camera,
  Rotate3d,
  Heart,
  ShieldCheck,
  Accessibility,
  Send,
  Share2,
  MessageSquare,
  Sparkles,
  Tag,
  Volume2,
  VolumeX,
  Bookmark,
  Clock,
  Image as ImageIcon,
  Flame,
  CheckCircle2,
  Calendar,
  MapPin,
  X,
  Lock,
  LogIn,
  QrCode,
  Eye,
  Compass,
  Layers,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Video,
  Upload,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Button, Badge, Card, Textarea, cx } from "../components/ui";
import SecureExchange from "../components/SecureExchange";

const vantagePoints = [
  {
    id: "stage",
    label: "Stage Front Perspective",
    desc: "Direct line of sight in front of the artist. Zero head obstruction.",
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=85",
    elevation: "Ground Level (0m)",
    fov: "160° Panoramic",
  },
  {
    id: "center",
    label: "Lower Bowl Perspective",
    desc: "Optimal acoustics and balanced sightlines facing the main performance area.",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85",
    elevation: "+2.5m Tiered",
    fov: "140° Panoramic",
  },
  {
    id: "balcony",
    label: "Elevated Tier Perspective",
    desc: "Bird’s-eye perspective overlooking the stage, venue crowd, and lighting effects.",
    image: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=85",
    elevation: "+8.0m Tiered",
    fov: "180° Panoramic",
  },
  {
    id: "accessible",
    label: "Accessible Platform · Step-Free",
    desc: "Elevated wheelchair bay with unobstructed sightlines above standing fans.",
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85",
    elevation: "+3.2m Platform",
    fov: "150° Panoramic",
  },
] as const;

const allTabs = [
  { id: "feed", label: "EaseConnect", icon: Users, desc: "Discussions & fan forums" },
  { id: "views", label: "EasePix & EaseXplore", icon: Camera, desc: "Seat sharing & 360° views" },
  { id: "exchange", label: "EaseExchange", icon: Repeat, desc: "Ticket swaps" },
] as const;

type CommsChannelId = "feed" | "views";

type FilterType = "all" | "following" | "views" | "questions";

interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SectionSeatPhoto {
  photo: string;
  authorName: string;
  section: string;
  seat: string;
  vibe: string;
  isVerified?: boolean;
  pixId?: string;
  likesCount?: number;
}

interface SectionSegment {
  id: string;
  name: string;
  tier: string;
  rowRange: string;
  photos: SectionSeatPhoto[];
}

function parseSeatKey(seatStr: string): { type: "letter" | "number" | "unknown"; val: number } {
  const rowMatch = seatStr.match(/row\s*([a-z]+|[0-9]+)/i);
  if (rowMatch) {
    const raw = rowMatch[1];
    if (/^[0-9]+$/.test(raw)) {
      return { type: "number", val: parseInt(raw, 10) };
    }
    let score = 0;
    for (let i = 0; i < raw.length; i++) {
      score = score * 26 + (raw.toUpperCase().charCodeAt(i) - 64);
    }
    return { type: "letter", val: score };
  }

  const letterMatch = seatStr.match(/\b([a-z]{1,2})\b/i);
  if (letterMatch) {
    const raw = letterMatch[1];
    let score = 0;
    for (let i = 0; i < raw.length; i++) {
      score = score * 26 + (raw.toUpperCase().charCodeAt(i) - 64);
    }
    return { type: "letter", val: score };
  }

  const numMatch = seatStr.match(/\b([0-9]+)\b/);
  if (numMatch) {
    return { type: "number", val: parseInt(numMatch[1], 10) };
  }

  return { type: "unknown", val: 0 };
}

function parseSeatParts(str: string): { row: string | null; seat: string | null; norm: string } {
  const norm = str.toLowerCase().trim();
  const rowMatch = norm.match(/\brow\s*([a-z0-9]+)\b/i);
  const seatMatch = norm.match(/\bseat\s*([0-9]+|[a-z0-9]+)\b/i);

  let standaloneRow: string | null = null;
  let standaloneNum: string | null = null;

  if (!rowMatch && !seatMatch) {
    const singleLetterMatch = norm.match(/\b([a-z]{1,2})\b/i);
    if (singleLetterMatch) standaloneRow = singleLetterMatch[1].toLowerCase();
    const numMatch = norm.match(/\b([0-9]+)\b/);
    if (numMatch) standaloneNum = numMatch[1].replace(/^0+/, "");
  }

  const row = (rowMatch ? rowMatch[1] : standaloneRow)?.toLowerCase() ?? null;
  const rawSeat = seatMatch ? seatMatch[1] : standaloneNum;
  const seat = rawSeat ? rawSeat.replace(/^0+/, "") : null;

  return { row, seat, norm };
}

function isSeatMatch(searchedStr: string, seatStr: string): boolean {
  if (!searchedStr || !seatStr) return false;
  const search = parseSeatParts(searchedStr);
  const target = parseSeatParts(seatStr);

  // If user searched for both row and seat (e.g., "Row A Seat 12")
  if (search.row && search.seat) {
    return target.row === search.row && target.seat === search.seat;
  }

  // If user searched for specific row (e.g., "Row A" or "A")
  if (search.row && !search.seat) {
    return target.row === search.row;
  }

  // If user searched for specific seat number (e.g., "Seat 12" or "12")
  if (!search.row && search.seat) {
    return target.seat === search.seat || target.row === search.seat;
  }

  // Fallback for custom descriptive strings: check word-level token match with stop words excluded
  const stopWords = new Set(["row", "seat", "seats", "section", "sec"]);
  const searchTokens = search.norm
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok && !stopWords.has(tok));

  if (searchTokens.length === 0) return false;

  const targetTokens = new Set(
    target.norm
      .replace(/[^a-z0-9]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^0+/, ""))
  );

  return searchTokens.every((tok) => targetTokens.has(tok.replace(/^0+/, "")));
}

function matchesSectionQuery(sectionName: string, query: string): boolean {
  if (!query) return false;
  const sName = sectionName.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (sName === q) return true;

  const cleanS = sName.replace(/^section\s+/i, "").trim();
  const cleanQ = q.replace(/^section\s+/i, "").trim();
  if (cleanS === cleanQ) return true;

  if (q.includes("section") && !sName.includes("section")) return false;
  if (sName.includes("section") && !q.includes("section")) {
    return cleanS === cleanQ;
  }

  return false;
}

const sectionDataCatalog: SectionSegment[] = [];

function SearchableCombobox({
  label,
  placeholder,
  value,
  onChange,
  options,
  allowCustom = true,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  options: SearchableOption[];
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value || opt.label === value);
  const displayValue = isOpen ? query : (selectedOption ? selectedOption.label : value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!value) {
      setQuery("");
    }
  }, [value]);

  const filteredOptions = options.filter((opt) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      opt.label.toLowerCase().includes(q) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
      opt.value.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-[11px] font-bold text-brand-deep">
        {label}
      </label>
      <div
        className={cx(
          "relative flex items-center rounded-xl border transition-all",
          disabled
            ? "cursor-not-allowed bg-stone-100 border-stone-200 opacity-60 pointer-events-none"
            : isOpen
            ? "border-brand-purple ring-2 ring-brand-purple/20 bg-white"
            : "border-brand-line bg-brand-warm/30 hover:border-brand-purple/50"
        )}
      >
        <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-muted pointer-events-none" />
        <input
          type="text"
          disabled={disabled}
          value={disabled ? "" : displayValue}
          onFocus={(e) => {
            if (disabled) return;
            setQuery(selectedOption ? selectedOption.label : value);
            setIsOpen(true);
            e.target.select();
          }}
          onChange={(e) => {
            if (disabled) return;
            const next = e.target.value;
            setQuery(next);
            if (allowCustom) {
              onChange(next);
            }
            if (!isOpen) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-2.5 py-2 text-xs font-semibold text-brand-deep outline-none placeholder:font-normal placeholder:text-muted disabled:cursor-not-allowed"
        />
        {!disabled && value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setQuery("");
            }}
            className="p-1 text-muted hover:text-brand-deep cursor-pointer"
            title="Clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            if (!isOpen) {
              setQuery(selectedOption ? selectedOption.label : value);
            }
            setIsOpen(!isOpen);
          }}
          className="mr-2 p-1 text-muted hover:text-brand-deep transition-transform disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronDown
            className={cx("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180 text-brand-purple")}
          />
        </button>
      </div>

      {/* Dropdown Popover */}
      {!disabled && isOpen && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-brand-purple/20 bg-white p-1 shadow-xl backdrop-blur-md">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value || opt.label === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setQuery(opt.label);
                    setIsOpen(false);
                  }}
                  className={cx(
                    "cursor-pointer flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                    isSelected
                      ? "bg-brand-purple text-white font-bold"
                      : "text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple"
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.sublabel && (
                    <span
                      className={cx(
                        "ml-2 text-[10px] shrink-0",
                        isSelected ? "text-white/80" : "text-muted"
                      )}
                    >
                      {opt.sublabel}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-center text-[11px] text-muted">
              {allowCustom && query ? (
                <span>
                  Using custom: <strong className="text-brand-deep font-bold">"{query}"</strong>
                </span>
              ) : (
                <span>No matching options</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PostReplyItem {
  id: string;
  author: string;
  body: string;
  when: string;
  isVerified?: boolean;
}

interface DisplayPost {
  id: string;
  eventId: string;
  author: string;
  body: string;
  section?: string;
  seatLabel?: string;
  photo?: string;
  when: string;
  likes: number;
  isBackend: boolean;
  isVerified?: boolean;
  replies: PostReplyItem[];
}

function formatRelativeWhen(dateStr?: string): string {
  if (!dateStr) return "Just now";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (isNaN(diffMs)) return dateStr;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-SG", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function Community() {
  const { posts, events, user, addPost } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab === "access" ? "views" : (allTabs.find((item) => item.id === requestedTab)?.id ?? "feed");
  const [lastCommsTab, setLastCommsTab] = useState<CommsChannelId>(
    tab === "exchange" ? "feed" : (tab as CommsChannelId)
  );

  const [backendPosts, setBackendPosts] = useState<BackendCommunityPost[]>([]);
  const [backendEasePixList, setBackendEasePixList] = useState<BackendEasePix[]>([]);
  const [openCommentsForPost, setOpenCommentsForPost] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});

  const reloadCommunityData = async () => {
    try {
      const [fetchedPosts, fetchedPix] = await Promise.all([
        backendListPosts().catch(() => []),
        backendListEasePix().catch(() => []),
      ]);
      setBackendPosts(fetchedPosts);
      setBackendEasePixList(fetchedPix);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    reloadCommunityData();
  }, []);

  useEffect(() => {
    if (tab !== "exchange") {
      setLastCommsTab(tab as CommsChannelId);
    }
  }, [tab]);

  const mainSection = tab === "exchange" ? "exchange" : "comms";

  const [draft, setDraft] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [showPhotoInput, setShowPhotoInput] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortOrder, setSortOrder] = useState<"trending" | "newest" | "discussed">("trending");
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [likesCount, setLikesCount] = useState<Record<string, number>>({});
  const [activeVoicePlaying, setActiveVoicePlaying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [preview360Photo, setPreview360Photo] = useState<{
    url: string;
    title: string;
    section?: string;
    elevation?: string;
    fov?: string;
    externalTourUrl?: string | null;
    venueName?: string;
  } | null>(null);

  // EasePix state & EaseExplore
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeVantage, setActiveVantage] = useState<string>("stage");
  const [seatSectionInput, setSeatSectionInput] = useState("");
  const [seatRowInput, setSeatRowInput] = useState("");
  const [seatPhotoInput, setSeatPhotoInput] = useState("");
  const requestedEvent = searchParams.get("event");
  const [seatEventIdInput, setSeatEventIdInput] = useState<string>(requestedEvent ?? "");
  const [gallerySearchFilter, setGallerySearchFilter] = useState<{ eventId?: string; section?: string; row?: string } | null>(
    requestedEvent ? { eventId: requestedEvent } : null
  );
  const [hasSearched, setHasSearched] = useState(Boolean(requestedEvent));
  const [selectedGallerySection, setSelectedGallerySection] = useState<string>("all");
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareModalOrigin, setShareModalOrigin] = useState<"easepix" | "composer">("easepix");
  const [attachedEasePix, setAttachedEasePix] = useState<{
    photo: string;
    section: string;
    row: string;
    eventId?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUploadMode, setPhotoUploadMode] = useState<"file" | "url">("file");

  const handleImageFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file (PNG, JPG, WebP, etc.)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawResult = e.target?.result as string;
      if (!rawResult) return;

      const img = new Image();
      img.onload = () => {
        const maxDim = 1400;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL("image/jpeg", 0.82);
            setSeatPhotoInput(compressed);
            showToast("Photo loaded and optimized! ✨");
            return;
          }
        }
        setSeatPhotoInput(rawResult);
        showToast("Photo loaded from your device! ✨");
      };
      img.onerror = () => {
        setSeatPhotoInput(rawResult);
        showToast("Photo loaded! ✨");
      };
      img.src = rawResult;
    };
    reader.onerror = () => {
      showToast("Could not read image file");
    };
    reader.readAsDataURL(file);
  };

  // Live real seats fetched dynamically for the selected event
  const [eventSeats, setEventSeats] = useState<LiveSeat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  useEffect(() => {
    if (!seatEventIdInput) {
      setEventSeats([]);
      return;
    }
    let active = true;
    setLoadingSeats(true);
    fetchSeats(seatEventIdInput)
      .then((seats) => {
        if (active) {
          setEventSeats(seats);
          setLoadingSeats(false);
        }
      })
      .catch(() => {
        if (active) {
          setEventSeats([]);
          setLoadingSeats(false);
        }
      });
    return () => {
      active = false;
    };
  }, [seatEventIdInput]);

  const selectedEvent = events.find((e) => e.id === seatEventIdInput);

  // Real section options derived strictly from eventSeats or event tiers (NO example/mock values)
  const sectionOptions: SearchableOption[] = useMemo(() => {
    if (!seatEventIdInput || !selectedEvent) return [];

    const seatSections = Array.from(new Set(eventSeats.map((s) => s.seatSection || s.categoryName).filter(Boolean)));
    if (seatSections.length > 0) {
      return seatSections.map((sec) => {
        const secSeats = eventSeats.filter((s) => (s.seatSection || s.categoryName) === sec);
        const rows = Array.from(new Set(secSeats.map((s) => s.row))).sort();
        const minRow = rows[0];
        const maxRow = rows[rows.length - 1];
        const rowRange = rows.length > 1 ? `Rows ${minRow}–${maxRow}` : `Row ${minRow}`;
        return {
          value: sec,
          label: sec,
          sublabel: `${secSeats.length} seats · ${rowRange}`,
        };
      });
    }

    if (selectedEvent.tiers && selectedEvent.tiers.length > 0) {
      return selectedEvent.tiers.map((t) => ({
        value: t.name,
        label: t.name,
        sublabel: `S$${t.price.toFixed(2)} · ${t.total} seats`,
      }));
    }

    return [];
  }, [seatEventIdInput, selectedEvent, eventSeats]);

  // Real row and seat options derived strictly from the event's actual seats
  const rowSeatOptions: SearchableOption[] = useMemo(() => {
    if (!seatEventIdInput || !selectedEvent) return [];

    const filteredSeats = seatSectionInput
      ? eventSeats.filter((s) => (s.seatSection || s.categoryName).toLowerCase() === seatSectionInput.toLowerCase())
      : eventSeats;

    if (filteredSeats.length > 0) {
      const uniqueRows = Array.from(new Set(filteredSeats.map((s) => s.row))).sort();

      const rowOptions: SearchableOption[] = uniqueRows.map((r) => {
        const seatsInRow = filteredSeats.filter((s) => s.row === r);
        const minSeat = Math.min(...seatsInRow.map((s) => s.number));
        const maxSeat = Math.max(...seatsInRow.map((s) => s.number));
        const secName = seatsInRow[0]?.seatSection || seatsInRow[0]?.categoryName || "";
        return {
          value: `Row ${r}`,
          label: `Row ${r}`,
          sublabel: `Seats ${minSeat}–${maxSeat}${secName ? ` (${secName})` : ""}`,
        };
      });

      const specificSeatOptions: SearchableOption[] = filteredSeats.map((s) => {
        const secName = s.seatSection || s.categoryName;
        return {
          value: `Row ${s.row} · Seat ${s.number}`,
          label: `Row ${s.row} · Seat ${s.number}`,
          sublabel: `${secName ? `${secName} · ` : ""}${s.categoryName}${s.isAccessible ? " (Wheelchair)" : ""}`,
        };
      });

      return [...rowOptions, ...specificSeatOptions];
    }

    if (selectedEvent.rows && selectedEvent.rows > 0) {
      const generated: SearchableOption[] = [];
      for (let r = 1; r <= Math.min(selectedEvent.rows, 26); r++) {
        const rowLetter = String.fromCharCode(64 + r);
        generated.push({
          value: `Row ${rowLetter}`,
          label: `Row ${rowLetter}`,
          sublabel: `Seats 1–${selectedEvent.cols ?? 10}`,
        });
      }
      return generated;
    }

    return [];
  }, [seatEventIdInput, selectedEvent, seatSectionInput, eventSeats]);

  const handleOpenEaseExplore = async (sectionOverride?: string) => {
    const targetEventId = gallerySearchFilter?.eventId || seatEventIdInput;
    if (!targetEventId) {
      showToast("Please select an event to open EaseXplore 360° views");
      return;
    }
    const ev = events.find((e) => e.id === targetEventId);
    if (!ev) {
      showToast("Selected event not found");
      return;
    }

    const targetSection =
      sectionOverride ||
      (selectedGallerySection !== "all" ? selectedGallerySection : null) ||
      gallerySearchFilter?.section ||
      seatSectionInput ||
      (sectionOptions[0]?.value ?? "Main Seating");

    const secLower = targetSection.toLowerCase();
    const matched =
      secLower.includes("balcony") || secLower.includes("concession") || secLower.includes("upper") || secLower.includes("tier 3")
        ? vantagePoints[2]
        : secLower.includes("accessible") || secLower.includes("wheelchair") || secLower.includes("step-free")
        ? vantagePoints[3]
        : secLower.includes("vip") || secLower.includes("cat 1") || secLower.includes("floor") || secLower.includes("pen") || secLower.includes("stage")
        ? vantagePoints[0]
        : vantagePoints[1];

    let externalTourUrl: string | null = null;
    let detectedVenueName = ev.venue || "";

    try {
      const layout = await backendGetEventLayout(targetEventId);
      if (layout?.easeexplore360Url) {
        externalTourUrl = layout.easeexplore360Url;
      }
      if (layout?.venueName) {
        detectedVenueName = layout.venueName;
      }
    } catch {
      // Layout endpoint optional
    }

    const finalVenueName = detectedVenueName || ev.venue || "Venue";

    setPreview360Photo({
      url: matched.image,
      title: `${finalVenueName} · ${ev.title}`,
      section: targetSection,
      elevation: matched.elevation,
      fov: matched.fov,
      externalTourUrl,
      venueName: finalVenueName,
    });
  };

  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const scrollToSection = (targetId: string = "main-tabs-nav") => {
    setTimeout(() => {
      const element = document.getElementById(targetId);
      if (element) {
        const navBar = document.querySelector("header");
        const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 64;
        const yOffset = -(navBarHeight + 16); // offset so header sits cleanly below sticky navbar
        const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    }, 50);
  };

  const scrollToTabsIfAbove = () => {
    const element = document.getElementById("main-tabs-nav");
    if (!element) return;
    const navBar = document.querySelector("header");
    const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 64;
    const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
    const targetY = Math.max(0, Math.round(elementTop - navBarHeight - 12));

    // Only scroll if currently above the header (from top of page, or scrolled back up / slightly up)
    if (Math.round(window.pageYOffset) < targetY - 4) {
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  };

  const setTab = (id: (typeof allTabs)[number]["id"]) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", id);
      next.delete("view");
      return next;
    });
    const found = allTabs.find((t) => t.id === id);
    if (found) {
      showToast(`${found.label} selected`);
    }
    scrollToTabsIfAbove();
  };

  // If user arrives specifically targeting exchange, auto-scroll to tabs from the top
  useEffect(() => {
    if (requestedTab === "exchange") {
      scrollToTabsIfAbove();
    }
  }, []);

  const eventName = (id: string) => events.find((e) => e.id === id)?.title ?? "Live Music";

  // Initialize event id for tagging
  useEffect(() => {
    if (events.length > 0 && !selectedEventId) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Build unified list of posts combining backend posts with mock posts
  const displayPosts: DisplayPost[] = useMemo(() => {
    const bPosts: DisplayPost[] = backendPosts.map((p) => {
      const sec = p.easepix?.section;
      const seat = p.easepix?.rowLabel
        ? p.easepix?.seatNumber
          ? `${p.easepix.rowLabel} · Seat ${p.easepix.seatNumber}`
          : p.easepix.rowLabel
        : undefined;

      return {
        id: p.id,
        eventId: p.eventId || events[0]?.id || "",
        author: p.authorName,
        body: p.content,
        section: sec,
        seatLabel: seat,
        photo: p.easepix?.photoUrl,
        when: formatRelativeWhen(p.createdAt),
        likes: p.likesCount,
        isBackend: true,
        isVerified: p.easepix?.isVerified ?? false,
        replies: (p.replies || []).map((r) => ({
          id: r.id,
          author: r.authorName,
          body: r.content,
          when: formatRelativeWhen(r.createdAt),
          isVerified: r.easepix?.isVerified ?? false,
        })),
      };
    });

    const sPosts: DisplayPost[] = posts.map((p) => ({
      ...p,
      isBackend: false,
      isVerified: true,
      replies: [],
    }));

    return bPosts.length > 0 ? [...bPosts, ...sPosts] : sPosts;
  }, [backendPosts, posts, events]);

  // Handle post likes (persists to backend if isBackend is true)
  const toggleLike = (postId: string, initialLikes: number, isBackend = false) => {
    setLikedPosts((prev) => {
      const isLiked = !prev[postId];
      setLikesCount((prevCounts) => ({
        ...prevCounts,
        [postId]: (prevCounts[postId] ?? initialLikes) + (isLiked ? 1 : -1),
      }));
      showToast(isLiked ? "Added to your liked posts ❤️" : "Unliked post");
      return { ...prev, [postId]: isLiked };
    });

    if (isBackend) {
      backendLikePost(postId).catch(() => {});
    }
  };

  // Like an individual EasePix photo
  const handleLikeEasePix = async (pixId: string) => {
    try {
      await backendLikeEasePix(pixId);
      await reloadCommunityData();
      showToast("Liked EasePix photo! ❤️");
    } catch {
      showToast("Liked EasePix photo! ❤️");
    }
  };

  // Submit reply / comment on a post (comments only for a post)
  const submitReply = async (postId: string, eventId: string) => {
    const text = (replyDrafts[postId] || "").trim();
    if (!text) {
      showToast("Write a reply before sending");
      return;
    }
    if (!user) {
      showToast("Please sign in to leave a comment.");
      navigate("/login");
      return;
    }

    setSubmittingReply((prev) => ({ ...prev, [postId]: true }));
    try {
      await backendCreatePost({
        content: text,
        eventId,
        parentId: postId,
        authorName: user.name,
      });
      setReplyDrafts((prev) => ({ ...prev, [postId]: "" }));
      await reloadCommunityData();
      showToast("Comment posted! 💬");
    } catch (err: any) {
      showToast(err?.message || "Failed to post comment");
    } finally {
      setSubmittingReply((prev) => ({ ...prev, [postId]: false }));
    }
  };

  // Submit new post
  const submitPost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!draft.trim()) {
      showToast("Write a little something before sharing.");
      textareaRef.current?.focus();
      return;
    }
    if (!user) {
      showToast("Please sign in to join the conversation.");
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      navigate("/login");
      return;
    }

    const targetEventId = selectedEventId || attachedEasePix?.eventId || events[0]?.id || "";
    const photoToSubmit = attachedEasePix?.photo || photoUrl.trim() || undefined;
    const sectionToSubmit = attachedEasePix?.section || undefined;
    const rowToSubmit = attachedEasePix?.row || undefined;

    try {
      let easepixPayload: BackendEasePixCreate | undefined = undefined;
      if (photoToSubmit && sectionToSubmit) {
        const parts = rowToSubmit ? parseSeatParts(rowToSubmit) : null;
        easepixPayload = {
          eventId: targetEventId,
          section: sectionToSubmit,
          rowLabel: parts?.row || rowToSubmit || undefined,
          seatNumber: parts?.seat ? parseInt(parts.seat, 10) : undefined,
          photoUrl: photoToSubmit,
          caption: `View from ${sectionToSubmit} ${rowToSubmit || ""}`.trim(),
          authorName: user.name,
        };
      }

      await backendCreatePost({
        content: draft.trim(),
        eventId: targetEventId,
        authorName: user.name,
        easepix: easepixPayload,
      });

      addPost({
        eventId: targetEventId,
        author: user.name.split(" ")[0] || "You",
        body: draft.trim(),
        section: sectionToSubmit,
        seatLabel: rowToSubmit,
        photo: photoToSubmit,
      });

      if (photoToSubmit) {
        setHasSearched(true);
        setGallerySearchFilter({
          eventId: targetEventId,
          section: sectionToSubmit,
        });
      }

      await reloadCommunityData();
      setDraft("");
      setPhotoUrl("");
      setAttachedEasePix(null);
      setShowPhotoInput(false);
      showToast("Your post and EasePix seat view have been shared to EaseConnect! ✨");
    } catch (err: any) {
      showToast(err?.message || "Failed to share post");
    }
  };

  // EaseVoice narration toggle
  const toggleEaseVoice = () => {
    if (!("speechSynthesis" in window)) {
      showToast("Speech synthesis is not supported on this device.");
      return;
    }

    if (activeVoicePlaying) {
      window.speechSynthesis.cancel();
      setActiveVoicePlaying(false);
      showToast("EaseVoice audio paused.");
    } else {
      const topPost = displayPosts[0];
      const textToSpeak = topPost
        ? `EaseVoice narration. Community post by ${topPost.author} on ${eventName(topPost.eventId)}. ${topPost.body}`
        : "Welcome to EaseComms. The night is better together. Discover real seat views, trade tickets securely, and find your people.";

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.onend = () => setActiveVoicePlaying(false);
      utterance.onerror = () => setActiveVoicePlaying(false);

      window.speechSynthesis.speak(utterance);
      setActiveVoicePlaying(true);
      showToast("Playing EaseVoice feed narration ▷");
    }
  };

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Filtered posts
  const filteredPosts = displayPosts.filter((p) => {
    if (filter === "views") return Boolean(p.photo);
    if (filter === "questions") return p.body.includes("?") || p.body.toLowerCase().includes("ask");
    if (filter === "following") return p.author === "Nadia" || p.author === "Jules";
    return true;
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* 1. CINEMATIC LIVE-EVENT HERO BANNER */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/20 shadow-2xl transition-all">
        {/* Background Image & Multi-Stop Gradients */}
        <div
          className="relative min-h-[360px] sm:min-h-[390px] lg:min-h-[420px] p-6 sm:p-10 lg:p-12 text-white flex flex-col justify-between"
          style={{
            backgroundImage: `
              linear-gradient(90deg, rgba(27,7,44,0.92) 0%, rgba(50,19,79,0.80) 30%, rgba(50,19,79,0.42) 60%, rgba(216,61,165,0.20) 100%),
              linear-gradient(0deg, rgba(20,7,31,0.45) 0%, transparent 50%),
              url('/Neon_Festival_Lights_and_Euphoria.png')
            `,
            backgroundSize: "cover",
            backgroundPosition: "center 48%",
          }}
        >
          {/* Subtle Concentric Rings & Sparkle Overlay */}
          <div className="pointer-events-none absolute -top-40 -right-20 h-96 w-96 rounded-full border border-white/10 shadow-[0_0_0_35px_rgba(255,255,255,0.03),0_0_0_70px_rgba(255,255,255,0.02)]" />
          <div className="pointer-events-none absolute right-8 bottom-6 text-7xl sm:text-8xl lg:text-9xl font-black text-brand-orange/90 opacity-90 select-none drop-shadow-[0_0_40px_rgba(255,101,0,0.5)]">
            ✦
          </div>

          {/* Hero Content */}
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-brand-deep/60 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-brand-lilac backdrop-blur-md">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-orange shadow-[0_0_0_4px_rgba(255,101,0,0.35)] animate-pulse" />
              YOUR PEOPLE. YOUR NEXT BIG NIGHT.
            </div>

            <h1 className="mt-4 font-brand text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[0.96] drop-shadow-md">
              THE NIGHT IS <br />
              <span className="font-feature italic font-black text-brand-orange drop-shadow-[0_4px_28px_rgba(255,101,0,0.45)]">
                BETTER TOGETHER.
              </span>
            </h1>

            <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-brand-warm/95 drop-shadow">
              Find your people. Discover the view. Get hyped before the lights go down.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              {!user ? (
                <button
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    navigate("/login", { state: { returnTo: "/community" } });
                  }}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange to-brand-amber px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-brand-orange/30 transition-transform hover:-translate-y-0.5 hover:shadow-brand-orange/45 active:translate-y-0"
                >
                  Let me in!
                </button>
              ) : (
                <div className="inline-flex items-center gap-2.5 text-base sm:text-lg font-bold text-white drop-shadow">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                  <span className="font-feature italic font-black text-brand-warm tracking-wide text-lg sm:text-xl">
                    ...and you&apos;re in!
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Community Spotlight Feature Card */}
          <div className="relative z-10 mt-8 w-full max-w-[285px] sm:self-end lg:absolute lg:right-8 lg:bottom-8 lg:mt-0">
            <div
              onClick={() => setTab("views")}
              className="cursor-pointer rounded-2xl border border-white/30 bg-white/10 p-5 text-white shadow-2xl backdrop-blur-xl transform -rotate-2 sm:-rotate-3 transition-all hover:rotate-0 hover:scale-[1.02] duration-300 group"
              title="Click to explore EasePix seat views"
            >
              <div className="flex items-center justify-between text-[9px] font-extrabold tracking-wider text-[#FFC7A6]">
                <span className="flex items-center gap-1">✦ COMMUNITY SPOTLIGHT</span>
                <span className="opacity-80">01 / 01</span>
              </div>

              <h2 className="mt-3.5 font-brand text-2xl font-extrabold leading-tight text-white tracking-tight group-hover:text-brand-orange transition-colors">
                Better views.<br />
                Shared by real fans.
              </h2>

              <p className="mt-2 text-xs leading-relaxed text-[#EADDF4]/90">
                Get a feel for your section before the lights go down.
              </p>

              <div className="mt-4 flex items-center pt-1.5">
                <div className="flex -space-x-1.5 items-center">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-purple text-[10px] font-extrabold text-white ring-2 ring-purple-950/60 shadow-sm">
                    N
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-orange text-[10px] font-extrabold text-white ring-2 ring-purple-950/60 shadow-sm">
                    A
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-magenta text-[10px] font-extrabold text-white ring-2 ring-purple-950/60 shadow-sm">
                    M
                  </span>
                </div>
                <small className="ml-2.5 text-[10px] text-[#F3E7FA]/80 font-medium leading-tight">
                  A different perspective, together.
                </small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. TOP-LEVEL SIDE-BY-SIDE TABS: EaseComms & EaseExchange */}
      <nav
        id="main-tabs-nav"
        aria-label="Community Sections"
        className="mb-3.5 sm:mb-4 rounded-2xl border border-brand-line bg-white/95 p-2 shadow-sm backdrop-blur-md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Tab 1: EaseComms */}
          <button
            type="button"
            id="tab-easecomms"
            onClick={() => {
              setTab(lastCommsTab);
              scrollToTabsIfAbove();
            }}
            className={cx(
              "cursor-pointer group relative flex items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left transition-all duration-200",
              mainSection === "comms"
                ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                : "bg-brand-warm/60 text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                  mainSection === "comms"
                    ? "bg-white/20 text-white"
                    : "bg-brand-lilac/70 text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
                )}
              >
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-brand text-base sm:text-lg font-black tracking-tight leading-none">
                    EaseComms
                  </span>
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                      mainSection === "comms"
                        ? "bg-white/25 text-white"
                        : "bg-brand-lilac text-brand-purple",
                    )}
                  >
                    Community
                  </span>
                </div>
                <p
                  className={cx(
                    "mt-1 text-xs truncate",
                    mainSection === "comms" ? "text-white/85" : "text-muted",
                  )}
                >
                  Discussions, 360° seat views & venue accessibility
                </p>
              </div>
            </div>
          </button>

          {/* Tab 2: EaseExchange */}
          <button
            type="button"
            id="tab-easeexchange"
            onClick={() => {
              setTab("exchange");
              scrollToTabsIfAbove();
            }}
            className={cx(
              "cursor-pointer group relative flex items-center justify-between gap-3 rounded-xl px-5 py-3.5 text-left transition-all duration-200",
              mainSection === "exchange"
                ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                : "bg-brand-warm/60 text-brand-deep hover:bg-orange-50/70 hover:text-brand-orange",
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                  mainSection === "exchange"
                    ? "bg-white/20 text-white"
                    : "bg-orange-100 text-brand-orange group-hover:bg-brand-orange group-hover:text-white",
                )}
              >
                <Repeat className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-brand text-base sm:text-lg font-black tracking-tight leading-none">
                    EaseExchange
                  </span>
                  <span
                    className={cx(
                      "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                      mainSection === "exchange"
                        ? "bg-white/25 text-white"
                        : "bg-orange-100 text-brand-orange",
                    )}
                  >
                    Ticket Swaps
                  </span>
                </div>
                <p
                  className={cx(
                    "mt-1 text-xs truncate",
                    mainSection === "exchange" ? "text-white/85" : "text-muted",
                  )}
                >
                  Face-value ticket swaps backed by community verification
                </p>
              </div>
            </div>
          </button>
        </div>
      </nav>

      {/* 3. CONTENT: EASECOMMS (Channels & Feed) vs EASEEXCHANGE (Ticket Swaps) */}
      {mainSection === "comms" ? (
      <div
        id="community-grid"
        className={cx(
          "grid gap-6 transition-all duration-300",
          isSidebarCollapsed
            ? (tab === "feed" ? "lg:grid-cols-[72px_minmax(0,1fr)_280px]" : "lg:grid-cols-[72px_minmax(0,1fr)]")
            : (tab === "feed" ? "lg:grid-cols-[240px_minmax(0,1fr)_280px]" : "lg:grid-cols-[240px_minmax(0,1fr)]"),
        )}
      >
        {/* LEFT RAIL: EXPLORE CHANNELS & YOUR SPACE */}
        <aside className="space-y-4">
          <div className={cx(
            "rounded-3xl border border-brand-line bg-white shadow-sm lg:sticky lg:top-24 transition-all duration-300",
            isSidebarCollapsed ? "p-2.5" : "p-4"
          )}>
            {/* Collapse/Expand Toggle Header */}
            {isSidebarCollapsed ? (
              <div className="flex flex-col items-center gap-1.5 pb-2">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  title="Expand EaseComms Channels"
                  className="cursor-pointer flex h-9 w-9 items-center justify-center rounded-xl bg-brand-lilac/70 text-brand-purple hover:bg-brand-purple hover:text-white transition shadow-sm"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <span className="text-[9px] font-black uppercase tracking-wider text-muted text-center leading-tight">
                  Channels
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between px-2 pb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted">
                  EaseComms Channels
                </span>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(true)}
                  title="Collapse EaseComms Channels"
                  className="cursor-pointer inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted hover:bg-brand-lilac/60 hover:text-brand-purple transition"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="text-[10px]">Collapse</span>
                </button>
              </div>
            )}

            {/* Channels List */}
            {isSidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2" role="tablist" aria-label="EaseComms channels">
                {/* Channel 1: EaseConnect */}
                <button
                  type="button"
                  onClick={() => setTab("feed")}
                  title="EaseConnect: Discussions & fan forums"
                  className={cx(
                    "cursor-pointer flex h-10 w-10 items-center justify-center rounded-xl transition-all shadow-xs",
                    tab === "feed"
                      ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                      : "bg-brand-lilac/50 text-brand-deep hover:bg-brand-purple hover:text-white",
                  )}
                >
                  <Users className="h-5 w-5" />
                </button>

                {/* Channel 2: EasePix & EaseXplore */}
                <button
                  type="button"
                  onClick={() => setTab("views")}
                  title="EasePix & EaseXplore: Seat sharing & 360° views"
                  className={cx(
                    "cursor-pointer flex h-10 w-10 items-center justify-center rounded-xl transition-all shadow-xs",
                    tab === "views"
                      ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                      : "bg-brand-lilac/50 text-brand-deep hover:bg-brand-purple hover:text-white",
                  )}
                >
                  <Camera className="h-5 w-5" />
                </button>

                <div className="my-2 h-px w-8 bg-brand-line" />

                {/* Compact Your Space Icons */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => showToast("You have 4 saved posts.")}
                    title="Saved posts"
                    className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-lilac/50 hover:text-brand-purple transition"
                  >
                    <Bookmark className="h-4 w-4 text-brand-purple" />
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast("You are part of: Live Music Fans & Festival Crew")}
                    title="My groups"
                    className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-lilac/50 hover:text-brand-purple transition"
                  >
                    <Users className="h-4 w-4 text-brand-magenta" />
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast("All recent activity is up to date.")}
                    title="Recent activity"
                    className="cursor-pointer flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-brand-lilac/50 hover:text-brand-purple transition"
                  >
                    <Clock className="h-4 w-4 text-brand-orange" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2" role="tablist" aria-label="EaseComms channels">
                  {/* Channel 1: EaseConnect */}
                  <button
                    type="button"
                    onClick={() => setTab("feed")}
                    className={cx(
                      "cursor-pointer group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all",
                      tab === "feed"
                        ? "bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                        : "text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple",
                    )}
                  >
                    <div
                      className={cx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        tab === "feed"
                          ? "bg-white/20 text-white"
                          : "bg-brand-lilac/70 text-brand-purple group-hover:bg-brand-purple group-hover:text-white",
                      )}
                    >
                      <Users className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="font-feature text-sm font-black italic tracking-tight leading-tight block">
                        EaseConnect
                      </b>
                      <small className={cx("block text-[10px] truncate", tab === "feed" ? "text-white/80" : "text-muted")}>
                        Discussions & fan forums
                      </small>
                    </div>
                  </button>

                  {/* Channel 2: EasePix & EaseXplore */}
                  <button
                    type="button"
                    onClick={() => setTab("views")}
                    className={cx(
                      "cursor-pointer flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all border",
                      tab === "views"
                        ? "border-brand-purple/30 bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange text-white shadow-md shadow-brand-purple/25 ring-2 ring-brand-purple/20"
                        : "border-transparent bg-transparent hover:bg-brand-lilac/40 text-brand-deep",
                    )}
                  >
                    <div
                      className={cx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        tab === "views"
                          ? "bg-white/20 text-white"
                          : "bg-brand-lilac/70 text-brand-purple",
                      )}
                    >
                      <Camera className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="font-feature text-sm font-black italic tracking-tight leading-tight block">
                        EasePix & EaseXplore
                      </b>
                      <small className={cx("block text-[10px] truncate", tab === "views" ? "text-white/80" : "text-muted")}>
                        Seat sharing & 360° views
                      </small>
                    </div>
                  </button>
                </div>

                <div className="my-3.5 h-px bg-brand-line" />

                <div className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-wider text-muted">
                  Your space
                </div>
                <nav className="space-y-1">
                  <button
                    type="button"
                    onClick={() => showToast("You have 4 saved posts.")}
                    className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
                  >
                    <Bookmark className="h-4 w-4 text-brand-purple" /> Saved posts
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast("You are part of: Live Music Fans & Festival Crew")}
                    className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
                  >
                    <Users className="h-4 w-4 text-brand-magenta" /> My groups
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast("All recent activity is up to date.")}
                    className="cursor-pointer flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted transition hover:bg-brand-lilac/40 hover:text-brand-purple"
                  >
                    <Clock className="h-4 w-4 text-brand-orange" /> Recent activity
                  </button>
                </nav>

                <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-lilac/70 via-brand-warm to-brand-lilac/40 p-3.5 border border-brand-purple/15">
                  <strong className="block font-brand text-xs font-bold text-brand-deep">
                    Make someone’s night ✨
                  </strong>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Share a seat view or a useful tip to help another fan feel event-ready.
                  </p>
                  <button
                    type="button"
                    onClick={() => showToast("Every verified seat view earns +15 EasePoints!")}
                    className="cursor-pointer mt-2 text-[11px] font-extrabold text-brand-purple hover:underline"
                  >
                    How it works
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* CENTER COLUMN: FEED / EXCHANGE / VIEWS / ACCESS */}
        <main className="min-w-0 space-y-5">
          {/* Channel Header Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-deep">
                {tab === "feed" && "Community"}
                {tab === "views" && "EasePix & EaseXplore"}
              </h2>
              <p className="text-xs text-muted">
                {tab === "feed" && "What fans are talking about right now across Singapore"}
                {tab === "views" && "Share your seat view and browse verified community photos before buying"}
              </p>
            </div>

            {tab === "feed" && (
              <div className="flex items-center gap-2">
                <select
                  aria-label="Sort posts"
                  value={sortOrder}
                  onChange={(e) => {
                    const val = e.target.value as typeof sortOrder;
                    setSortOrder(val);
                    showToast(`Sorting by ${val}`);
                  }}
                  className="cursor-pointer rounded-xl border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-deep outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
                >
                  <option value="trending">Trending first</option>
                  <option value="newest">Newest first</option>
                  <option value="discussed">Most discussed</option>
                </select>
              </div>
            )}
          </div>

          {/* TAB 1: EASECONNECT FEED */}
          {tab === "feed" && (
            <div className="space-y-4">
              {/* Interactive Post Composer (Logged-in only) or Sign-in Prompt Button */}
              {!user ? (
                <div className="rounded-3xl border-2 border-dashed border-brand-purple/20 bg-gradient-to-r from-brand-lilac/30 via-white to-orange-50/40 p-5 sm:p-6 text-center shadow-xs">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-md mb-3">
                    <Flame className="h-5 w-5" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                      navigate("/login", { state: { returnTo: "/community" } });
                    }}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-orange via-brand-magenta to-brand-purple px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-brand-orange/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                  >
                    <Flame className="h-4 w-4" /> Got a hot take? We&apos;re listening
                  </button>
                  <p className="mt-2.5 text-xs text-muted">
                    Sign in to share tips, ask questions, or upload EasePix seat views.
                  </p>
                </div>
              ) : (
                <div
                  ref={composerRef}
                  className="rounded-3xl border-2 border-brand-purple/20 bg-white p-5 shadow-sm transition-all focus-within:border-brand-purple focus-within:ring-4 focus-within:ring-brand-purple/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
                      {user?.name?.[0] ?? "Y"}
                    </div>
                    <div>
                      <b className="block text-xs font-bold text-brand-deep">What’s the story?</b>
                      <small className="block text-[11px] text-muted">
                        Ask the crowd, share a tip, or post a seat view.
                      </small>
                    </div>
                  </div>

                  <div className="mt-3.5">
                    <Textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      placeholder="Drop a tip, ask the crowd, or share the moment…"
                      className="border-brand-line bg-brand-warm/30 text-sm focus:border-brand-purple"
                    />
                  </div>

                  {/* Photo URL Input Bar if toggled */}
                  {showPhotoInput && (
                    <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-brand-line bg-brand-lilac/30 p-2">
                      <ImageIcon className="h-4 w-4 text-brand-purple" />
                      <input
                        type="url"
                        placeholder="Paste seat photo URL (e.g. Unsplash or direct image link)"
                        value={photoUrl}
                        onChange={(e) => setPhotoUrl(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-brand-deep outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPhotoInput(false)}
                        className="text-muted hover:text-brand-deep"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Attached EasePix Preview in Composer */}
                  {attachedEasePix && (
                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-brand-purple/30 bg-brand-lilac/40 p-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-brand-line bg-black/10">
                          <img
                            src={attachedEasePix.photo}
                            alt="Attached EasePix"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-brand-deep">
                            <span className="text-brand-purple">📸 EasePix Attached</span>
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-brand-deep border border-brand-line">
                              {attachedEasePix.section} · {attachedEasePix.row}
                            </span>
                          </div>
                          <small className="block truncate text-[11px] text-muted">
                            Will upload to EasePix and EaseComms when you share this post
                          </small>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedEasePix(null);
                          setPhotoUrl("");
                          showToast("EasePix detached from draft");
                        }}
                        className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-white hover:text-red-500 transition"
                        aria-label="Remove attached photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-brand-line/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShareModalOrigin("composer");
                          setSeatPhotoInput(attachedEasePix?.photo || photoUrl || "");
                          if (!seatEventIdInput && selectedEventId) setSeatEventIdInput(selectedEventId);
                          setIsShareModalOpen(true);
                        }}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-brand-purple/40 bg-white px-3 py-1.5 text-xs font-bold text-brand-purple transition hover:bg-brand-purple hover:text-white"
                      >
                        <Camera className="h-3.5 w-3.5" /> Upload EasePix
                      </button>

                      <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-1 text-xs font-bold text-muted">
                        <Tag className="h-3.5 w-3.5 text-brand-orange" />
                        <select
                          aria-label="Tag event"
                          value={selectedEventId}
                          onChange={(e) => setSelectedEventId(e.target.value)}
                          className="cursor-pointer bg-transparent text-xs text-brand-deep outline-none"
                        >
                          {events.map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => submitPost()}
                      className="border-0 bg-gradient-to-r from-brand-orange to-brand-amber font-bold text-white shadow-md shadow-brand-orange/20 hover:shadow-brand-orange/35"
                    >
                      <Send className="h-4 w-4" /> Share post
                    </Button>
                  </div>
                </div>
              )}

              {/* Feed Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(
                  [
                    { id: "all", label: "For you" },
                    { id: "following", label: "Following" },
                    { id: "views", label: "Seat views" },
                    { id: "questions", label: "Questions" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFilter(f.id);
                      showToast(`Filter: ${f.label}`);
                    }}
                    className={cx(
                      "cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold whitespace-nowrap transition-all",
                      filter === f.id
                        ? "bg-brand-lilac text-brand-purple shadow-sm ring-1 ring-brand-purple/30 font-extrabold"
                        : "text-muted hover:bg-brand-lilac/40 hover:text-brand-deep",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Feed Posts List */}
              <div className="space-y-4">
                {filteredPosts.map((p) => {
                  const isLiked = likedPosts[p.id] ?? false;
                  const currentLikes = likesCount[p.id] ?? p.likes;

                  return (
                    <article
                      key={p.id}
                      className="group rounded-3xl border border-brand-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
                          {p.author[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <b className="text-xs font-bold text-brand-deep">
                                {p.author}{" "}
                                <span className="font-normal text-muted">· Live Music Fans</span>
                              </b>
                              <div className="text-[11px] text-muted">
                                {p.when} on{" "}
                                <span className="font-semibold text-brand-deep">
                                  {eventName(p.eventId)}
                                </span>{" "}
                                ·{" "}
                                <span className="font-bold text-brand-purple">
                                  {p.photo ? "EasePix contributor" : "Community tip"}
                                </span>
                              </div>
                            </div>
                            <span className="rounded-full bg-brand-warm px-2 py-0.5 text-[10px] font-bold text-muted border border-brand-line">
                              {p.section ? `Sec ${p.section}` : "Fan Post"}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-relaxed text-brand-deep/90">
                            {p.body}
                          </p>

                          {/* Post Photo / Seat View with Dark Gradient & Badge */}
                          {p.photo && (
                            <div className="relative mt-3.5 h-64 overflow-hidden rounded-2xl border border-brand-line bg-brand-deep shadow-sm">
                              <img
                                src={p.photo}
                                alt="Seat view"
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                onError={(e) => {
                                  // Fallback gradient if photo fails
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-transparent to-transparent pointer-events-none" />
                              <div className="absolute left-3.5 bottom-3.5 flex items-center gap-2 text-xs font-extrabold text-white">
                                <span className="rounded bg-brand-orange px-2 py-0.5 text-[10px] uppercase font-black tracking-wider">
                                  SEAT VIEW
                                </span>
                                <span>{eventName(p.eventId)} · Section {p.section ?? "C"}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreview360Photo({
                                    url: p.photo!,
                                    title: eventName(p.eventId),
                                    section: p.section,
                                  })
                                }
                                className="cursor-pointer absolute right-3.5 bottom-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-deep/85 px-3 py-1 text-xs font-bold text-white backdrop-blur-md transition hover:bg-brand-purple"
                              >
                                <Rotate3d className="h-3.5 w-3.5 text-brand-orange" /> Preview 360°
                              </button>
                            </div>
                          )}

                          {/* Post Footer Actions */}
                          <div className="mt-4 flex items-center gap-4 pt-3 border-t border-brand-line/60 text-xs text-muted font-bold">
                            <button
                              type="button"
                              onClick={() => toggleLike(p.id, p.likes, p.isBackend)}
                              className={cx(
                                "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                                isLiked ? "text-brand-magenta" : "hover:text-brand-magenta",
                              )}
                            >
                              <Heart className={cx("h-4 w-4", isLiked && "fill-brand-magenta")} />
                              <span>{currentLikes}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setOpenCommentsForPost((prev) => ({
                                  ...prev,
                                  [p.id]: !prev[p.id],
                                }))
                              }
                              className={cx(
                                "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                                openCommentsForPost[p.id]
                                  ? "text-brand-purple font-extrabold"
                                  : "hover:text-brand-purple"
                              )}
                            >
                              <MessageSquare className="h-4 w-4" />
                              <span>
                                {p.replies.length > 0
                                  ? `${p.replies.length} ${p.replies.length === 1 ? "comment" : "comments"}`
                                  : "Comment"}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(window.location.href);
                                showToast("Post link copied to clipboard");
                              }}
                              className="cursor-pointer inline-flex items-center gap-1.5 hover:text-brand-purple transition-colors"
                            >
                              <Share2 className="h-4 w-4" /> Share
                            </button>

                            <div className="ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-orange">
                              <Sparkles className="h-3 w-3" /> +15 EasePoints
                            </div>
                          </div>

                          {/* Expandable Comments / Replies Section for this post */}
                          {openCommentsForPost[p.id] && (
                            <div className="mt-3.5 space-y-3 rounded-2xl border border-brand-line/80 bg-brand-warm/30 p-3.5 sm:p-4">
                              <div className="flex items-center justify-between text-xs font-bold text-brand-deep">
                                <span>Comments & Replies ({p.replies.length})</span>
                                <span className="text-[11px] text-muted">Join the discussion</span>
                              </div>

                              {/* Comment List */}
                              {p.replies.length > 0 ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                  {p.replies.map((reply) => (
                                    <div
                                      key={reply.id}
                                      className="rounded-xl border border-brand-line/60 bg-white p-3 text-xs shadow-xs"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-bold text-brand-deep">
                                            {reply.author}
                                          </span>
                                          {reply.isVerified && (
                                            <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[9px] font-bold">
                                              Verified Attendee
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-muted">{reply.when}</span>
                                      </div>
                                      <p className="mt-1 leading-relaxed text-brand-deep/90">
                                        {reply.body}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-2.5 text-center text-xs text-muted">
                                  No comments on this post yet. Be the first to reply!
                                </div>
                              )}

                              {/* Inline Reply Composer */}
                              <div className="flex items-center gap-2 pt-2 border-t border-brand-line/60">
                                <input
                                  type="text"
                                  placeholder={user ? "Write a comment..." : "Sign in to leave a comment..."}
                                  disabled={!user || submittingReply[p.id]}
                                  value={replyDrafts[p.id] || ""}
                                  onChange={(e) =>
                                    setReplyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      submitReply(p.id, p.eventId);
                                    }
                                  }}
                                  className="flex-1 rounded-xl border border-brand-line bg-white px-3 py-2 text-xs text-brand-deep outline-none focus:border-brand-purple disabled:bg-stone-100 disabled:cursor-not-allowed"
                                />
                                <button
                                  type="button"
                                  disabled={!user || submittingReply[p.id] || !(replyDrafts[p.id] || "").trim()}
                                  onClick={() => submitReply(p.id, p.eventId)}
                                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-magenta px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Send className="h-3 w-3" />
                                  <span>{submittingReply[p.id] ? "Posting..." : "Reply"}</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}



          {/* TAB 3: EASEPIX - SHARE THE SEAT & COMMUNITY PHOTOS */}
          {tab === "views" && (
            <div className="space-y-6">
              {/* Share Your Seat View Card */}
              <div className="rounded-3xl border-2 border-brand-purple/20 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-brand-line">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-purple to-brand-orange text-white shadow-sm">
                      <Camera className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-brand text-sm font-bold text-brand-deep">
                        Share Your Seat View
                      </h3>
                      <p className="text-[11px] text-muted">
                        Help other fans see real sightlines from your section before booking
                      </p>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-black text-brand-orange">
                    <Sparkles className="h-3 w-3" /> +15 EasePoints
                  </div>
                </div>

                <div className="mt-4 space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SearchableCombobox
                      label="Event"
                      placeholder="Search event..."
                      value={seatEventIdInput}
                      onChange={(val) => {
                        setSeatEventIdInput(val);
                        setSeatSectionInput("");
                        setSeatRowInput("");
                        setSelectedGallerySection("all");
                        setGallerySearchFilter(val ? { eventId: val } : null);
                        setHasSearched(false);
                      }}
                      options={events.map((ev) => ({
                        value: ev.id,
                        label: ev.title,
                        sublabel: [ev.venue, ev.category].filter(Boolean).join(" · "),
                      }))}
                      allowCustom={false}
                    />

                    <SearchableCombobox
                      label="Section"
                      placeholder={
                        !seatEventIdInput
                          ? "Select an event first..."
                          : loadingSeats
                          ? "Loading sections..."
                          : "Search or select section..."
                      }
                      value={seatSectionInput}
                      onChange={(val) => {
                        setSeatSectionInput(val);
                        setSeatRowInput("");
                      }}
                      options={sectionOptions}
                      disabled={!seatEventIdInput}
                      allowCustom={true}
                    />

                    <SearchableCombobox
                      label="Row & Seat"
                      placeholder={
                        !seatEventIdInput
                          ? "Select an event first..."
                          : seatSectionInput
                          ? `Search row or seat in ${seatSectionInput}...`
                          : "Search or select row & seat..."
                      }
                      value={seatRowInput}
                      onChange={(val) => setSeatRowInput(val)}
                      options={rowSeatOptions}
                      disabled={!seatEventIdInput}
                      allowCustom={true}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                    {/* Search Button (Purple Gradient) - Requires Event minimally */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!seatEventIdInput) {
                          showToast("Please select an event to search seat views");
                          return;
                        }
                        setHasSearched(true);

                        const searchedSec = seatSectionInput.trim();
                        const searchedRow = seatRowInput.trim();

                        const matchedSecObj = searchedSec
                          ? sectionOptions.find(
                              (sec) =>
                                sec.value.toLowerCase() === searchedSec.toLowerCase() ||
                                sec.label.toLowerCase().includes(searchedSec.toLowerCase()) ||
                                searchedSec.toLowerCase().includes(sec.label.toLowerCase())
                            )
                          : null;

                        let deducedSection = "";
                        if (!searchedSec && searchedRow && eventSeats.length > 0) {
                          const matchedSeat = eventSeats.find(
                            (s) =>
                              isSeatMatch(searchedRow, `Row ${s.row}`) ||
                              isSeatMatch(searchedRow, `${s.row}-${s.number}`)
                          );
                          if (matchedSeat?.seatSection) {
                            deducedSection = matchedSeat.seatSection;
                          }
                        }

                        const targetSection = matchedSecObj ? matchedSecObj.value : (searchedSec || deducedSection || "all");

                        setGallerySearchFilter({
                          eventId: seatEventIdInput,
                          section: searchedSec || (deducedSection ? deducedSection : undefined),
                          row: searchedRow || undefined,
                        });
                        setSelectedGallerySection(targetSection);

                        const evTitle = events.find((e) => e.id === seatEventIdInput)?.title ?? "Selected Event";
                        if (targetSection !== "all" && searchedRow) {
                          showToast(`Showing ${targetSection} · ${searchedRow} (Highlighted)`);
                        } else if (targetSection !== "all") {
                          showToast(`Showing ${targetSection} seat views`);
                        } else {
                          showToast(`Showing seat views for ${evTitle}`);
                        }
                        scrollToSection("seat-search-results");
                      }}
                      className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-purple to-brand-magenta px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-purple/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                    >
                      <Search className="h-4 w-4" /> Find Seat Views
                    </button>

                    {/* Upload EasePix Button or Sign-in Prompt */}
                    {!user ? (
                      <button
                        type="button"
                        onClick={() => {
                          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                          navigate("/login", { state: { returnTo: "/community?tab=views" } });
                        }}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                      >
                        <Camera className="h-4 w-4" /> Don&apos;t gatekeep the view, show us what we&apos;re missing!
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShareModalOrigin("easepix");
                          if (!seatEventIdInput && events.length > 0) {
                            setSeatEventIdInput(events[0].id);
                          }
                          setIsShareModalOpen(true);
                        }}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                      >
                        <Camera className="h-4 w-4" /> Upload EasePix
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Results Section - Only appears after searching */}
              {hasSearched && (
                <div className="space-y-6 pt-2">
                  {/* Gallery Header - Renamed to Results */}
                  <div id="seat-search-results" className="scroll-mt-24 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-brand text-base font-bold text-brand-deep">
                        Results
                      </h3>
                      <p className="text-xs text-muted">
                        {gallerySearchFilter?.eventId
                          ? `Showing seat views for ${events.find((e) => e.id === gallerySearchFilter.eventId)?.title ?? "Selected Event"}${selectedGallerySection !== "all" ? ` · ${selectedGallerySection}` : (gallerySearchFilter.section ? ` · ${gallerySearchFilter.section}` : "")}`
                          : "Real, unedited photos shared by fans who sat there"}
                      </p>
                    </div>
                    {gallerySearchFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setGallerySearchFilter(null);
                          setHasSearched(false);
                          setSelectedGallerySection("all");
                          setSeatEventIdInput("");
                          setSeatSectionInput("");
                          setSeatRowInput("");
                          showToast("Search filters cleared");
                        }}
                        className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold text-brand-purple hover:underline"
                      >
                        <X className="h-3.5 w-3.5" /> Clear search filter
                      </button>
                    )}
                  </div>

                  {/* EaseExplore Venue Banner ("EaseExplore line") */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl border border-brand-purple/20 bg-gradient-to-r from-brand-deep via-[#311c59] to-brand-deep p-4.5 text-white shadow-lg">
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-brand-orange shadow-inner border border-white/15">
                        <Rotate3d className="h-5 w-5 animate-spin" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-brand text-base font-bold text-white">
                            {events.find((e) => e.id === (gallerySearchFilter?.eventId || seatEventIdInput || events[0]?.id))?.venue || "Event Venue"}
                          </span>
                          <span className="rounded-full bg-brand-orange/20 px-2 py-0.5 text-[10px] font-extrabold text-brand-orange border border-brand-orange/30">
                            360° Panoramic
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-white/80">
                          View interactive 360° sightlines, step-free access, and vantage point elevations for this venue.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEaseExplore()}
                      className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                    >
                      <Rotate3d className="h-4 w-4" /> Open EaseXplore
                    </button>
                  </div>

                  {/* Section Segmentation & Options Selector */}
                  {(() => {
                    const targetEventId = gallerySearchFilter?.eventId || seatEventIdInput;
                    if (!targetEventId) {
                      return (
                        <div className="rounded-3xl border border-dashed border-brand-purple/25 bg-brand-warm/30 p-10 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-lilac text-brand-purple shadow-sm mb-3">
                            <Camera className="h-6 w-6" />
                          </div>
                          <h4 className="font-brand text-base font-bold text-brand-deep">
                            Select an event above
                          </h4>
                          <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
                            Choose an event from the search bar to inspect actual verified fan seat views, camera angles, and 360° sightlines for its real sections.
                          </p>
                        </div>
                      );
                    }

                    const targetEvent = events.find((e) => e.id === targetEventId);
                    const eventTitle = targetEvent?.title ?? "Selected Event";

                    // User posts for this event that have photos
                    const userEventPhotos = displayPosts.filter((p) => p.photo && p.eventId === targetEventId);

                    // Backend EasePix photos for this event
                    const backendEventPix = backendEasePixList.filter((pix) => pix.eventId === targetEventId);

                    const searchedRow = (gallerySearchFilter?.row || seatRowInput || "").trim();
                    const matchesSearchedSeat = (seatStr: string) => isSeatMatch(searchedRow, seatStr);

                    const searchedSecTrimmed = (gallerySearchFilter?.section || seatSectionInput || "").trim();

                    // Generate real sections catalog strictly from the selected event's sections
                    const baseCatalog: SectionSegment[] = sectionOptions.map((opt) => {
                      const secName = opt.label;
                      const secSeats = eventSeats.filter(
                        (s) => s.seatSection.toLowerCase() === secName.toLowerCase()
                      );
                      const rows = Array.from(new Set(secSeats.map((s) => s.row))).sort();
                      const rowRange =
                        rows.length > 0
                          ? rows.length > 1
                            ? `Rows ${rows[0]} – ${rows[rows.length - 1]}`
                            : `Row ${rows[0]}`
                          : "General Seating";

                      return {
                        id: `sec-${secName.toLowerCase().replace(/\s+/g, "-")}`,
                        name: secName,
                        tier: opt.sublabel ?? "Reserved Tier",
                        rowRange,
                        photos: [],
                      };
                    });

                    if (
                      searchedSecTrimmed &&
                      !baseCatalog.some((sec) => matchesSectionQuery(sec.name, searchedSecTrimmed))
                    ) {
                      baseCatalog.push({
                        id: `sec-${searchedSecTrimmed.toLowerCase().replace(/\s+/g, "-")}`,
                        name: searchedSecTrimmed,
                        tier: "Reserved Seating",
                        rowRange: "General Tier",
                        photos: [],
                      });
                    }

                    const searchedSectionQuery = (gallerySearchFilter?.section || seatSectionInput || "").trim().toLowerCase();

                    // Integrate user posts and backend EasePix photos into their matching real sections
                    const dynamicSections = baseCatalog.map((sec) => {
                      const matchedBackendPix: SectionSeatPhoto[] = backendEventPix
                        .filter((pix) => {
                          const secNorm = sec.name.toLowerCase().replace(/^section\s+/i, "");
                          const pixSecNorm = pix.section.toLowerCase().replace(/^section\s+/i, "");
                          return pixSecNorm.includes(secNorm) || secNorm.includes(pixSecNorm);
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
                        }));

                      const matchedUserPosts: SectionSeatPhoto[] = userEventPhotos
                        .filter((p) => {
                          if (!p.section) return false;
                          const secNorm = sec.name.toLowerCase().replace(/^section\s+/i, "");
                          const postSecNorm = p.section.toLowerCase().replace(/^section\s+/i, "");
                          return postSecNorm.includes(secNorm) || secNorm.includes(postSecNorm);
                        })
                        .map((p) => ({
                          photo: p.photo!,
                          authorName: p.author,
                          section: sec.name,
                          seat: p.seatLabel ? `${sec.name} · ${p.seatLabel}` : (p.section ? `${p.section}` : `${sec.name} · Verified Seat`),
                          vibe: p.body.slice(0, 85) + (p.body.length > 85 ? "…" : ""),
                          isVerified: p.isVerified ?? true,
                        }));

                      const seenPhotos = new Set<string>();
                      const allSecPhotos: SectionSeatPhoto[] = [];
                      for (const item of [...matchedBackendPix, ...matchedUserPosts]) {
                        if (!seenPhotos.has(item.photo)) {
                          seenPhotos.add(item.photo);
                          allSecPhotos.push(item);
                        }
                      }

                      const isTargetSection = Boolean(
                        searchedSectionQuery ? matchesSectionQuery(sec.name, searchedSectionQuery) : true
                      );

                      let prioritizedPhotos: SectionSeatPhoto[];
                      if (searchedRow && isTargetSection) {
                        const matchingPhotos = allSecPhotos.filter((p) => matchesSearchedSeat(p.seat));
                        const remainingPhotos = allSecPhotos.filter((p) => !matchesSearchedSeat(p.seat));

                        if (matchingPhotos.length > 0) {
                          prioritizedPhotos = [...matchingPhotos, ...remainingPhotos];
                        } else if (allSecPhotos.length > 0) {
                          const targetKey = parseSeatKey(searchedRow);
                          let closestBeforePhoto: SectionSeatPhoto | null = null;
                          let maxBeforeDiff = -Infinity;
                          let closestAfterPhoto: SectionSeatPhoto | null = null;
                          let minAfterDiff = Infinity;

                          allSecPhotos.forEach((p) => {
                            const pKey = parseSeatKey(p.seat);
                            if (targetKey.type !== "unknown" && pKey.type === targetKey.type) {
                              const diff = pKey.val - targetKey.val;
                              if (diff < 0 && diff > maxBeforeDiff) {
                                maxBeforeDiff = diff;
                                closestBeforePhoto = p;
                              } else if (diff > 0 && diff < minAfterDiff) {
                                minAfterDiff = diff;
                                closestAfterPhoto = p;
                              }
                            }
                          });

                          if (!closestBeforePhoto && !closestAfterPhoto && allSecPhotos.length > 0) {
                            closestAfterPhoto = allSecPhotos[0];
                          }

                          const closestPair = [closestBeforePhoto, closestAfterPhoto].filter(Boolean) as SectionSeatPhoto[];
                          const others = allSecPhotos.filter((p) => !closestPair.includes(p));
                          prioritizedPhotos = [...closestPair, ...others];
                        } else {
                          prioritizedPhotos = allSecPhotos;
                        }
                      } else {
                        prioritizedPhotos = allSecPhotos;
                      }

                      return {
                        ...sec,
                        photos: prioritizedPhotos,
                      };
                    });

                    // Order sections so the searched section is placed FIRST
                    let orderedSections = dynamicSections;
                    if (searchedSectionQuery) {
                      orderedSections = [...dynamicSections].sort((a, b) => {
                        const aMatch = matchesSectionQuery(a.name, searchedSectionQuery);
                        const bMatch = matchesSectionQuery(b.name, searchedSectionQuery);
                        if (aMatch && !bMatch) return -1;
                        if (!aMatch && bMatch) return 1;
                        return 0;
                      });
                    }

                    // Count total photos
                    const totalPhotos = orderedSections.reduce((sum, sec) => sum + sec.photos.length, 0);

                    // Sections to display based on selectedGallerySection
                    const sectionsToDisplay = selectedGallerySection === "all"
                      ? orderedSections
                      : orderedSections.filter((sec) =>
                          sec.name.toLowerCase().includes(selectedGallerySection.toLowerCase()) ||
                          selectedGallerySection.toLowerCase().includes(sec.name.toLowerCase())
                        );

                    return (
                      <div className="space-y-6">
                        {/* Section Selection Bar */}
                        <div className="rounded-2xl border border-brand-line bg-white p-3.5 sm:p-4 shadow-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-brand-line/60">
                            <div>
                              <span className="text-xs font-bold text-brand-deep">
                                Sections for <span className="text-brand-purple">{eventTitle}</span>
                              </span>
                              <span className="ml-2 text-[11px] text-muted hidden sm:inline">
                                Click a section to filter or view all sections segmented
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-muted">
                              {selectedGallerySection === "all"
                                ? "Auto-segmented by section"
                                : `Viewing ${selectedGallerySection} (${sectionsToDisplay[0]?.photos.length ?? 0} views)`}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-3">
                            <button
                              type="button"
                              onClick={() => setSelectedGallerySection("all")}
                              className={cx(
                                "cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all",
                                selectedGallerySection === "all"
                                  ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-md shadow-brand-purple/20"
                                  : "bg-brand-warm/60 border border-brand-line text-brand-deep hover:bg-brand-lilac/40 hover:text-brand-purple"
                              )}
                            >
                              All Sections
                              <span
                                className={cx(
                                  "rounded-full px-1.5 py-0.2 text-[10px]",
                                  selectedGallerySection === "all" ? "bg-white/25 text-white" : "bg-white text-muted"
                                )}
                              >
                                {totalPhotos}
                              </span>
                            </button>

                            {orderedSections.map((sec) => {
                              const isSelected = selectedGallerySection.toLowerCase() === sec.name.toLowerCase();
                              return (
                                <button
                                  key={sec.id}
                                  type="button"
                                  onClick={() => setSelectedGallerySection(sec.name)}
                                  className={cx(
                                    "cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all",
                                    isSelected
                                      ? "bg-gradient-to-r from-brand-orange to-brand-amber text-white shadow-md shadow-brand-orange/25"
                                      : "bg-white border border-brand-line text-brand-deep hover:bg-orange-50 hover:text-brand-orange hover:border-brand-orange/30"
                                  )}
                                >
                                  {sec.name}
                                  <span
                                    className={cx(
                                      "rounded-full px-1.5 py-0.2 text-[10px]",
                                      isSelected ? "bg-white/25 text-white" : "bg-brand-warm text-muted"
                                    )}
                                  >
                                    {sec.photos.length}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Segmented Section Cards Grid */}
                        <div className="space-y-6">
                          {sectionsToDisplay.map((sec) => {
                            const isTargetSection = Boolean(
                              searchedSectionQuery && matchesSectionQuery(sec.name, searchedSectionQuery)
                            );

                            // Crucial: If a section was searched, seat matching ONLY applies to that section!
                            const canMatchSeat = !searchedSectionQuery || isTargetSection;

                            const hasExactSeatMatch = Boolean(
                              canMatchSeat && searchedRow && sec.photos.some((p) => matchesSearchedSeat(p.seat))
                            );

                            // Crucial: Closest seat notices/highlights only apply to the searched section!
                            const isSectionWithNoSeatMatch = Boolean(
                              isTargetSection && searchedRow && sec.photos.length > 0 && !hasExactSeatMatch
                            );

                            // Determine single next row before and single next row after
                            let nextRowBeforePhoto: SectionSeatPhoto | null = null;
                            let nextRowAfterPhoto: SectionSeatPhoto | null = null;

                            if (isSectionWithNoSeatMatch) {
                              const targetKey = parseSeatKey(searchedRow);
                              let maxBefore = -Infinity;
                              let minAfter = Infinity;

                              sec.photos.forEach((p) => {
                                const pKey = parseSeatKey(p.seat);
                                if (targetKey.type !== "unknown" && pKey.type === targetKey.type) {
                                  const diff = pKey.val - targetKey.val;
                                  if (diff < 0 && diff > maxBefore) {
                                    maxBefore = diff;
                                    nextRowBeforePhoto = p;
                                  } else if (diff > 0 && diff < minAfter) {
                                    minAfter = diff;
                                    nextRowAfterPhoto = p;
                                  }
                                }
                              });

                              if (!nextRowBeforePhoto && !nextRowAfterPhoto && sec.photos.length > 0) {
                                nextRowAfterPhoto = sec.photos[0];
                              }
                            }

                            return (
                              <div
                                key={sec.id}
                                className="rounded-3xl border border-brand-line bg-white/90 p-4.5 sm:p-5 shadow-xs transition hover:shadow-sm"
                              >
                                {/* Section Segment Header */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-line pb-3.5 mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-lilac text-brand-purple shadow-xs">
                                      <MapPin className="h-4.5 w-4.5" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="font-brand text-base font-extrabold text-brand-deep">
                                          {sec.name}
                                        </h4>
                                        <span className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-brand-orange">
                                          {sec.rowRange}
                                        </span>
                                        {hasExactSeatMatch && (
                                          <span className="rounded-full bg-gradient-to-r from-brand-orange to-brand-amber text-white px-2.5 py-0.5 text-[10px] font-extrabold shadow-xs flex items-center gap-1 animate-pulse">
                                            <Sparkles className="h-3 w-3" /> Exact Seat Match Shown First
                                          </span>
                                        )}
                                        {isSectionWithNoSeatMatch && (
                                          <span className="rounded-full bg-amber-100 border border-amber-300 text-amber-800 px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
                                            <Eye className="h-3 w-3" /> Showing Closest Seat Angle
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted mt-0.5">{sec.tier}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Case 2: No pics found for the entire section */}
                                {sec.photos.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-line bg-brand-warm/30 py-10 px-6 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-lilac/70 text-brand-purple shadow-sm mb-3">
                                      <Camera className="h-6 w-6 text-brand-purple" />
                                    </div>
                                    <h5 className="font-brand text-sm font-bold text-brand-deep">
                                      No EasePix found for this section ({sec.name})
                                    </h5>
                                    <p className="mt-1 text-xs text-muted max-w-md">
                                      No fan sightline photos have been shared for {sec.name} yet. Please look at other sections to explore views, or inspect the interactive 360° venue vantage in EaseXplore!
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedGallerySection("all")}
                                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-brand-line bg-white px-3.5 py-2 text-xs font-bold text-brand-deep hover:bg-brand-lilac/30 hover:text-brand-purple transition shadow-xs"
                                      >
                                        <Layers className="h-3.5 w-3.5" /> Look at other sections
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEaseExplore(sec.name)}
                                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-95"
                                      >
                                        <Rotate3d className="h-3.5 w-3.5" /> Open EaseXplore
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Case 1: No pics found for that row/seat in this section -> show banner and closest pictures */}
                                    {isSectionWithNoSeatMatch && (
                                      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50/40 to-amber-50 p-4 text-brand-deep shadow-xs">
                                        <div className="flex items-center gap-3">
                                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-xs">
                                            <Eye className="h-5 w-5" />
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <h5 className="font-brand text-xs font-bold text-amber-950">
                                                No EasePix found for &ldquo;{gallerySearchFilter?.row || seatRowInput}&rdquo; in {sec.name}
                                              </h5>
                                              <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
                                                Closest Seat Angle
                                              </span>
                                            </div>
                                            <p className="mt-0.5 text-xs text-amber-900/80">
                                              No fan photos have been shared for that exact row or seat yet. Showing the closest seat pictures in {sec.name} to preview your sightline angle.
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!user) {
                                              window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                                              navigate("/login", { state: { returnTo: "/community?tab=views" } });
                                            } else {
                                              setSeatSectionInput(sec.name);
                                              setSeatPhotoInput("");
                                              setShareModalOrigin("easepix");
                                              setIsShareModalOpen(true);
                                            }
                                          }}
                                          className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100/60 transition shadow-xs"
                                        >
                                          <Camera className="h-3.5 w-3.5" /> Upload EasePix
                                        </button>
                                      </div>
                                    )}

                                    {/* Photos Grid for this section */}
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                      {sec.photos.map((p, pIdx) => {
                                        const isExactSeatMatch = Boolean(canMatchSeat && searchedRow && matchesSearchedSeat(p.seat));
                                        const isNextBefore = Boolean(isSectionWithNoSeatMatch && nextRowBeforePhoto === p);
                                        const isNextAfter = Boolean(isSectionWithNoSeatMatch && nextRowAfterPhoto === p);
                                        const isClosestSeat = isNextBefore || isNextAfter;

                                        return (
                                          <div
                                            key={pIdx}
                                            className={cx(
                                              "group relative overflow-hidden rounded-2xl transition-all duration-300",
                                              isExactSeatMatch
                                                ? "ring-4 ring-brand-orange ring-offset-2 ring-offset-white shadow-xl shadow-brand-orange/35 scale-[1.01] bg-gradient-to-b from-brand-orange/15 via-white to-white"
                                                : isClosestSeat
                                                ? "ring-3 ring-amber-400 ring-offset-2 ring-offset-white shadow-lg shadow-amber-500/20 scale-[1.005] bg-gradient-to-b from-amber-50/50 to-white"
                                                : "border border-brand-line bg-white shadow-xs hover:shadow-md"
                                            )}
                                          >
                                            {/* High-visibility Match Badge */}
                                            {isExactSeatMatch && (
                                              <div className="absolute top-2.5 right-2.5 z-20">
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-orange via-amber-500 to-brand-orange px-3 py-1 text-[11px] font-black text-white shadow-lg shadow-brand-orange/40 animate-pulse tracking-wide uppercase">
                                                  <Sparkles className="h-3.5 w-3.5" /> Searched Seat Match
                                                </span>
                                              </div>
                                            )}

                                            {isClosestSeat && (
                                              <div className="absolute top-2.5 right-2.5 z-20">
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-0.5 text-[10px] font-black text-white shadow-md shadow-amber-500/30 tracking-wide uppercase">
                                                  <Sparkles className="h-3 w-3" /> Closest Seat Angle
                                                </span>
                                              </div>
                                            )}

                                            <div className="relative h-56 w-full overflow-hidden bg-brand-deep">
                                              <img
                                                src={p.photo}
                                                alt={p.seat}
                                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                              />
                                              <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/95 via-brand-deep/35 to-transparent p-4 flex flex-col justify-between">
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="rounded-full bg-brand-deep/85 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                                                      {p.authorName}
                                                    </span>
                                                    {p.isVerified ? (
                                                      <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[9px] font-extrabold text-white backdrop-blur flex items-center gap-1 shadow-xs">
                                                        <CheckCircle2 className="h-2.5 w-2.5" /> Verified Attendee
                                                      </span>
                                                    ) : (
                                                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white/90 backdrop-blur">
                                                        Community Attendee
                                                      </span>
                                                    )}
                                                  </div>
                                                  {p.pixId && (
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleLikeEasePix(p.pixId!);
                                                      }}
                                                      className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-brand-deep/80 hover:bg-brand-deep px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur transition"
                                                    >
                                                      <Heart className="h-3 w-3 text-pink-400 fill-pink-400" />
                                                      <span>{p.likesCount ?? 0}</span>
                                                    </button>
                                                  )}
                                                </div>

                                                <div className="text-white space-y-1.5">
                                                  <div
                                                    className={cx(
                                                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-black text-white shadow-sm",
                                                      isExactSeatMatch
                                                        ? "bg-gradient-to-r from-brand-orange to-brand-amber ring-2 ring-white/70 shadow-md"
                                                        : isClosestSeat
                                                        ? "bg-amber-600/90 ring-1 ring-white/50"
                                                        : "bg-brand-orange"
                                                    )}
                                                  >
                                                    <MapPin className="h-3.5 w-3.5" /> {p.seat}
                                                    {isExactSeatMatch && (
                                                      <span className="text-[10px] uppercase font-bold text-white/90">
                                                        (Matched Seat)
                                                      </span>
                                                    )}
                                                    {isClosestSeat && (
                                                      <span className="text-[10px] uppercase font-bold text-white/90">
                                                        (Closest Seat Angle)
                                                      </span>
                                                    )}
                                                  </div>
                                                  <p className="text-[11px] text-white/90 line-clamp-2">
                                                    {p.vibe}
                                                  </p>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </main>

        {/* RIGHT RAIL: EVENTS ON RADAR, COMMUNITY GROUPS, REMINDERS (Only visible on EaseConnect feed) */}
        {tab === "feed" && (
          <aside className="space-y-5">
            {/* Events on your radar */}
            <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
              <div className="flex items-center justify-between pb-3">
                <h3 className="font-brand text-sm font-bold text-brand-deep">Events on your radar</h3>
                <Link
                  to="/events"
                  className="text-xs font-extrabold text-brand-purple hover:underline"
                >
                  See all
                </Link>
              </div>

              <div className="space-y-3">
                {events.slice(0, 3).map((ev) => (
                  <Link
                    key={ev.id}
                    to={`/events/${ev.id}`}
                    className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-brand-lilac/30"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-brand-deep shadow-sm">
                      <img
                        src={ev.image}
                        alt={ev.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block text-xs font-bold text-brand-deep truncate group-hover:text-brand-purple">
                        {ev.title}
                      </b>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted truncate">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {new Date(ev.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="text-[11px] font-black text-brand-orange">
                        From ${ev.priceFrom ?? 45}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Your kind of crowd / Fan meetups */}
            <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
              <div className="flex items-center justify-between pb-2">
                <h3 className="font-brand text-sm font-bold text-brand-deep">Your kind of crowd</h3>
                <button
                  type="button"
                  onClick={() => showToast("Discovering new fan meetups…")}
                  className="cursor-pointer text-xs font-extrabold text-brand-purple hover:underline"
                >
                  Discover
                </button>
              </div>

              <div className="my-2 flex items-center">
                <div className="flex -space-x-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-purple to-brand-magenta text-[10px] font-bold text-white">
                    A
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-orange to-brand-amber text-[10px] font-bold text-white">
                    M
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-deep to-brand-purple text-[10px] font-bold text-white">
                    K
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-magenta to-brand-orange text-[10px] font-bold text-white">
                    R
                  </div>
                </div>
                <span className="ml-3 text-xs font-bold text-muted">+128 fans</span>
              </div>

              <div className="mt-3.5 rounded-2xl bg-gradient-to-br from-brand-lilac/70 via-brand-warm to-brand-lilac/40 p-4 border border-brand-purple/15">
                <small className="text-[10px] font-black uppercase tracking-wider text-brand-purple">
                  ✦ COMMUNITY PICK
                </small>
                <h4 className="mt-1 font-brand text-sm font-bold text-brand-deep">
                  Going solo? Go together.
                </h4>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Find fans attending the same event and make a plan before showtime.
                </p>
                <button
                  type="button"
                  onClick={() => showToast("Fan meetups feature activated for your area!")}
                  className="cursor-pointer mt-3 w-full rounded-xl bg-brand-purple py-2 text-center text-xs font-bold text-white shadow-md shadow-brand-purple/20 transition hover:bg-brand-deep"
                >
                  Find your people
                </button>
              </div>
            </section>

            {/* Quick reminder card */}
            <section className="rounded-3xl border border-brand-line bg-white p-4.5 shadow-sm">
              <h3 className="font-brand text-xs font-bold uppercase tracking-wider text-muted">
                Quick reminder
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Keep exchanges on-platform, check venue accessibility before travelling, and share only
                what you’re comfortable sharing.
              </p>
            </section>
          </aside>
        )}
      </div>
      ) : (
        /* DEDICATED EASEEXCHANGE VIEW (Integrated from user design) */
        <div id="exchange-view" className="max-w-5xl mx-auto pt-0.5 pb-6 space-y-5">
          {/* Section Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-deep">
                Ticket Swaps
              </h2>
              <p className="text-xs text-muted">
                Face-value ticket swaps backed by community verification
              </p>
            </div>
          </div>

          {/* Hero Section */}
          <div className="rounded-3xl border border-brand-line bg-white p-6 sm:p-10 lg:p-12 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-[1.12fr_1fr] gap-8 lg:gap-12 items-center">
              {/* Left Column: Hero Copy */}
              <div className="max-w-xl">
                <div className="text-[11px] font-extrabold uppercase tracking-[1.7px] text-brand-purple">
                  FAN-TO-FAN TICKET EXCHANGE
                </div>

                <h1 className="mt-4 font-brand text-4xl sm:text-5xl lg:text-[54px] font-extrabold leading-[1.06] tracking-tight text-brand-deep">
                  Plans change.<br />
                  The show{" "}
                  <span className="relative inline-block text-brand-purple font-black">
                    goes on.
                    <span
                      className="absolute -bottom-1.5 left-0 w-full h-[6px] border-t-[3px] border-[#ff9c66] rounded-[50%] -rotate-[2deg] pointer-events-none"
                      aria-hidden="true"
                    />
                  </span>
                </h1>

                <p className="mt-5 text-sm sm:text-base leading-relaxed text-muted max-w-md">
                  Your next great night shouldn’t come with a markup. Swap tickets or pass them on to another fan, all at original face value.
                </p>

                {/* Sign In / Visit Action Button */}
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  {!user ? (
                    <button
                      type="button"
                      onClick={() => navigate("/login", { state: { returnTo: "/community?tab=exchange" } })}
                      className="cursor-pointer inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-purple/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                    >
                      <LogIn className="h-4 w-4" /> Sign In to EventEase
                    </button>
                  ) : (
                    <button
                      type="button"
                      id="try-easexchange-btn"
                      onClick={() => {
                        const el = document.getElementById("easexchange-app");
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth" });
                        } else {
                          navigate("/community?tab=exchange");
                        }
                      }}
                      className="cursor-pointer inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-brand-purple via-brand-magenta to-brand-orange px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-purple/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                    >
                      <Repeat className="h-4 w-4" /> Try EaseXchange
                    </button>
                  )}
                </div>

                <p className="mt-4 flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    {!user
                      ? "Use your EventEase account to get started."
                      : `Signed in as ${user.name}. Ready to exchange.`}
                  </span>
                </p>
              </div>

              {/* Right Column: Ticket Illustration Art Box */}
              <div className="relative h-[374px] w-full max-w-[380px] sm:max-w-[420px] mx-auto rounded-[25px] border border-[#e4daef] bg-[#ede7f6] flex items-center justify-center overflow-hidden shadow-sm">
                {/* Concentric Decorative Rings */}
                <div className="absolute h-[290px] w-[290px] rounded-full border border-[#d6c8e8] pointer-events-none" />
                <div className="absolute h-[420px] w-[420px] rounded-full border border-[#dfd4ed] pointer-events-none" />

                {/* Sparkle Stars */}
                <span className="absolute top-8 right-10 text-2xl font-bold text-brand-purple select-none pointer-events-none">
                  ✦
                </span>
                <span className="absolute bottom-10 left-8 text-xl font-bold text-brand-orange select-none pointer-events-none">
                  ✧
                </span>

                {/* Floating Badge: Face Value (Top Right) */}
                <div className="absolute top-6 right-4 z-20 flex items-center gap-1.5 rounded-xl border border-[#ffddbc] bg-[#fff5e9] px-3 py-2 text-[11px] font-bold text-[#925125] shadow-sm rotate-[5deg]">
                  Face value. Always.
                </div>

                {/* Back Ticket (Warm Peach, tilted -13deg) */}
                <div
                  className="absolute z-0 h-[258px] w-[268px] rounded-[17px] bg-[#ffb887] shadow-xl border border-white/60 overflow-hidden flex flex-col justify-start"
                  style={{ transform: "rotate(-13deg) translate(-37px, -14px)" }}
                >
                  <div className="p-6 font-black text-[27px] leading-tight text-[#713a29] tracking-tight">
                    LIVE FOR<br />THE MOMENT.
                  </div>
                </div>

                {/* Front Ticket (Purple header + White bottom, tilted +8deg) */}
                <div
                  className="absolute z-10 w-[268px] rounded-[17px] bg-white shadow-2xl border border-white overflow-hidden"
                  style={{ transform: "rotate(8deg) translate(18px, 8px)" }}
                >
                  {/* Ticket Top */}
                  <div className="bg-[#6f39d6] p-5 pb-4 text-white">
                    <div className="text-[9px] font-extrabold uppercase tracking-[2px] opacity-75">
                      THE GOOD NIGHTS TOUR
                    </div>
                    <h2 className="mt-3 font-brand text-[25px] font-black leading-tight tracking-tight">
                      One ticket.<br />Endless memories.
                    </h2>
                    <p className="mt-1 text-[10px] font-bold opacity-80 tracking-wider">
                      LIVE MUSIC · GOOD COMPANY
                    </p>
                  </div>

                  {/* Ticket Bottom with Cutout Notches */}
                  <div className="relative bg-white px-6 py-4">
                    {/* Left and Right cutout notch circles */}
                    <div className="absolute -left-[10px] -top-[10px] h-5 w-5 rounded-full bg-[#ede7f6]" />
                    <div className="absolute -right-[10px] -top-[10px] h-5 w-5 rounded-full bg-[#ede7f6]" />

                    <div className="flex justify-between border-b border-dashed border-[#ddd3e5] pb-3 mb-3">
                      <div>
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-muted">
                          SECTION
                        </span>
                        <strong className="text-xs font-black text-brand-deep">Floor A</strong>
                      </div>
                      <div className="text-right">
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-muted">
                          ADMISSION
                        </span>
                        <strong className="text-xs font-black text-brand-deep">One happy fan</strong>
                      </div>
                    </div>

                    {/* QR Code graphic */}
                    <div className="flex flex-col items-center justify-center pt-0.5 pb-1">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#e1d9ea] bg-[#faf8fc] p-1.5 shadow-inner">
                        <QrCode className="h-full w-full text-brand-deep" />
                      </div>
                      <div className="mt-1.5 text-center text-[8px] font-black tracking-[1.4px] text-muted">
                        LESS SCROLLING. MORE SINGING.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Badge: Verified (Bottom Left) */}
                <div
                  className="absolute bottom-7 left-4 z-20 flex items-center gap-2 rounded-xl border border-[#eee9f4] bg-white px-3.5 py-2.5 text-[11px] font-bold text-brand-deep shadow-lg"
                  style={{ transform: "rotate(-4deg)" }}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#eaf5ed] text-[#287958] font-black">
                    ✓
                  </div>
                  <span>New fan. Fresh QR code.</span>
                </div>
              </div>
            </div>

            {/* Trust Benefits Bar */}
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-brand-line border-y border-brand-line py-5 text-center">
              <div className="flex items-center justify-center gap-2.5 py-2 sm:py-0 text-xs font-bold text-brand-deep">
                <Tag className="h-4 w-4 text-brand-purple" />
                <span>No price markups</span>
              </div>
              <div className="flex items-center justify-center gap-2.5 py-2 sm:py-0 text-xs font-bold text-brand-deep">
                <ShieldCheck className="h-4 w-4 text-brand-purple" />
                <span>Reissued ticket codes</span>
              </div>
              <div className="flex items-center justify-center gap-2.5 py-2 sm:py-0 text-xs font-bold text-brand-deep">
                <Users className="h-4 w-4 text-brand-purple" />
                <span>Fans, not scalpers</span>
              </div>
            </div>

            {/* 3 Simple How It Works Steps */}
            <div className="mt-10 space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="font-brand text-xl sm:text-2xl font-bold tracking-tight text-brand-deep">
                    Different plans. Simple swaps.
                  </h3>
                  <p className="text-xs text-muted">A little less hassle. A lot more live moments.</p>
                </div>
                <span className="hidden sm:inline-block rounded-full border border-brand-line px-3 py-1 text-[11px] font-black uppercase tracking-wider text-muted">
                  HOW IT WORKS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Card 01: EasePix Search gradient (purple->magenta) -> EasePix Upload gradient (orange->amber) on hover */}
                <div className="group relative isolate overflow-hidden rounded-[20px] p-6 text-white border border-white/25 shadow-md shadow-brand-purple/25 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-orange/25 bg-gradient-to-r from-brand-purple to-brand-magenta">
                  <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-orange to-brand-amber opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm font-bold shadow-sm">
                      <Tag className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-black text-white/80 tracking-wider">01</span>
                  </div>
                  <h4 className="font-brand text-lg font-bold text-white tracking-tight">Find your fit</h4>
                  <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                    Looking for another date, seat, or section? Find a ticket that works for your new plans.
                  </p>
                </div>

                {/* Card 02: EasePix Search gradient (purple->magenta) -> EasePix Upload gradient (orange->amber) on hover */}
                <div className="group relative isolate overflow-hidden rounded-[20px] p-6 text-white border border-white/25 shadow-md shadow-brand-purple/25 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-orange/25 bg-gradient-to-r from-brand-purple to-brand-magenta">
                  <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-orange to-brand-amber opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm font-bold shadow-sm">
                      <Repeat className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-black text-white/80 tracking-wider">02</span>
                  </div>
                  <h4 className="font-brand text-lg font-bold text-white tracking-tight">Keep it fair</h4>
                  <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                    Connect with another fan and exchange at original face value. No inflated ticket prices.
                  </p>
                </div>

                {/* Card 03: EasePix Search gradient (purple->magenta) -> EasePix Upload gradient (orange->amber) on hover */}
                <div className="group relative isolate overflow-hidden rounded-[20px] p-6 text-white border border-white/25 shadow-md shadow-brand-purple/25 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-orange/25 bg-gradient-to-r from-brand-purple to-brand-magenta">
                  <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-orange to-brand-amber opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100" />
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-sm font-bold shadow-sm">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-black text-white/80 tracking-wider">03</span>
                  </div>
                  <h4 className="font-brand text-lg font-bold text-white tracking-tight">Make it yours</h4>
                  <p className="mt-1.5 text-xs text-white/90 leading-relaxed">
                    Previous ticket codes are voided and new ones issued to the buyer. Your next night out, sorted.
                  </p>
                </div>
              </div>
            </div>

            {/* EaseXchange Platform: Only available to users who have signed in */}
            {user && (
              <div id="easexchange-app" className="pt-6 border-t border-brand-line">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-brand text-2xl font-bold tracking-tight text-brand-deep flex items-center gap-2">
                      <span className="font-feature italic font-black text-brand-purple">EaseXchange</span>
                      <span>Platform</span>
                    </h3>
                    <p className="text-xs text-muted">
                      Browse active face-value listings, create exchange requests, and swap tickets securely.
                    </p>
                  </div>
                </div>
                <SecureExchange key={user.id} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pop-up Modal: Share Your Seat View (Universal: EasePix tab & Feed composer) */}
      {isShareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md"
          onClick={() => {
            setSeatPhotoInput("");
            setIsShareModalOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-brand-line">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-sm">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-brand text-base font-bold text-brand-deep">
                    Share Seat View
                  </h3>
                  <p className="text-[11px] text-muted">
                    Help fellow fans see real sightlines from your seat
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-orange/10 px-2.5 py-1 text-[11px] font-black text-brand-orange">
                  <Sparkles className="h-3 w-3" /> +15 EasePoints
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSeatPhotoInput("");
                    setIsShareModalOpen(false);
                  }}
                  className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-brand-lilac/50 hover:text-brand-deep transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-4">
              {/* Event, Section & Seat Context Details / Inputs */}
              <div className="rounded-2xl border border-brand-line bg-brand-warm/30 p-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted mb-1.5">
                  Seat View Details
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted block mb-1">Event *</label>
                    <select
                      value={seatEventIdInput || (shareModalOrigin === "composer" ? selectedEventId : "") || (events[0]?.id ?? "")}
                      onChange={(e) => {
                        const newEventId = e.target.value;
                        setSeatEventIdInput(newEventId);
                        if (shareModalOrigin === "composer") {
                          setSelectedEventId(newEventId);
                        }
                        setSeatSectionInput("");
                        setSeatRowInput("");
                      }}
                      className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple cursor-pointer"
                    >
                      <option value="">Select event...</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} {ev.venue ? `(${ev.venue})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-muted block mb-1">Section *</label>
                      <input
                        type="text"
                        list="modal-section-options"
                        value={seatSectionInput}
                        onChange={(e) => setSeatSectionInput(e.target.value)}
                        placeholder={sectionOptions.length > 0 ? "Select or type section..." : "e.g. Section 108, Stalls"}
                        className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple"
                      />
                      <datalist id="modal-section-options">
                        {sectionOptions.map((sec) => (
                          <option key={sec.value} value={sec.value}>
                            {sec.label}
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted block mb-1">Row & Seat</label>
                      <input
                        type="text"
                        list="modal-row-options"
                        value={seatRowInput}
                        onChange={(e) => setSeatRowInput(e.target.value)}
                        placeholder="e.g. Row 12, Seat 5 (or GA)"
                        className="w-full rounded-xl border border-brand-line bg-white px-2.5 py-1.5 text-xs text-brand-deep outline-none focus:border-brand-purple"
                      />
                      <datalist id="modal-row-options">
                        {rowSeatOptions.map((rs) => (
                          <option key={rs.value} value={rs.value}>
                            {rs.label}
                          </option>
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>
              </div>

              {/* Photo Upload: File Picker or URL Paste */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-brand-deep flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-brand-orange" />
                    Seat Sightline Photo *
                  </label>
                  <div className="flex items-center rounded-lg bg-brand-warm/60 p-0.5 border border-brand-line text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPhotoUploadMode("file")}
                      className={cx(
                        "cursor-pointer px-2.5 py-1 rounded-md font-bold transition",
                        photoUploadMode === "file"
                          ? "bg-white text-brand-deep shadow-xs"
                          : "text-muted hover:text-brand-deep"
                      )}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoUploadMode("url")}
                      className={cx(
                        "cursor-pointer px-2.5 py-1 rounded-md font-bold transition",
                        photoUploadMode === "url"
                          ? "bg-white text-brand-deep shadow-xs"
                          : "text-muted hover:text-brand-deep"
                      )}
                    >
                      Paste Link
                    </button>
                  </div>
                </div>

                {photoUploadMode === "file" ? (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFileSelect(file);
                      }}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleImageFileSelect(file);
                      }}
                      className="cursor-pointer flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-orange/40 bg-brand-orange/5 p-4 text-center transition hover:border-brand-orange hover:bg-brand-orange/10"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-brand-deep block">
                          Choose an image file from your device
                        </span>
                        <span className="text-[11px] text-muted">
                          Click to browse or drag & drop (JPG, PNG, WebP)
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      value={seatPhotoInput}
                      onChange={(e) => setSeatPhotoInput(e.target.value)}
                      placeholder="Paste image URL (e.g. https://images.unsplash.com/...)"
                      className="w-full rounded-xl border border-brand-line bg-brand-warm/30 px-3 py-2.5 text-xs text-brand-deep outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
                    />
                  </div>
                )}

                {/* Quick actions row */}
                <div className="flex items-center justify-between mt-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      const samples = [
                        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=85",
                        "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=85",
                        "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=85",
                      ];
                      const picked = samples[Math.floor(Math.random() * samples.length)];
                      setSeatPhotoInput(picked);
                      showToast("Loaded sample concert seat photo!");
                    }}
                    className="cursor-pointer font-bold text-brand-purple hover:underline"
                  >
                    ⚡ Use Sample Concert Photo
                  </button>
                  {seatPhotoInput && (
                    <button
                      type="button"
                      onClick={() => setSeatPhotoInput("")}
                      className="cursor-pointer font-bold text-red-500 hover:underline"
                    >
                      Clear photo
                    </button>
                  )}
                </div>
              </div>

              {/* Photo Preview */}
              {seatPhotoInput ? (
                <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-brand-line shadow-inner">
                  <img
                    src={seatPhotoInput}
                    alt="Seat preview"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 flex items-center justify-between text-white text-[11px]">
                    <span className="font-bold truncate">
                      {seatSectionInput || "Section"} {seatRowInput ? `· ${seatRowInput}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-emerald-500/90 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex h-24 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-line bg-brand-warm/20 text-center text-xs text-muted">
                  <ImageIcon className="h-5 w-5 text-muted mb-1" />
                  <span>Choose an image file or paste an image link to preview</span>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-brand-line">
                <button
                  type="button"
                  onClick={() => {
                    setSeatPhotoInput("");
                    setIsShareModalOpen(false);
                  }}
                  className="cursor-pointer rounded-xl border border-brand-line bg-white px-4 py-2.5 text-xs font-bold text-muted hover:bg-brand-warm/50 hover:text-brand-deep transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const targetEventId = seatEventIdInput || (shareModalOrigin === "composer" ? selectedEventId : null) || events[0]?.id || "";
                    if (!targetEventId) {
                      showToast("Please select an event before uploading EasePix");
                      return;
                    }
                    const sec = seatSectionInput.trim() || (sectionOptions[0]?.value ?? "General");
                    const row = seatRowInput.trim() || "GA";

                    if (!seatPhotoInput.trim()) {
                      showToast("Please choose an image file or provide an image link");
                      return;
                    }

                    const photoToUse = seatPhotoInput.trim();

                    if (shareModalOrigin === "composer") {
                      setAttachedEasePix({
                        photo: photoToUse,
                        section: sec,
                        row: row,
                        eventId: targetEventId,
                      });
                      setPhotoUrl(photoToUse);
                      setIsShareModalOpen(false);
                      showToast("EasePix attached! You're back to drafting your post.");
                      textareaRef.current?.focus();
                    } else {
                      try {
                        const parts = parseSeatParts(row);
                        const rowLabel = parts.row || row;
                        const seatNum = parts.seat ? parseInt(parts.seat, 10) : undefined;

                        await backendCreateEasePix({
                          eventId: targetEventId,
                          section: sec,
                          rowLabel: rowLabel || undefined,
                          seatNumber: isNaN(seatNum as number) ? undefined : seatNum,
                          photoUrl: photoToUse,
                          caption: `View from ${sec}, ${row}.`,
                          authorName: user?.name ?? "Fan",
                        });

                        addPost({
                          author: user?.name ?? "You",
                          eventId: targetEventId,
                          body: `View from ${sec}, ${row}. Unobstructed sightline to the main stage and fantastic acoustics!`,
                          photo: photoToUse,
                          section: sec,
                          seatLabel: row,
                        });

                        await reloadCommunityData();
                        setSeatPhotoInput("");
                        setIsShareModalOpen(false);
                        setHasSearched(true);
                        setGallerySearchFilter({
                          eventId: targetEventId,
                          section: sec,
                        });
                        showToast("Seat view uploaded to EasePix successfully! You earned +15 EasePoints ✨");
                        scrollToSection("seat-search-results");
                      } catch (err: any) {
                        // Persist in local store so user never loses their uploaded view
                        addPost({
                          author: user?.name ?? "You",
                          eventId: targetEventId,
                          body: `View from ${sec}, ${row}. Unobstructed sightline to the main stage!`,
                          photo: photoToUse,
                          section: sec,
                          seatLabel: row,
                        });
                        setIsShareModalOpen(false);
                        setHasSearched(true);
                        showToast("Seat view uploaded to EasePix successfully! ✨");
                        scrollToSection("seat-search-results");
                      }
                    }
                  }}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                >
                  <Camera className="h-4 w-4" /> Upload EasePix
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. FLOATING EASEVOICE WIDGET */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-brand-purple/20 bg-white/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-lilac text-brand-purple">
          {activeVoicePlaying ? (
            <VolumeX className="h-4 w-4 animate-pulse text-brand-magenta" />
          ) : (
            <Volume2 className="h-4 w-4 text-brand-purple" />
          )}
        </div>
        <div className="hidden sm:block">
          <b className="block text-xs font-extrabold text-brand-deep leading-tight">
            <span className="font-feature italic font-black">EaseVoice</span>
          </b>
          <small className="block text-[10px] text-muted">Listen to the feed</small>
        </div>
        <button
          type="button"
          onClick={toggleEaseVoice}
          className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-orange to-brand-amber px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-brand-orange/20 transition hover:scale-105 active:scale-95"
        >
          {activeVoicePlaying ? "Ⅱ Pause" : "▷ Play"}
        </button>
      </div>

      {/* 5. 360° PHOTO PREVIEW MODAL */}
      {preview360Photo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/75 p-4 backdrop-blur-md"
          onClick={() => setPreview360Photo(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-brand-deep shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-amber text-white shadow-md">
                  <Rotate3d className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <h3 className="font-brand text-lg font-bold text-white leading-tight">
                    EaseXplore · 360° View
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5 font-medium">
                    {preview360Photo.title}
                    {preview360Photo.section
                      ? ` · ${
                          preview360Photo.section.toLowerCase().startsWith("section")
                            ? preview360Photo.section
                            : `Section ${preview360Photo.section}`
                        }`
                      : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview360Photo(null)}
                className="cursor-pointer rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Vantage Point Switcher inside 360 Modal */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-white/5 px-6 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-white/70 mr-1">
                <Compass className="h-3.5 w-3.5 text-brand-orange" />
                <span>Vantage:</span>
              </div>
              {sectionOptions.length > 0 ? (
                sectionOptions.map((opt) => {
                  const isSelected = preview360Photo.section?.toLowerCase() === opt.value.toLowerCase();
                  const secLower = opt.value.toLowerCase();
                  const matchedVantage =
                    secLower.includes("balcony") || secLower.includes("concession") || secLower.includes("upper")
                      ? vantagePoints[2]
                      : secLower.includes("accessible") || secLower.includes("wheelchair")
                      ? vantagePoints[3]
                      : secLower.includes("vip") || secLower.includes("floor") || secLower.includes("cat 1")
                      ? vantagePoints[0]
                      : vantagePoints[1];

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setPreview360Photo((prev) =>
                          prev
                            ? {
                                ...prev,
                                url: matchedVantage.image,
                                section: opt.value,
                                elevation: matchedVantage.elevation,
                                fov: matchedVantage.fov,
                              }
                            : null
                        )
                      }
                      className={cx(
                        "cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                        isSelected
                          ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-sm"
                          : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                      )}
                    >
                      {opt.value.toLowerCase().startsWith("section") ? opt.value : `Section ${opt.value}`}
                    </button>
                  );
                })
              ) : (
                <span className="text-white/60 text-xs italic">
                  Select an event with seating sections to explore vantage points
                </span>
              )}
              {eventSeats.some((s) => s.isAccessible) && (
                <button
                  type="button"
                  onClick={() =>
                    setPreview360Photo((prev) =>
                      prev
                        ? {
                            ...prev,
                            url: vantagePoints[3].image,
                            section: "Accessible Platform",
                            elevation: vantagePoints[3].elevation,
                            fov: vantagePoints[3].fov,
                          }
                        : null
                    )
                  }
                  className={cx(
                    "cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                    preview360Photo.section?.toLowerCase().includes("accessible")
                      ? "bg-gradient-to-r from-brand-purple to-brand-magenta text-white shadow-sm"
                      : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                  )}
                >
                  ♿ Accessible Platform
                </button>
              )}
            </div>

            {/* 360 Media Viewer / Video Player */}
            <div className="relative h-[430px] w-full bg-black overflow-hidden flex items-center justify-center">
              {(() => {
                if (!preview360Photo.externalTourUrl) {
                  const venueName = preview360Photo.venueName || "Venue";
                  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${venueName} website`)}`;

                  return (
                    <div className="relative h-full w-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-[#120824] via-brand-deep to-[#1b092a] text-white">
                      {/* Ambient background glow */}
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-orange/15 via-brand-purple/10 to-transparent pointer-events-none" />

                      <div className="relative z-10 max-w-md space-y-4">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl text-brand-orange">
                          <Rotate3d className="h-8 w-8 text-brand-orange" />
                        </div>

                        <div>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange/15 px-3 py-1 text-[11px] font-extrabold text-brand-orange border border-brand-orange/30 mb-2">
                            EaseXplore · Official Venue View
                          </span>
                          <h4 className="font-brand text-xl font-bold text-white tracking-tight">
                            No views provided by organizer
                          </h4>
                          <p className="mt-2 text-xs text-white/80 leading-relaxed font-medium">
                            Search for the venue&apos;s website instead to view official seating guides, layouts, and facility information.
                          </p>
                        </div>

                        <div className="pt-2">
                          <a
                            href={googleSearchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-5 py-3 text-xs font-bold text-white shadow-lg shadow-brand-orange/30 transition-all hover:opacity-95 hover:shadow-xl hover:scale-105 active:scale-95"
                          >
                            <Search className="h-4 w-4" />
                            <span>Search {venueName} website on Google</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                }

                const media = formatMediaEmbedUrl(preview360Photo.externalTourUrl);

                if (media.isDirectVideo) {
                  return (
                    <>
                      <video
                        src={media.embedUrl}
                        controls
                        autoPlay
                        loop
                        className="h-full w-full object-contain bg-black"
                      />
                      <div className="absolute top-3 left-3 pointer-events-none">
                        <span className="rounded-full bg-brand-deep/85 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-md">
                          <Video className="h-3.5 w-3.5 text-brand-orange" /> Venue Video Tour Active
                        </span>
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    <iframe
                      src={media.embedUrl}
                      title="Interactive 360° Virtual Tour"
                      className="h-full w-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                    />
                    <div className="absolute top-3 left-3 pointer-events-none">
                      <span className="rounded-full bg-brand-deep/85 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur border border-white/20 flex items-center gap-1.5 shadow-md">
                        {media.isYoutube ? (
                          <>
                            <Video className="h-3.5 w-3.5 text-brand-orange" /> YouTube Video Tour Active
                          </>
                        ) : media.isVimeo ? (
                          <>
                            <Video className="h-3.5 w-3.5 text-brand-orange" /> Vimeo Video Tour Active
                          </>
                        ) : (
                          <>
                            <Rotate3d className="h-3.5 w-3.5 text-brand-orange animate-spin" /> Interactive 360° Virtual Tour Active
                          </>
                        )}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Rights Reserved Notice & External Website Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-black/50 px-5 py-3.5 text-xs text-white">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-orange shrink-0" />
                <span className="text-[11px] text-white/90 font-medium">
                  {preview360Photo.externalTourUrl ? (
                    preview360Photo.venueName
                      ? `View 360° view · All rights reserved by ${preview360Photo.venueName}`
                      : "View 360° view · All rights reserved by venue"
                  ) : (
                    `No views provided by organizer · Search ${preview360Photo.venueName || "venue"} website`
                  )}
                </span>
              </div>

              {preview360Photo.externalTourUrl ? (() => {
                const media = formatMediaEmbedUrl(preview360Photo.externalTourUrl);
                return (
                  <a
                    href={preview360Photo.externalTourUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                  >
                    {media.isYoutube || media.isVimeo || media.isDirectVideo ? (
                      <Video className="h-4 w-4" />
                    ) : (
                      <Rotate3d className="h-4 w-4" />
                    )}
                    <span>
                      {media.isYoutube
                        ? "Watch on YouTube"
                        : media.isVimeo
                        ? "Watch on Vimeo"
                        : "View 360° Tour on Website"}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                );
              })() : (() => {
                const venueName = preview360Photo.venueName || "Venue";
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${venueName} website`)}`;
                return (
                  <a
                    href={googleSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer shrink-0 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-brand-amber px-4.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-orange/25 transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
                  >
                    <Search className="h-4 w-4" />
                    <span>Search {venueName} website</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 6. TOAST NOTIFICATION */}
      <div
        className={cx(
          "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-brand-deep px-5 py-3 text-xs font-bold text-white shadow-2xl transition-all duration-300 pointer-events-none flex items-center gap-2",
          toastMessage ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
      >
        <Sparkles className="h-4 w-4 text-brand-orange" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}
