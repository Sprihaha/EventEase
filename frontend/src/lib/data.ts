export type Role = "customer" | "organizer" | "admin";

export type Category = "Concert" | "Theatre" | "Sports" | "Cultural";

export type TicketTier = {
  id: string;
  name: string; // VIP, Standard, Concession
  price: number;
  total: number;
  sold: number;
};

export type EventStatus = "published" | "pending" | "rejected" | "draft";

export type EventItem = {
  id: string;
  title: string;
  category: Category;
  date: string; // ISO
  doors: string;
  venue: string;
  city: string;
  image: string;
  blurb: string;
  organizerId: string;
  organizerName: string;
  status: EventStatus;
  featured?: boolean;
  tiers: TicketTier[];
  rows: number;
  cols: number;
  earlyBird?: number; // percent off
};

export type SeatBooking = { seat: string; tier: string };

export type Booking = {
  id: string;
  ref: string;
  eventId: string;
  userId: string;
  seats: SeatBooking[];
  total: number;
  purchasedAt: string;
  status: "confirmed" | "cancelled" | "refunded" | "listed";
  promo?: string;
};

export type AssistanceStatus =
  | "Submitted"
  | "Assigned"
  | "In progress"
  | "Completed"
  | "Cancelled";

export type AssistanceLevel = "Basic" | "Moderate" | "Full support";

export type AssistanceRequest = {
  id: string;
  bookingId: string;
  eventId: string;
  userId: string;
  requesterUsername: string;
  supportNeeds: string;
  level: AssistanceLevel;
  assignedStaff?: string;
  status: AssistanceStatus;
  createdAt: string;
};

export type ExchangeListing = {
  id: string;
  bookingId: string;
  eventId: string;
  sellerName: string;
  seat: string;
  tier: string;
  askPrice: number;
  verified: boolean;
};

export type CommunityPost = {
  id: string;
  eventId: string;
  author: string;
  body: string;
  section?: string;
  photo?: string;
  when: string;
  likes: number;
};

export type FraudAlert = {
  id: string;
  ref: string;
  type: "Duplicate QR scan" | "Chargeback pattern" | "Bulk bot purchase" | "Reseller markup";
  severity: "low" | "medium" | "high";
  event: string;
  detail: string;
  when: string;
  resolved: boolean;
};

export type OrganizerAccount = {
  id: string;
  name: string;
  contact: string;
  status: "approved" | "pending" | "suspended";
  events: number;
  since: string;
};

