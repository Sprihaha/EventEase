import { request } from "./backendApi";

export const MAX_POSTER_BYTES = 5 * 1024 * 1024;
export const POSTER_TYPES = ["image/png", "image/jpeg"];

/** Upload a PNG or JPG poster; the returned url is saved as the event's image URL. */
export async function uploadEventImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<{ id: string; url: string; contentType: string; sizeBytes: number }>(
    "/organiser/event-images", { method: "POST", body: form }, true);
}
