import type { Category, EventItem } from "./data";

type TicketmasterEvent = {
  id: string;
  name: string;
  info?: string;
  pleaseNote?: string;
  images?: { url: string; width: number; height: number }[];
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number }[];
  _embedded?: { venues?: { name?: string; city?: { name?: string } }[] };
};

const API_KEY = import.meta.env.VITE_TICKETMASTER_API_KEY as string | undefined;

function categoryOf(event: TicketmasterEvent): Category {
  const label = [
    event.classifications?.[0]?.segment?.name,
    event.classifications?.[0]?.genre?.name,
  ]
    .join(" ")
    .toLowerCase();
  if (label.includes("theatre") || label.includes("arts")) return "Theatre";
  if (label.includes("sport")) return "Sports";
  if (label.includes("cultural") || label.includes("family")) return "Cultural";
  return "Concert";
}

function imageOf(event: TicketmasterEvent) {
  return [...(event.images ?? [])].sort(
    (a, b) => Math.abs(a.width / a.height - 4 / 3) - Math.abs(b.width / b.height - 4 / 3),
  )[0]?.url;
}

export async function fetchLiveEvents(): Promise<EventItem[]> {
  if (!API_KEY) return [];

  const params = new URLSearchParams({
    apikey: API_KEY,
    countryCode: "SG",
    size: "18",
    sort: "date,asc",
    classificationName: "music,arts,theatre,dance",
  });
  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!response.ok) throw new Error("Live event service is unavailable");

  const payload = (await response.json()) as {
    _embedded?: { events?: TicketmasterEvent[] };
  };

  return (payload._embedded?.events ?? []).flatMap((event, index) => {
    const date = event.dates?.start?.dateTime ?? event.dates?.start?.localDate;
    const image = imageOf(event);
    if (!date || !image) return [];
    const venue = event._embedded?.venues?.[0];
    const minimum = Math.max(25, Math.round(event.priceRanges?.[0]?.min ?? 68));
    const capacity = 96;

    return [{
      id: `tm-${event.id}`,
      title: event.name,
      category: categoryOf(event),
      date,
      doors: event.dates?.start?.localTime?.slice(0, 5) ?? "18:30",
      venue: venue?.name ?? "Venue to be announced",
      city: venue?.city?.name ?? "Singapore",
      image,
      blurb:
        event.info ??
        event.pleaseNote ??
        "A live event listing supplied by Ticketmaster Discovery. Select your seats to continue.",
      organizerId: "org-livenation",
      organizerName: "Event 01",
      status: "published",
      featured: index < 6,
      rows: 8,
      cols: 12,
      tiers: [
        { id: "vip", name: "VIP", price: Math.round(minimum * 1.8), total: 24, sold: 8 },
        { id: "standard", name: "Standard", price: minimum, total: 56, sold: 18 },
        { id: "concession", name: "Concession", price: Math.round(minimum * 0.75), total: 16, sold: 4 },
      ],
    }];
  });
}