const img = (id: string, q: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

export const seedEvents: EventItem[] = [
  {
    id: "ev-aurora",
    title: "Aurora — Midnight Tour",
    category: "Concert",
    date: "2026-10-18T20:00:00",
    doors: "18:30",
    venue: "The National Stadium",
    city: "Singapore",
    image: img("photo-1470229722913-7c0e2dbbafd3", "concert"),
    blurb: "Synth-pop phenomenon Aurora brings her sold-out Midnight Tour to the region for one night only.",
    organizerId: "org-livenation",
    organizerName: "Live Nation Asia",
    status: "published",
    featured: true,
    rows: 8,
    cols: 12,
    earlyBird: 15,
    tiers: [
      { id: "t1", name: "VIP", price: 320, total: 32, sold: 21 },
      { id: "t2", name: "Standard", price: 148, total: 48, sold: 30 },
      { id: "t3", name: "Concession", price: 89, total: 16, sold: 9 },
    ],
  },
  {
    id: "ev-hamlet",
    title: "Hamlet — A New Staging",
    category: "Theatre",
    date: "2026-09-27T19:30:00",
    doors: "19:00",
    venue: "Esplanade Theatre",
    city: "Singapore",
    image: img("photo-1503095396549-807759245b35", "theatre"),
    blurb: "A stark, modern reimagining of Shakespeare's tragedy from the acclaimed Bridge Company.",
    organizerId: "org-bridge",
    organizerName: "Bridge Company",
    status: "published",
    featured: true,
    rows: 6,
    cols: 10,
    tiers: [
      { id: "t1", name: "VIP", price: 210, total: 20, sold: 12 },
      { id: "t2", name: "Standard", price: 120, total: 40, sold: 18 },
      { id: "t3", name: "Concession", price: 65, total: 20, sold: 14 },
    ],
  },
  {
    id: "ev-derby",
    title: "City Derby — Finals Night",
    category: "Sports",
    date: "2026-11-02T18:00:00",
    doors: "16:30",
    venue: "OCBC Arena",
    city: "Singapore",
    image: img("photo-1522778119026-d647f0596c20", "sports"),
    blurb: "The season decider. Two rivals, one trophy, ninety unforgettable minutes.",
    organizerId: "org-livenation",
    organizerName: "Live Nation Asia",
    status: "published",
    featured: true,
    rows: 10,
    cols: 14,
    tiers: [
      { id: "t1", name: "VIP", price: 180, total: 40, sold: 33 },
      { id: "t2", name: "Standard", price: 78, total: 80, sold: 61 },
      { id: "t3", name: "Concession", price: 42, total: 20, sold: 20 },
    ],
  },
  {
    id: "ev-lantern",
    title: "Lantern Festival Night Market",
    category: "Cultural",
    date: "2026-10-05T17:00:00",
    doors: "17:00",
    venue: "Gardens Amphitheatre",
    city: "Singapore",
    image: img("photo-1533174072545-7a4b6ad7a6c3", "lantern"),
    blurb: "A celebration of light, food, and craft — an immersive evening for the whole family.",
    organizerId: "org-heritage",
    organizerName: "Heritage Collective",
    status: "published",
    rows: 6,
    cols: 12,
    earlyBird: 20,
    tiers: [
      { id: "t1", name: "VIP", price: 96, total: 24, sold: 8 },
      { id: "t2", name: "Standard", price: 44, total: 48, sold: 22 },
      { id: "t3", name: "Concession", price: 24, total: 20, sold: 6 },
    ],
  },
  {
    id: "ev-jazz",
    title: "Blue Note — Late Night Jazz",
    category: "Concert",
    date: "2026-09-20T21:00:00",
    doors: "20:15",
    venue: "Victoria Concert Hall",
    city: "Singapore",
    image: img("photo-1511192336575-5a79af67a629", "jazz"),
    blurb: "An intimate evening of standards and improvisation with the Blue Note quartet.",
    organizerId: "org-bridge",
    organizerName: "Bridge Company",
    status: "pending",
    rows: 5,
    cols: 10,
    tiers: [
      { id: "t1", name: "VIP", price: 140, total: 20, sold: 0 },
      { id: "t2", name: "Standard", price: 82, total: 30, sold: 0 },
      { id: "t3", name: "Concession", price: 48, total: 10, sold: 0 },
    ],
  },
  {
    id: "ev-ballet",
    title: "Swan Lake — Winter Gala",
    category: "Theatre",
    date: "2026-12-14T19:00:00",
    doors: "18:15",
    venue: "Esplanade Theatre",
    city: "Singapore",
    image: img("photo-1518834107812-67b0b7c58434", "ballet"),
    blurb: "The national ballet returns with its most beloved production, staged for the holidays.",
    organizerId: "org-heritage",
    organizerName: "Heritage Collective",
    status: "published",
    rows: 7,
    cols: 12,
    tiers: [
      { id: "t1", name: "VIP", price: 240, total: 28, sold: 15 },
      { id: "t2", name: "Standard", price: 130, total: 44, sold: 20 },
      { id: "t3", name: "Concession", price: 70, total: 12, sold: 5 },
    ],
  },
];

export const seedOrganizers: OrganizerAccount[] = [
  { id: "org-livenation", name: "Live Nation Asia", contact: "ops@livenation.asia", status: "approved", events: 2, since: "2024-03-11" },
  { id: "org-bridge", name: "Bridge Company", contact: "hello@bridgeco.sg", status: "approved", events: 2, since: "2024-08-02" },
  { id: "org-heritage", name: "Heritage Collective", contact: "team@heritage.sg", status: "approved", events: 2, since: "2025-01-19" },
  { id: "org-nova", name: "Nova Live Events", contact: "apply@novalive.sg", status: "pending", events: 0, since: "2026-09-01" },
  { id: "org-pulse", name: "Pulse Promotions", contact: "info@pulsepromo.sg", status: "pending", events: 0, since: "2026-09-08" },
];

export const seedBookings: Booking[] = [
  {
    id: "bk-1",
    ref: "EE-8F3K21",
    eventId: "ev-hamlet",
    userId: "u-cust",
    seats: [
      { seat: "B4", tier: "Standard" },
      { seat: "B5", tier: "Standard" },
    ],
    total: 240,
    purchasedAt: "2026-08-30T12:04:00",
    status: "confirmed",
  },
  {
    id: "bk-2",
    ref: "EE-2QP907",
    eventId: "ev-derby",
    userId: "u-cust",
    seats: [{ seat: "A7", tier: "VIP" }],
    total: 180,
    purchasedAt: "2026-09-01T09:22:00",
    status: "confirmed",
  },
  {
    id: "bk-3",
    ref: "EE-55MB18",
    eventId: "ev-lantern",
    userId: "u-cust",
    seats: [{ seat: "C2", tier: "Standard" }],
    total: 44,
    purchasedAt: "2026-07-14T18:41:00",
    status: "refunded",
  },
  {
    id: "bk-4",
    ref: "EE-7GLA42",
    eventId: "ev-ballet",
    userId: "u-cust",
    seats: [{ seat: "D8", tier: "Standard" }],
    total: 130,
    purchasedAt: "2026-09-12T14:20:00",
    status: "confirmed",
  },
];

export const seedAssistanceRequests: AssistanceRequest[] = [
  {
    id: "ar-1",
    bookingId: "bk-2",
    eventId: "ev-derby",
    userId: "u-cust",
    requesterUsername: "hcy001",
    supportNeeds: "Step-free entrance and guidance from the arrival point to my seat.",
    level: "Moderate",
    assignedStaff: "Farah N.",
    status: "Assigned",
    createdAt: "2026-09-08T10:30:00",
  },
  {
    id: "ar-2",
    bookingId: "bk-1",
    eventId: "ev-hamlet",
    userId: "u-cust",
    requesterUsername: "hcy001",
    supportNeeds: "Audio guidance through the lobby and help locating accessible facilities.",
    level: "Basic",
    assignedStaff: "Daniel T.",
    status: "Completed",
    createdAt: "2026-08-31T16:10:00",
  },
  {
    id: "ar-3",
    bookingId: "bk-3",
    eventId: "ev-lantern",
    userId: "u-cust",
    requesterUsername: "hcy001",
    supportNeeds: "Continuous companion support from drop-off through event departure.",
    level: "Full support",
    status: "Cancelled",
    createdAt: "2026-07-16T09:15:00",
  },
  {
    id: "ar-4",
    bookingId: "bk-4",
    eventId: "ev-ballet",
    userId: "u-amelia",
    requesterUsername: "amelia88",
    supportNeeds: "Help navigating from the main entrance to an aisle seat.",
    level: "Basic",
    status: "Submitted",
    createdAt: "2026-09-14T11:40:00",
  },
  {
    id: "ar-5",
    bookingId: "bk-5",
    eventId: "ev-aurora",
    userId: "u-jerome",
    requesterUsername: "jerome_l",
    supportNeeds: "Wheelchair transfer support and guidance to the accessible viewing area.",
    level: "Full support",
    assignedStaff: "Mei W.",
    status: "In progress",
    createdAt: "2026-09-18T13:05:00",
  },
  {
    id: "ar-6",
    bookingId: "bk-6",
    eventId: "ev-ballet",
    userId: "u-ravi",
    requesterUsername: "ravi_k",
    supportNeeds: "Assistance locating the hearing loop collection point.",
    level: "Moderate",
    assignedStaff: "Sarah L.",
    status: "Assigned",
    createdAt: "2026-09-20T08:25:00",
  },
  {
    id: "ar-7",
    bookingId: "bk-7",
    eventId: "ev-lantern",
    userId: "u-nadia",
    requesterUsername: "nadia_lim",
    supportNeeds: "Step-free route information and a quiet waiting area before entry.",
    level: "Basic",
    assignedStaff: "Daniel T.",
    status: "Completed",
    createdAt: "2026-07-02T15:50:00",
  },
];

export const seedExchange: ExchangeListing[] = [
  { id: "ex-1", bookingId: "x", eventId: "ev-aurora", sellerName: "Mei L.", seat: "D6", tier: "Standard", askPrice: 148, verified: true },
  { id: "ex-2", bookingId: "x", eventId: "ev-aurora", sellerName: "Ravi K.", seat: "A2", tier: "VIP", askPrice: 320, verified: true },
  { id: "ex-3", bookingId: "x", eventId: "ev-derby", sellerName: "Tan W.", seat: "F9", tier: "Standard", askPrice: 78, verified: true },
];

export const seedPosts: CommunityPost[] = [
  { id: "p1", eventId: "ev-aurora", author: "Nadia", body: "Section C has the best sightlines — went to soundcheck last tour. Adding a shot from row D!", section: "C", photo: img("photo-1516450360452-9312f5e86fc7", "view"), when: "2h", likes: 34 },
  { id: "p2", eventId: "ev-aurora", author: "Jerome", body: "Anyone want to swap my VIP A2 for two standards? Happy to do the secure exchange.", section: "A", when: "5h", likes: 8 },
  { id: "p3", eventId: "ev-hamlet", author: "Priya", body: "Wheelchair access is via the east lobby — staff were super helpful when I booked companion assistance.", when: "1d", likes: 21 },
];

export const seedFraud: FraudAlert[] = [
  { id: "f1", ref: "EE-2QP907", type: "Duplicate QR scan", severity: "high", event: "City Derby — Finals Night", detail: "Same QR presented at Gate 3 and Gate 7 within 4 minutes.", when: "12m", resolved: false },
  { id: "f2", ref: "EE-77XZ04", type: "Bulk bot purchase", severity: "high", event: "Aurora — Midnight Tour", detail: "18 tickets bought from 1 device across 6 accounts.", when: "1h", resolved: false },
  { id: "f3", ref: "EE-1AA330", type: "Reseller markup", severity: "medium", event: "Aurora — Midnight Tour", detail: "Off-platform listing at 340% face value flagged by community report.", when: "3h", resolved: false },
  { id: "f4", ref: "EE-9KK210", type: "Chargeback pattern", severity: "low", event: "Swan Lake — Winter Gala", detail: "Card previously linked to 2 disputed transactions.", when: "1d", resolved: true },
];

export const categoryList: Category[] = ["Concert", "Theatre", "Sports", "Cultural"];
