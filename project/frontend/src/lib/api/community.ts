import { API_ROOT, ApiError, request } from "./client";

export type BackendNarration = {
  pageKey: string;
  transcript: string;
  updatedAt: string;
  hasAudio: boolean;
  audioFilename: string | null;
  audioSizeBytes: number | null;
};

export const MAX_NARRATION_AUDIO_BYTES = 5 * 1024 * 1024;

/** Public narration for one page. Resolves to null when the admin has not written one yet. */
export async function fetchBackendNarration(pageKey: string): Promise<BackendNarration | null> {
  try {
    return await request<BackendNarration>(`/narration/${pageKey}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Admin only: create or replace the narration text for a page. */
export function saveBackendNarration(pageKey: string, transcript: string) {
  return request<BackendNarration>(
    `/admin/narration/${pageKey}`,
    { method: "PUT", body: JSON.stringify({ transcript }) },
    true,
  );
}

/** Address of the admin-recorded MP3 for a page (public, so an <audio> tag can play it). */
export function narrationAudioUrl(pageKey: string): string {
  return `${API_ROOT}/narration/${pageKey}/audio`;
}

/** Admin only: upload an MP3 for a page whose narration text is already saved. */
export function uploadBackendNarrationAudio(pageKey: string, file: File) {
  return request<BackendNarration>(
    `/admin/narration/${pageKey}/audio?filename=${encodeURIComponent(file.name)}`,
    { method: "PUT", body: file, headers: { "Content-Type": "audio/mpeg" } },
    true,
  );
}

/** Admin only: remove the MP3 for a page (the text narration stays). */
export function deleteBackendNarrationAudio(pageKey: string) {
  return request<void>(`/admin/narration/${pageKey}/audio`, { method: "DELETE" }, true);
}

export type FormattedMedia = {
  embedUrl: string;
  isDirectVideo: boolean;
  isYoutube: boolean;
  isVimeo: boolean;
  isIframe: boolean;
  originalUrl: string;
};

export function formatMediaEmbedUrl(url: string | null | undefined): FormattedMedia {
  if (!url) {
    return { embedUrl: "", isDirectVideo: false, isYoutube: false, isVimeo: false, isIframe: false, originalUrl: "" };
  }

  let trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:")) {
    trimmed = `https://${trimmed}`;
  }

  // 1. Direct video data or files
  if (
    trimmed.startsWith("data:video") ||
    trimmed.toLowerCase().endsWith(".mp4") ||
    trimmed.toLowerCase().endsWith(".webm") ||
    trimmed.toLowerCase().endsWith(".mov") ||
    trimmed.toLowerCase().endsWith(".m4v")
  ) {
    return {
      embedUrl: trimmed,
      isDirectVideo: true,
      isYoutube: false,
      isVimeo: false,
      isIframe: false,
      originalUrl: trimmed,
    };
  }

  // 2. YouTube URLs (watch, shorts, youtu.be, embed)
  const ytMatch = trimmed.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([A-Za-z0-9_-]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`,
      isDirectVideo: false,
      isYoutube: true,
      isVimeo: false,
      isIframe: true,
      originalUrl: trimmed,
    };
  }

  // 3. Vimeo URLs
  const vimeoMatch = trimmed.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`,
      isDirectVideo: false,
      isYoutube: false,
      isVimeo: true,
      isIframe: true,
      originalUrl: trimmed,
    };
  }

  // 4. Other virtual tours / iframes (360fyr, Matterport, etc.)
  return {
    embedUrl: trimmed,
    isDirectVideo: false,
    isYoutube: false,
    isVimeo: false,
    isIframe: true,
    originalUrl: trimmed,
  };
}

export type BackendEasePix = {
  id: string;
  userId?: string | null;
  authorName: string;
  venueName?: string | null;
  eventId?: string | null;
  venueId?: string | null;
  section: string;
  rowLabel?: string | null;
  seatNumber?: number | null;
  photoUrl: string;
  caption?: string | null;
  elevation?: string | null;
  fov?: string | null;
  isVerified: boolean;
  likesCount: number;
  createdAt: string;
};

export type BackendEasePixCreate = {
  venueName?: string | null;
  eventId?: string | null;
  venueId?: string | null;
  section: string;
  rowLabel?: string | null;
  seatNumber?: number | null;
  photoUrl: string;
  caption?: string | null;
  elevation?: string | null;
  fov?: string | null;
  authorName?: string | null;
};

export type BackendCommunityPost = {
  id: string;
  userId?: string | null;
  authorName: string;
  eventId?: string | null;
  content: string;
  easepixId?: string | null;
  easepix?: BackendEasePix | null;
  parentId?: string | null;
  likesCount: number;
  createdAt: string;
  replies?: BackendCommunityPost[];
};

export type BackendCommunityPostCreate = {
  content: string;
  eventId?: string | null;
  authorName?: string | null;
  parentId?: string | null;
  easepixId?: string | null;
  easepix?: BackendEasePixCreate | null;
};

export async function backendListPosts(params?: { eventId?: string; limit?: number }): Promise<BackendCommunityPost[]> {
  const q = new URLSearchParams();
  if (params?.eventId) q.set("event_id", params.eventId);
  if (params?.limit) q.set("limit", String(params.limit));
  const query = q.toString() ? `?${q.toString()}` : "";
  return request<BackendCommunityPost[]>(`/community/posts${query}`);
}

export async function backendCreatePost(data: BackendCommunityPostCreate): Promise<BackendCommunityPost> {
  return request<BackendCommunityPost>("/community/posts", {
    method: "POST",
    body: JSON.stringify(data),
  }, true);
}

export async function backendLikePost(postId: string): Promise<BackendCommunityPost> {
  return request<BackendCommunityPost>(`/community/posts/${postId}/like`, {
    method: "POST",
  });
}

export async function backendListEasePix(params?: {
  eventId?: string;
  venueId?: string;
  venueName?: string;
  section?: string;
  rowLabel?: string;
  limit?: number;
}): Promise<BackendEasePix[]> {
  const q = new URLSearchParams();
  if (params?.eventId) q.set("event_id", params.eventId);
  if (params?.venueId) q.set("venue_id", params.venueId);
  if (params?.venueName) q.set("venue_name", params.venueName);
  if (params?.section) q.set("section", params.section);
  if (params?.rowLabel) q.set("row_label", params.rowLabel);
  if (params?.limit) q.set("limit", String(params.limit));
  const query = q.toString() ? `?${q.toString()}` : "";
  return request<BackendEasePix[]>(`/community/easepix${query}`);
}

export async function backendCreateEasePix(data: BackendEasePixCreate): Promise<BackendEasePix> {
  return request<BackendEasePix>("/community/easepix", {
    method: "POST",
    body: JSON.stringify(data),
  }, true);
}

export async function backendLikeEasePix(easepixId: string): Promise<BackendEasePix> {
  return request<BackendEasePix>(`/community/easepix/${easepixId}/like`, {
    method: "POST",
  });
}

