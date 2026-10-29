import { useState, useMemo, useRef } from "react"
import { useNavigate } from "react-router"
import {
  backendCreatePost,
  backendLikePost,
  type BackendCommunityPost,
  type BackendEasePixCreate,
} from "../../../lib/backendApi"
import { parseSeatParts } from "../easepix/seatMatching"
import { formatRelativeWhen } from "../dateUtils"
import type { DisplayPost, FilterType, AttachedEasePix, EventItem, Post, User } from "../types"

interface UseCommunityFeedParams {
  user: User | null
  events: EventItem[]
  posts: Post[]
  backendPosts: BackendCommunityPost[]
  addPost: (post: Omit<Post, "id" | "likes" | "when">) => void
  reloadCommunityData: () => Promise<void>
  onShowToast: (msg: string) => void
  onPostCreatedWithPhoto?: (targetEventId: string, section?: string) => void
}

export function useCommunityFeed({
  user,
  events,
  posts,
  backendPosts,
  addPost,
  reloadCommunityData,
  onShowToast,
  onPostCreatedWithPhoto,
}: UseCommunityFeedParams) {
  const navigate = useNavigate()

  const [draft, setDraft] = useState("")
  const [selectedEventId, setSelectedEventId] = useState<string>("")
  const [photoUrl, setPhotoUrl] = useState("")
  const [showPhotoInput, setShowPhotoInput] = useState(false)
  const [filter, setFilter] = useState<FilterType>("all")
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({})
  const [likesCount, setLikesCount] = useState<Record<string, number>>({})
  const [openCommentsForPost, setOpenCommentsForPost] =
    useState<Record<string, boolean>>({})
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [submittingReply, setSubmittingReply] =
    useState<Record<string, boolean>>({})
  const [attachedEasePix, setAttachedEasePix] =
    useState<AttachedEasePix | null>(null)

  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Initialize event id for tagging
  if (events.length > 0 && !selectedEventId) {
    setSelectedEventId(events[0].id)
  }

  // Unified list of display posts
  const displayPosts: DisplayPost[] = useMemo(() => {
    const bPosts: DisplayPost[] = backendPosts.map((p) => {
      const sec = p.easepix?.section
      const seat = p.easepix?.rowLabel
        ? p.easepix?.seatNumber
          ? `${p.easepix.rowLabel} · Seat ${p.easepix.seatNumber}`
          : p.easepix.rowLabel
        : undefined

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
      }
    })

    const sPosts: DisplayPost[] = posts.map((p) => ({
      ...p,
      isBackend: false,
      isVerified: true,
      replies: [],
    }))

    return bPosts.length > 0 ? [...bPosts, ...sPosts] : sPosts
  }, [backendPosts, posts, events])

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return displayPosts.filter((p) => {
      if (filter === "views") return Boolean(p.photo)
      if (filter === "questions")
        return p.body.includes("?") || p.body.toLowerCase().includes("ask")
      if (filter === "following")
        return p.author === "Nadia" || p.author === "Jules"
      return true
    })
  }, [displayPosts, filter])

  // Handle post likes
  const toggleLike = (
    postId: string,
    initialLikes: number,
    isBackend = false,
  ) => {
    setLikedPosts((prev) => {
      const isLiked = !prev[postId]
      setLikesCount((prevCounts) => ({
        ...prevCounts,
        [postId]: (prevCounts[postId] ?? initialLikes) + (isLiked ? 1 : -1),
      }))
      onShowToast(isLiked ? "Added to your liked posts ❤️" : "Unliked post")
      return { ...prev, [postId]: isLiked }
    })

    if (isBackend) {
      backendLikePost(postId).catch(() => {})
    }
  }

  // Submit reply / comment on a post
  const submitReply = async (postId: string, eventId: string) => {
    const text = (replyDrafts[postId] || "").trim()
    if (!text) {
      onShowToast("Write a reply before sending")
      return
    }
    if (!user) {
      onShowToast("Please sign in to leave a comment.")
      navigate("/login")
      return
    }

    setSubmittingReply((prev) => ({ ...prev, [postId]: true }))
    try {
      await backendCreatePost({
        content: text,
        eventId,
        parentId: postId,
        authorName: user.name,
      })
      setReplyDrafts((prev) => ({ ...prev, [postId]: "" }))
      await reloadCommunityData()
      onShowToast("Comment posted! 💬")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to post comment"
      onShowToast(msg)
    } finally {
      setSubmittingReply((prev) => ({ ...prev, [postId]: false }))
    }
  }

  // Submit new post
  const submitPost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!draft.trim()) {
      onShowToast("Write a little something before sharing.")
      textareaRef.current?.focus()
      return
    }
    if (!user) {
      onShowToast("Please sign in to join the conversation.")
      window.scrollTo({ top: 0, left: 0, behavior: "instant" })
      navigate("/login")
      return
    }

    const targetEventId =
      selectedEventId || attachedEasePix?.eventId || events[0]?.id || ""
    const photoToSubmit = attachedEasePix?.photo || photoUrl.trim() || undefined
    const sectionToSubmit = attachedEasePix?.section || undefined
    const rowToSubmit = attachedEasePix?.row || undefined

    try {
      let easepixPayload: BackendEasePixCreate | undefined = undefined
      if (photoToSubmit && sectionToSubmit) {
        const parts = rowToSubmit ? parseSeatParts(rowToSubmit) : null
        const eventMatch = events.find((e) => e.id === targetEventId)
        easepixPayload = {
          venueName: attachedEasePix?.venueName || eventMatch?.venue || undefined,
          eventId: targetEventId || undefined,
          section: sectionToSubmit,
          rowLabel: parts?.row || rowToSubmit || undefined,
          seatNumber: parts?.seat ? parseInt(parts.seat, 10) : undefined,
          photoUrl: photoToSubmit,
          caption: `View from ${sectionToSubmit} ${rowToSubmit || ""}`.trim(),
          authorName: user.name,
        }
      }

      await backendCreatePost({
        content: draft.trim(),
        eventId: targetEventId,
        authorName: user.name,
        easepix: easepixPayload,
      })

      addPost({
        eventId: targetEventId,
        author: user.name.split(" ")[0] || "You",
        body: draft.trim(),
        section: sectionToSubmit,
        seatLabel: rowToSubmit,
        photo: photoToSubmit,
      })

      if (photoToSubmit && onPostCreatedWithPhoto) {
        onPostCreatedWithPhoto(targetEventId, sectionToSubmit)
      }

      await reloadCommunityData()
      setDraft("")
      setPhotoUrl("")
      setAttachedEasePix(null)
      setShowPhotoInput(false)
      onShowToast(
        "Your post and EasePix seat view have been shared to EaseConnect! ✨",
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to share post"
      onShowToast(msg)
    }
  }

  return {
    draft,
    setDraft,
    selectedEventId,
    setSelectedEventId,
    photoUrl,
    setPhotoUrl,
    showPhotoInput,
    setShowPhotoInput,
    filter,
    setFilter,
    likedPosts,
    likesCount,
    toggleLike,
    openCommentsForPost,
    setOpenCommentsForPost,
    replyDrafts,
    setReplyDrafts,
    submittingReply,
    submitReply,
    attachedEasePix,
    setAttachedEasePix,
    composerRef,
    textareaRef,
    displayPosts,
    filteredPosts,
    submitPost,
  }
}
