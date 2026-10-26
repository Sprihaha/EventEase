import {
  Heart,
  MessageSquare,
  Share2,
  Sparkles,
  Rotate3d,
  Send,
} from "lucide-react"
import { cx } from "../../ui"
import type { DisplayPost, Preview360Photo, User } from "../types"

interface FeedPostCardProps {
  post: DisplayPost
  eventName: (eventId: string) => string
  isLiked: boolean
  currentLikes: number
  onToggleLike: () => void
  isOpenComments: boolean
  onToggleComments: () => void
  replyDraft: string
  onReplyDraftChange: (text: string) => void
  onSubmitReply: () => void
  isSubmittingReply: boolean
  user: User | null
  onPreview360: (photo: Preview360Photo) => void
  onShowToast: (msg: string) => void
}

export function FeedPostCard({
  post,
  eventName,
  isLiked,
  currentLikes,
  onToggleLike,
  isOpenComments,
  onToggleComments,
  replyDraft,
  onReplyDraftChange,
  onSubmitReply,
  isSubmittingReply,
  user,
  onPreview360,
  onShowToast,
}: FeedPostCardProps) {
  const evName = eventName(post.eventId)

  return (
    <article className="group rounded-3xl border border-brand-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-purple to-brand-magenta font-bold text-white shadow-sm">
          {post.author[0] ?? "U"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <b className="text-xs font-bold text-brand-deep">
                {post.author}{" "}
                <span className="font-normal text-muted">
                  · Live Music Fans
                </span>
              </b>
              <div className="text-[11px] text-muted">
                {post.when} on{" "}
                <span className="font-semibold text-brand-deep">{evName}</span>{" "}
                ·{" "}
                <span className="font-bold text-brand-purple">
                  {post.photo ? "EasePix contributor" : "Community tip"}
                </span>
              </div>
            </div>
            <span className="rounded-full bg-brand-warm px-2 py-0.5 text-[10px] font-bold text-muted border border-brand-line">
              {post.section ? `Sec ${post.section}` : "Fan Post"}
            </span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-brand-deep/90">
            {post.body}
          </p>

          {/* Post Photo / Seat View with Dark Gradient & Badge */}
          {post.photo && (
            <div className="relative mt-3.5 h-64 overflow-hidden rounded-2xl border border-brand-line bg-brand-deep shadow-sm">
              <img
                src={post.photo}
                alt="Seat view"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = "none"
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-deep/90 via-transparent to-transparent pointer-events-none" />
              <div className="absolute left-3.5 bottom-3.5 flex items-center gap-2 text-xs font-extrabold text-white">
                <span className="rounded bg-brand-orange px-2 py-0.5 text-[10px] uppercase font-black tracking-wider">
                  SEAT VIEW
                </span>
                <span>
                  {evName} · Section {post.section ?? "C"}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onPreview360({
                    url: post.photo!,
                    title: evName,
                    section: post.section,
                  })
                }
                className="cursor-pointer absolute right-3.5 bottom-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-deep/85 px-3 py-1 text-xs font-bold text-white backdrop-blur-md transition hover:bg-brand-purple"
              >
                <Rotate3d className="h-3.5 w-3.5 text-brand-orange" /> Preview
                360°
              </button>
            </div>
          )}

          {/* Post Footer Actions */}
          <div className="mt-4 flex items-center gap-4 pt-3 border-t border-brand-line/60 text-xs text-muted font-bold">
            <button
              type="button"
              onClick={onToggleLike}
              className={cx(
                "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                isLiked ? "text-brand-magenta" : "hover:text-brand-magenta",
              )}
            >
              <Heart
                className={cx("h-4 w-4", isLiked && "fill-brand-magenta")}
              />
              <span>{currentLikes}</span>
            </button>

            <button
              type="button"
              onClick={onToggleComments}
              className={cx(
                "cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                isOpenComments
                  ? "text-brand-purple font-extrabold"
                  : "hover:text-brand-purple",
              )}
            >
              <MessageSquare className="h-4 w-4" />
              <span>
                {post.replies.length > 0
                  ? `${post.replies.length} ${
                      post.replies.length === 1 ? "comment" : "comments"
                    }`
                  : "Comment"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href)
                onShowToast("Post link copied to clipboard")
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
          {isOpenComments && (
            <div className="mt-3.5 space-y-3 rounded-2xl border border-brand-line/80 bg-brand-warm/30 p-3.5 sm:p-4">
              <div className="flex items-center justify-between text-xs font-bold text-brand-deep">
                <span>Comments & Replies ({post.replies.length})</span>
                <span className="text-[11px] text-muted">
                  Join the discussion
                </span>
              </div>

              {/* Comment List */}
              {post.replies.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {post.replies.map((reply) => (
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
                        <span className="text-[10px] text-muted">
                          {reply.when}
                        </span>
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
                  placeholder={
                    user
                      ? "Write a comment..."
                      : "Sign in to leave a comment..."
                  }
                  disabled={!user || isSubmittingReply}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      onSubmitReply()
                    }
                  }}
                  className="flex-1 rounded-xl border border-brand-line bg-white px-3 py-2 text-xs text-brand-deep outline-none focus:border-brand-purple disabled:bg-stone-100 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled={!user || isSubmittingReply || !replyDraft.trim()}
                  onClick={onSubmitReply}
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-purple to-brand-magenta px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-3 w-3" />
                  <span>{isSubmittingReply ? "Posting..." : "Reply"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
