import { FeedComposer } from "./FeedComposer"
import { FeedFilterBar } from "./FeedFilterBar"
import { FeedPostCard } from "./FeedPostCard"
import type {
  DisplayPost,
  FilterType,
  AttachedEasePix,
  Preview360Photo,
  EventItem,
  User,
} from "../types"

interface EaseConnectFeedProps {
  user: User | null
  events: EventItem[]
  posts: DisplayPost[]
  eventName: (eventId: string) => string
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  draft: string
  onDraftChange: (text: string) => void
  selectedEventId: string
  onSelectedEventIdChange: (id: string) => void
  photoUrl: string
  onPhotoUrlChange: (url: string) => void
  showPhotoInput: boolean
  onTogglePhotoInput: (show: boolean) => void
  attachedEasePix: AttachedEasePix | null
  onDetachEasePix: () => void
  onOpenUploadModal: () => void
  onSubmitPost: () => void
  likedPosts: Record<string, boolean>
  likesCount: Record<string, number>
  onToggleLike: (
    postId: string,
    currentLikes: number,
    isBackend: boolean,
  ) => void
  openCommentsForPost: Record<string, boolean>
  onToggleComments: (postId: string) => void
  replyDrafts: Record<string, string>
  onReplyDraftChange: (postId: string, text: string) => void
  onSubmitReply: (postId: string, eventId: string) => void
  submittingReply: Record<string, boolean>
  onPreview360: (photo: Preview360Photo) => void
  onShowToast: (msg: string) => void
  composerRef?: React.RefObject<HTMLDivElement | null>
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
}

export function EaseConnectFeed({
  user,
  events,
  posts,
  eventName,
  filter,
  onFilterChange,
  draft,
  onDraftChange,
  selectedEventId,
  onSelectedEventIdChange,
  photoUrl,
  onPhotoUrlChange,
  showPhotoInput,
  onTogglePhotoInput,
  attachedEasePix,
  onDetachEasePix,
  onOpenUploadModal,
  onSubmitPost,
  likedPosts,
  likesCount,
  onToggleLike,
  openCommentsForPost,
  onToggleComments,
  replyDrafts,
  onReplyDraftChange,
  onSubmitReply,
  submittingReply,
  onPreview360,
  onShowToast,
  composerRef,
  textareaRef,
}: EaseConnectFeedProps) {
  return (
    <div className="space-y-4">
      {/* Interactive Post Composer */}
      <FeedComposer
        user={user}
        events={events}
        draft={draft}
        onDraftChange={onDraftChange}
        selectedEventId={selectedEventId}
        onSelectedEventIdChange={onSelectedEventIdChange}
        photoUrl={photoUrl}
        onPhotoUrlChange={onPhotoUrlChange}
        showPhotoInput={showPhotoInput}
        onTogglePhotoInput={onTogglePhotoInput}
        attachedEasePix={attachedEasePix}
        onDetachEasePix={onDetachEasePix}
        onOpenUploadModal={onOpenUploadModal}
        onSubmitPost={onSubmitPost}
        composerRef={composerRef}
        textareaRef={textareaRef}
      />

      {/* Feed Filter Pills */}
      <FeedFilterBar
        filter={filter}
        onFilterChange={(f) => {
          onFilterChange(f)
          const label =
            f === "all"
              ? "For you"
              : f === "following"
                ? "Following"
                : f === "views"
                  ? "Seat views"
                  : "Questions"
          onShowToast(`Filter: ${label}`)
        }}
      />

      {/* Feed Posts List */}
      <div className="space-y-4">
        {posts.map((p) => (
          <FeedPostCard
            key={p.id}
            post={p}
            eventName={eventName}
            isLiked={likedPosts[p.id] ?? false}
            currentLikes={likesCount[p.id] ?? p.likes}
            onToggleLike={() => onToggleLike(p.id, p.likes, p.isBackend)}
            isOpenComments={openCommentsForPost[p.id] ?? false}
            onToggleComments={() => onToggleComments(p.id)}
            replyDraft={replyDrafts[p.id] || ""}
            onReplyDraftChange={(text) => onReplyDraftChange(p.id, text)}
            onSubmitReply={() => onSubmitReply(p.id, p.eventId)}
            isSubmittingReply={submittingReply[p.id] ?? false}
            user={user}
            onPreview360={onPreview360}
            onShowToast={onShowToast}
          />
        ))}
      </div>
    </div>
  )
}
