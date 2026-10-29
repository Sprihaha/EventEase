import { downloadBackendReport } from "./bookings";
import { request } from "./client";

export type VenueSection = { id: string; name: string; seatCount: number; rows: string[] };

export type Venue = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  seatCount: number;
  sections: VenueSection[];
  easeexplore360Url?: string | null;
};

export async function backendListVenues(): Promise<Venue[]> {
  const venues = await request<Venue[]>("/organiser/venues", {}, true);
  return venues.map((v) => {
    const cached = typeof window !== "undefined" ? localStorage.getItem(`venue-media-${v.id}`) : null;
    return {
      ...v,
      easeexplore360Url: v.easeexplore360Url || cached || null,
    };
  });
}

export async function backendGetVenue(id: string): Promise<Venue> {
  const venue = await request<Venue>(`/organiser/venues/${id}`, {}, true);
  const cached = typeof window !== "undefined" ? localStorage.getItem(`venue-media-${venue.id}`) : null;
  return {
    ...venue,
    easeexplore360Url: venue.easeexplore360Url || cached || null,
  };
}

export function backendImportVenue(input: {
  name: string;
  area: string;
  address: string;
  file: File;
  easeexplore360Url?: string;
}) {
  const body = new FormData();
  body.append("name", input.name);
  body.append("area", input.area);
  if (input.address) body.append("address", input.address);
  body.append("file", input.file);
  if (input.easeexplore360Url) body.append("easeexplore_360_url", input.easeexplore360Url);
  return request<Venue>("/organiser/venues/import", { method: "POST", body }, true);
}

export async function backendUpdateVenueEaseExplore(venueId: string, url: string | null): Promise<Venue> {
  if (typeof window !== "undefined") {
    if (url) {
      localStorage.setItem(`venue-media-${venueId}`, url);
    } else {
      localStorage.removeItem(`venue-media-${venueId}`);
    }
  }
  try {
    return await request<Venue>(`/organiser/venues/${encodeURIComponent(venueId)}/easeexplore`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ easeexplore360Url: url }),
    }, true);
  } catch (err) {
    console.warn("Backend EaseExplore PATCH failed or pending deployment; saved locally:", err);
    return {
      id: venueId,
      name: "",
      area: null,
      address: null,
      seatCount: 0,
      sections: [],
      easeexplore360Url: url,
    } as Venue;
  }
}

export function backendDownloadVenueTemplate() {
  return downloadBackendReport("/organiser/venues/template", "venue-layout-template.xlsx");
}

export type VenueLayoutSeat = { id: string; number: number; isAccessible: boolean };
export type VenueLayoutRow = { label: string; seats: VenueLayoutSeat[] };
export type VenueLayoutSection = { id: string; name: string; rows: VenueLayoutRow[] };
export type VenueLayout = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  seatCount: number;
  sections: VenueLayoutSection[];
  easeexplore360Url?: string | null;
};

export type EventLayout = {
  eventId: string;
  venueId: string;
  venueName: string;
  sections: VenueLayoutSection[];
  easeexplore360Url?: string | null;
};

export async function backendGetEventLayout(eventId: string): Promise<EventLayout> {
  const layout = await request<EventLayout>(`/events/${encodeURIComponent(eventId)}/layout`);
  const cached = typeof window !== "undefined" && layout.venueId ? localStorage.getItem(`venue-media-${layout.venueId}`) : null;
  return {
    ...layout,
    easeexplore360Url: layout.easeexplore360Url || cached || null,
  };
}

export async function backendGetVenueLayout(venueId: string): Promise<VenueLayout> {
  try {
    return await request<VenueLayout>(`/organiser/venues/${venueId}/layout`, {}, true);
  } catch {
    // Graceful fallback: construct layout structure from venue sections & rows
    const venue = await backendGetVenue(venueId);
    return {
      ...venue,
      sections: venue.sections.map((section) => {
        const rowCount = Math.max(1, section.rows.length);
        const seatsPerRow = Math.max(1, Math.round(section.seatCount / rowCount));
        return {
          id: section.id,
          name: section.name,
          rows: section.rows.map((rowLabel, rowIndex) => ({
            label: rowLabel,
            seats: Array.from({ length: seatsPerRow }, (_, i) => ({
              id: `${section.id}-${rowLabel}-${i + 1}`,
              number: i + 1,
              isAccessible: rowIndex === 0 && i < 2,
            })),
          })),
        };
      }),
    };
  }
}

