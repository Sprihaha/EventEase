import {
  AlertTriangle,
  Check,
  Heart,
  MessageSquare,
  RotateCcw,
  Rotate3d,
  Send,
  Share2,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react"
import { cx } from "../../ui"
import type { DisplayPost, Preview360Photo, User } from "../types"
import { EASEPOINTS_RULES } from "../../../lib/easePoints"

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
  onModeratePost?: (
    postId: string,
    data: { isFlagged?: boolean; isRemoved?: boolean; flagReason?: string | null },
  ) => void
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
  onModeratePost,
}: FeedPostCardProps) {
  const evName = eventName(post.eventId)
  const isAdmin = user?.role === "admin"
  const isQuestionPost = Boolean(post.isQuestion)

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
            <div className="flex items-center gap-1.5">
              {isQuestionPost && (
                <span className="rounded-full bg-brand-lilac/80 px-2 py-0.5 text-[10px] font-extrabold text-brand-purple border border-brand-purple/20">
                  Question
                </span>
              )}
              <span className="rounded-full bg-brand-warm px-2 py-0.5 text-[10px] font-bold text-muted border border-brand-line">
                {post.section ? `Sec ${post.section}` : "Fan Post"}
              </span>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-brand-deep/90">
            {post.body}
          </p>

          {/* Under Review / Flagged Warning Banner */}
          {post.isFlagged && (
            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 text-xs text-amber-900 shadow-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <span className="font-bold">Under Community Review:</span>{" "}
                <span className="text-amber-800 font-medium">
                  {post.flagReason || "This post has been flagged for potential misinformation or content review."}
                </span>
              </div>
            </div>
          )}

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
                  {post.section ? "SEAT VIEW" : "POST PHOTO"}
                </span>
                <span>
                  {post.section ? `${evName} · Section ${post.section}` : evName}
                </span>
              </div>
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
                      post.replies.length === 1
                        ? (isQuestionPost ? "answer" : "comment")
                        : (isQuestionPost ? "answers" : "comments")
                    }`
                  : (isAdmin && isQuestionPost ? "Answer" : "Comment")}
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

            {user && user.role !== "organizer" && user.role !== "admin" && post.isQuestion && (
              <div className="ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold text-brand-orange">
                <Sparkles className="h-3 w-3" /> +{EASEPOINTS_RULES.POINTS_PER_QUALIFYING_QUESTION} EasePoints
              </div>
            )}
          </div>

          {/* Admin Manual Moderation Bar */}
          {user?.role === "admin" && (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-purple/20 bg-brand-purple/5 p-3 text-xs">
              <div className="flex items-center gap-2 font-bold text-brand-purple">
                <ShieldAlert className="h-4 w-4 text-brand-purple shrink-0" />
                <span>Admin Moderation</span>
                {post.isRemoved && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-xs">
                    Removed
                  </span>
                )}
                {post.isFlagged && !post.isRemoved && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-xs">
                    Flagged
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {post.isFlagged ? (
                  <button
                    type="button"
                    onClick={() => onModeratePost?.(post.id, { isFlagged: false, flagReason: null })}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-xs"
                    title="Clear flag and mark content clean"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-600" /> Clear Flag
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onModeratePost?.(post.id, { isFlagged: true, flagReason: "Flagged by Admin: Misleading or unverified content" })}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-xl border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-xs"
                    title="Flag post for potential misinformation"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Flag Misleading
                  </button>
                )}

                {post.isRemoved ? (
                  <button
                    type="button"
                    onClick={() => onModeratePost?.(post.id, { isRemoved: false, isFlagged: false, flagReason: null })}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
                    title="Restore removed post back to community feed"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore Post
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onModeratePost?.(post.id, { isRemoved: true, isFlagged: true, flagReason: "Removed by Admin: Policy violation" })}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-xl bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700 transition shadow-xs"
                    title="Remove post from community feed"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove Post
                  </button>
                )}
              </div>
            </div>
          )}

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
                  {post.replies.map((reply) => {
                    const isReplyByAdmin = reply.isAdmin || reply.author.toLowerCase().includes("admin")
                    return (
                      <div
                        key={reply.id}
                        className={cx(
                          "rounded-xl border p-3 text-xs shadow-xs",
                          isReplyByAdmin
                            ? "border-brand-purple/30 bg-brand-purple/5"
                            : "border-brand-line/60 bg-white"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-brand-deep">
                              {reply.author}
                            </span>
                            {isReplyByAdmin && (
                              <span className="rounded bg-brand-purple text-white px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider">
                                Official Answer
                              </span>
                            )}
                            {reply.isVerified && !isReplyByAdmin && (
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
                    )
                  })}
                </div>
              ) : (
                <div className="py-2.5 text-center text-xs text-muted">
                  {isQuestionPost
                    ? "No answers to this question yet. Be the first to answer!"
                    : "No comments on this post yet. Be the first to reply!"}
                </div>
              )}

              {/* Inline Reply Composer */}
              {isAdmin && !isQuestionPost ? (
                <div className="flex items-center gap-2 pt-2 border-t border-brand-line/60">
                  <div className="flex-1 rounded-xl border border-dashed border-brand-purple/30 bg-brand-purple/5 px-3 py-2 text-xs text-brand-purple/80 font-medium">
                    Admins can only answer question posts.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2 border-t border-brand-line/60">
                  <input
                    type="text"
                    placeholder={
                      isAdmin
                        ? "Answer this question as Admin..."
                        : user
                          ? (isQuestionPost ? "Answer this question..." : "Write a comment...")
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
                    <span>
                      {isSubmittingReply
                        ? (isAdmin ? "Answering..." : "Posting...")
                        : (isAdmin ? "Answer" : isQuestionPost ? "Answer" : "Reply")}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
