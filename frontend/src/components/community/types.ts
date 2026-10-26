import type { LucideIcon } from "lucide-react";
export type { EventItem, CommunityPost, CommunityPost as Post, TicketTier } from "../../lib/data";
export type { User } from "../../lib/store";

export type CommsChannelId = "feed" | "views"

export type FilterType = "all" | "following" | "views" | "questions"

export type SortOrder = "trending" | "newest" | "discussed"

export interface SearchableOption {
  value: string
  label: string
  sublabel?: string
}

export interface SectionSeatPhoto {
  photo: string
  authorName: string
  section: string
  seat: string
  vibe: string
  isVerified?: boolean
  pixId?: string
  likesCount?: number
}

export interface SectionSegment {
  id: string
  name: string
  tier: string
  rowRange: string
  photos: SectionSeatPhoto[]
}

export interface VantagePoint {
  id: string
  label: string
  desc: string
  image: string
  elevation: string
  fov: string
}

export interface CommunityTabItem {
  id: "feed" | "views" | "exchange"
  label: string
  icon: LucideIcon
  desc: string
}

export interface Preview360Photo {
  url: string
  title: string
  section?: string
  elevation?: string
  fov?: string
  externalTourUrl?: string | null
  venueName?: string
}

export interface AttachedEasePix {
  photo: string
  section: string
  row: string
  eventId?: string
}

export interface PostReplyItem {
  id: string
  author: string
  body: string
  when: string
  isVerified?: boolean
}

export interface DisplayPost {
  id: string
  eventId: string
  author: string
  body: string
  section?: string
  seatLabel?: string
  photo?: string
  when: string
  likes: number
  isBackend: boolean
  isVerified?: boolean
  replies: PostReplyItem[]
}
