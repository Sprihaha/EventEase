import { Users, Camera, Repeat } from "lucide-react"
import type { VantagePoint, CommunityTabItem } from "./types"

export const vantagePoints: readonly VantagePoint[] = [
  {
    id: "stage",
    label: "Stage Front Perspective",
    desc: "Direct line of sight in front of the artist. Zero head obstruction.",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=85",
    elevation: "Ground Level (0m)",
    fov: "160° Panoramic",
  },
  {
    id: "center",
    label: "Lower Bowl Perspective",
    desc: "Optimal acoustics and balanced sightlines facing the main performance area.",
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85",
    elevation: "+2.5m Tiered",
    fov: "140° Panoramic",
  },
  {
    id: "balcony",
    label: "Elevated Tier Perspective",
    desc: "Bird’s-eye perspective overlooking the stage, venue crowd, and lighting effects.",
    image:
      "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=85",
    elevation: "+8.0m Tiered",
    fov: "180° Panoramic",
  },
  {
    id: "accessible",
    label: "Accessible Platform · Step-Free",
    desc: "Elevated wheelchair bay with unobstructed sightlines above standing fans.",
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=85",
    elevation: "+3.2m Platform",
    fov: "150° Panoramic",
  },
] as const

export const allTabs: readonly CommunityTabItem[] = [
  {
    id: "feed",
    label: "EaseConnect",
    icon: Users,
    desc: "Discussions & fan forums",
  },
  {
    id: "views",
    label: "EasePix & EaseXplore",
    icon: Camera,
    desc: "Seat sharing & 360° views",
  },
  { id: "exchange", label: "EaseExchange", icon: Repeat, desc: "Ticket swaps" },
] as const
