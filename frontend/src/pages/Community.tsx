import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router";
import { Sparkles, Camera, Rotate3d, Users } from "lucide-react";
import { cx } from "../components/ui";
import { useStore } from "../lib/store";
import {
  backendListPosts,
  backendListEasePix,
  backendCreateEasePix,
  type BackendCommunityPost,
  type BackendEasePix,
} from "../lib/backendApi";

// Modular Community components, types, hooks, and constants
import { allTabs } from "../components/community/constants";
import type { CommsChannelId } from "../components/community/types";
import { parseSeatParts } from "../components/community/utils/seatMatching";

import { CommunityHeroBanner } from "../components/community/navigation/CommunityHeroBanner";
import { CommunityHeaderNav } from "../components/community/navigation/CommunityHeaderNav";
import { CommunitySidebar } from "../components/community/navigation/CommunitySidebar";

import { EaseConnectFeed } from "../components/community/feed/EaseConnectFeed";
import { FeedRightRail } from "../components/community/feed/FeedRightRail";

import { EasePixView } from "../components/community/easepix/EasePixView";
import { CommunityExchangeView } from "../components/community/exchange/CommunityExchangeView";

import { ShareSeatViewModal } from "../components/community/modals/ShareSeatViewModal";
import { EaseXplore360Modal } from "../components/community/modals/EaseXplore360Modal";
import { CommunityVoiceWidget } from "../components/community/widgets/CommunityVoiceWidget";

import { useCommunityFeed } from "../components/community/hooks/useCommunityFeed";
import { useEasePix } from "../components/community/hooks/useEasePix";
import { useFeedVoiceNarrator } from "../components/community/hooks/useFeedVoiceNarrator";

export default function Community() {
  const { posts, events, user, addPost } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedTab = searchParams.get("tab");
  const tab = requestedTab === "access" ? "views" : (allTabs.find((item) => item.id === requestedTab)?.id ?? "feed");
  const [lastCommsTab, setLastCommsTab] = useState<CommsChannelId>(
    tab === "exchange" ? "feed" : (tab as CommsChannelId)
  );

  const [backendPosts, setBackendPosts] = useState<BackendCommunityPost[]>([]);
  const [backendEasePixList, setBackendEasePixList] = useState<BackendEasePix[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const reloadCommunityData = useCallback(async () => {
    try {
      const [fetchedPosts, fetchedPix] = await Promise.all([
        backendListPosts().catch(() => []),
        backendListEasePix().catch(() => []),
      ]);
      setBackendPosts(fetchedPosts);
      setBackendEasePixList(fetchedPix);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    reloadCommunityData();
  }, [reloadCommunityData]);

  useEffect(() => {
    if (tab !== "exchange") {
      setLastCommsTab(tab as CommsChannelId);
    }
  }, [tab]);

  const mainSection = tab === "exchange" ? "exchange" : "comms";

  const scrollToTabsIfAbove = useCallback(() => {
    const element = document.getElementById("main-tabs-nav");
    if (!element) return;
    const navBar = document.querySelector("header");
    const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 64;
    const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
    const targetY = Math.max(0, Math.round(elementTop - navBarHeight - 12));

    if (Math.round(window.pageYOffset) < targetY - 4) {
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((targetId: string = "main-tabs-nav") => {
    setTimeout(() => {
      const element = document.getElementById(targetId);
      if (element) {
        if (scrollContainerRef.current && scrollContainerRef.current.contains(element)) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          const navBar = document.querySelector("header");
          const navBarHeight = navBar ? navBar.getBoundingClientRect().height : 64;
          const yOffset = -(navBarHeight + 16);
          const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
          window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        }
      }
    }, 50);
  }, []);

  const setTab = useCallback((id: (typeof allTabs)[number]["id"]) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", id);
      next.delete("view");
      return next;
    });
    const found = allTabs.find((t) => t.id === id);
    if (found) {
      showToast(`${found.label} selected`);
    }
    scrollToTabsIfAbove();
  }, [setSearchParams, showToast, scrollToTabsIfAbove]);

  useEffect(() => {
    if (requestedTab === "exchange") {
      scrollToTabsIfAbove();
    }
  }, [requestedTab, scrollToTabsIfAbove]);

  // Reset internal scroll position when switching between main tabs or channels
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [mainSection, tab]);

  const eventName = useCallback((id: string) => events.find((e) => e.id === id)?.title ?? "Live Music", [events]);

  // Ref to easePix so feed callback can reference easePix without circular dependency
  const easePixRef = useRef<ReturnType<typeof useEasePix> | null>(null);

  // Hook 1: Feed state
  const feed = useCommunityFeed({
    user,
    events,
    posts,
    backendPosts,
    addPost,
    reloadCommunityData,
    onShowToast: showToast,
    onPostCreatedWithPhoto: (targetEventId, section) => {
      easePixRef.current?.setHasSearched(true);
      easePixRef.current?.setGallerySearchFilter({
        eventId: targetEventId,
        section,
      });
    },
  });

  // Hook 2: EasePix & Seat Views state
  const requestedEvent = searchParams.get("event") ?? "";
  const easePix = useEasePix({
    events,
    displayPosts: feed.displayPosts,
    backendEasePixList,
    initialEventId: requestedEvent,
    reloadCommunityData,
    onShowToast: showToast,
    scrollToSection,
  });
  easePixRef.current = easePix;

  // Hook 3: Feed Voice Narrator
  const voice = useFeedVoiceNarrator(feed.displayPosts, eventName, showToast);

  // Submit seat photo modal upload
  const handleModalUploadSubmit = async () => {
    const targetEventId =
      easePix.seatEventIdInput ||
      (easePix.shareModalOrigin === "composer" ? feed.selectedEventId : null) ||
      events[0]?.id ||
      "";

    if (!targetEventId) {
      showToast("Please select an event before uploading EasePix");
      return;
    }

    const sec = easePix.seatSectionInput.trim() || (easePix.sectionOptions[0]?.value ?? "General");
    const row = easePix.seatRowInput.trim() || "GA";

    if (!easePix.seatPhotoInput.trim()) {
      showToast("Please choose an image file or provide an image link");
      return;
    }

    const photoToUse = easePix.seatPhotoInput.trim();

    if (easePix.shareModalOrigin === "composer") {
      feed.setAttachedEasePix({
        photo: photoToUse,
        section: sec,
        row: row,
        eventId: targetEventId,
      });
      feed.setPhotoUrl(photoToUse);
      easePix.setIsShareModalOpen(false);
      showToast("EasePix attached! You're back to drafting your post.");
      feed.textareaRef.current?.focus();
    } else {
      try {
        const parts = parseSeatParts(row);
        const rowLabel = parts.row || row;
        const seatNum = parts.seat ? parseInt(parts.seat, 10) : undefined;

        await backendCreateEasePix({
          eventId: targetEventId,
          section: sec,
          rowLabel: rowLabel || undefined,
          seatNumber: isNaN(seatNum as number) ? undefined : seatNum,
          photoUrl: photoToUse,
          caption: `View from ${sec}, ${row}.`,
          authorName: user?.name ?? "Fan",
        });

        addPost({
          author: user?.name ?? "You",
          eventId: targetEventId,
          body: `View from ${sec}, ${row}. Unobstructed sightline to the main stage and fantastic acoustics!`,
          photo: photoToUse,
          section: sec,
          seatLabel: row,
        });

        await reloadCommunityData();
        easePix.setSeatPhotoInput("");
        easePix.setIsShareModalOpen(false);
        easePix.setHasSearched(true);
        easePix.setGallerySearchFilter({
          eventId: targetEventId,
          section: sec,
        });
        showToast("Seat view uploaded to EasePix successfully! You earned +15 EasePoints ✨");
        scrollToSection("seat-search-results");
      } catch {
        addPost({
          author: user?.name ?? "You",
          eventId: targetEventId,
          body: `View from ${sec}, ${row}. Unobstructed sightline to the main stage!`,
          photo: photoToUse,
          section: sec,
          seatLabel: row,
        });
        easePix.setIsShareModalOpen(false);
        easePix.setHasSearched(true);
        showToast("Seat view uploaded to EasePix successfully! ✨");
        scrollToSection("seat-search-results");
      }
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* 1. Cinematic Hero Banner */}
      <CommunityHeroBanner
        user={user}
        onExploreViews={() => setTab("views")}
      />

      {/* 2. Top-level side-by-side tabs: EaseComms vs EaseExchange */}
      <CommunityHeaderNav
        mainSection={mainSection}
        onSelectComms={() => {
          setTab(lastCommsTab);
          scrollToTabsIfAbove();
        }}
        onSelectExchange={() => {
          setTab("exchange");
          scrollToTabsIfAbove();
        }}
      />

      {/* 3. Main Content: EaseComms vs EaseExchange (Internal Scroll Viewport) */}
      <div
        ref={scrollContainerRef}
        id="community-scroll-viewport"
        className="community-scroll-container overflow-y-auto max-h-[calc(100vh-175px)] pr-2 sm:pr-3"
      >
        {mainSection === "comms" ? (
          <div
            id="comms-workspace"
            className={cx(
              "grid grid-cols-1 gap-6 transition-all duration-300",
              isSidebarCollapsed
                ? (tab === "feed" ? "lg:grid-cols-[72px_minmax(0,1fr)_280px]" : "lg:grid-cols-[72px_minmax(0,1fr)]")
                : (tab === "feed" ? "lg:grid-cols-[240px_minmax(0,1fr)_280px]" : "lg:grid-cols-[240px_minmax(0,1fr)]"),
            )}
          >
            {/* Left Rail */}
            <CommunitySidebar
              tab={tab as "feed" | "views"}
              onSelectTab={setTab}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleCollapse={setIsSidebarCollapsed}
              onShowToast={showToast}
            />

            {/* Center Column */}
            <main className="min-w-0 space-y-5">
              {/* Channel Header Banner */}
              <div className="rounded-3xl border border-brand-line bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {tab === "views" ? (
                      <div className="flex items-center -space-x-1.5 shrink-0">
                        <div
                          title="EasePix: Seat View Photos"
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-lilac text-brand-purple border-2 border-white shadow-xs"
                        >
                          <Camera className="h-5 w-5" />
                        </div>
                        <div
                          title="EaseXplore: 360° Views"
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-brand-orange border-2 border-white shadow-xs"
                        >
                          <Rotate3d className="h-5 w-5" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-lilac text-brand-purple shadow-xs shrink-0">
                        <Users className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-deep">
                        {tab === "feed" && "Community"}
                        {tab === "views" && "EasePix & EaseXplore"}
                      </h2>
                      <p className="text-xs text-muted">
                        {tab === "feed" && "What fans are talking about right now across Singapore"}
                        {tab === "views" && "Share your seat view and browse verified community photos before buying"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* EaseConnect Feed Tab */}
              {tab === "feed" && (
                <EaseConnectFeed
                  user={user}
                  events={events}
                  posts={feed.filteredPosts}
                  eventName={eventName}
                  filter={feed.filter}
                  onFilterChange={feed.setFilter}
                  draft={feed.draft}
                  onDraftChange={feed.setDraft}
                  selectedEventId={feed.selectedEventId}
                  onSelectedEventIdChange={feed.setSelectedEventId}
                  photoUrl={feed.photoUrl}
                  onPhotoUrlChange={feed.setPhotoUrl}
                  showPhotoInput={feed.showPhotoInput}
                  onTogglePhotoInput={feed.setShowPhotoInput}
                  attachedEasePix={feed.attachedEasePix}
                  onDetachEasePix={() => {
                    feed.setAttachedEasePix(null);
                    feed.setPhotoUrl("");
                    showToast("EasePix detached from draft");
                  }}
                  onOpenUploadModal={() => {
                    easePix.setShareModalOrigin("composer");
                    easePix.setSeatPhotoInput(feed.attachedEasePix?.photo || feed.photoUrl || "");
                    if (!easePix.seatEventIdInput && feed.selectedEventId) {
                      easePix.setSeatEventIdInput(feed.selectedEventId);
                    }
                    easePix.setIsShareModalOpen(true);
                  }}
                  onSubmitPost={feed.submitPost}
                  likedPosts={feed.likedPosts}
                  likesCount={feed.likesCount}
                  onToggleLike={feed.toggleLike}
                  openCommentsForPost={feed.openCommentsForPost}
                  onToggleComments={(id) =>
                    feed.setOpenCommentsForPost((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  replyDrafts={feed.replyDrafts}
                  onReplyDraftChange={(id, text) =>
                    feed.setReplyDrafts((prev) => ({ ...prev, [id]: text }))
                  }
                  onSubmitReply={feed.submitReply}
                  submittingReply={feed.submittingReply}
                  onPreview360={(p) => easePix.setPreview360Photo(p)}
                  onShowToast={showToast}
                  composerRef={feed.composerRef}
                  textareaRef={feed.textareaRef}
                />
              )}

              {/* EasePix Tab */}
              {tab === "views" && (
                <EasePixView
                  user={user}
                  events={events}
                  seatEventIdInput={easePix.seatEventIdInput}
                  onSeatEventIdInputChange={(val) => {
                    easePix.setSeatEventIdInput(val);
                    easePix.setSeatSectionInput("");
                    easePix.setSeatRowInput("");
                    easePix.setSelectedGallerySection("all");
                    easePix.setGallerySearchFilter(val ? { eventId: val } : null);
                    easePix.setHasSearched(false);
                  }}
                  seatSectionInput={easePix.seatSectionInput}
                  onSeatSectionInputChange={(val) => {
                    easePix.setSeatSectionInput(val);
                    easePix.setSeatRowInput("");
                  }}
                  seatRowInput={easePix.seatRowInput}
                  onSeatRowInputChange={easePix.setSeatRowInput}
                  sectionOptions={easePix.sectionOptions}
                  rowSeatOptions={easePix.rowSeatOptions}
                  loadingSeats={easePix.loadingSeats}
                  hasSearched={easePix.hasSearched}
                  gallerySearchFilter={easePix.gallerySearchFilter}
                  selectedGallerySection={easePix.selectedGallerySection}
                  onSelectGallerySection={easePix.setSelectedGallerySection}
                  sectionsToDisplay={easePix.sectionsToDisplay}
                  orderedSections={easePix.orderedSections}
                  totalPhotos={easePix.totalPhotos}
                  onFindSeatViews={easePix.handleFindSeatViews}
                  onClearSearchFilter={easePix.handleClearSearchFilter}
                  onOpenUploadModal={(sectionName) => {
                    easePix.setShareModalOrigin("easepix");
                    if (sectionName) easePix.setSeatSectionInput(sectionName);
                    if (!easePix.seatEventIdInput && events.length > 0) {
                      easePix.setSeatEventIdInput(events[0].id);
                    }
                    easePix.setIsShareModalOpen(true);
                  }}
                  onOpenEaseExplore={(sectionName) => easePix.handleOpenEaseExplore(sectionName)}
                  onLikeEasePix={easePix.handleLikeEasePix}
                />
              )}
            </main>

            {/* Right Rail: Only visible on EaseConnect feed */}
            {tab === "feed" && (
              <FeedRightRail events={events} onShowToast={showToast} />
            )}
          </div>
        ) : (
          /* Dedicated EaseExchange View */
          <CommunityExchangeView user={user} />
        )}
      </div>

      {/* Pop-up Modal: Share Your Seat View */}
      <ShareSeatViewModal
        isOpen={easePix.isShareModalOpen}
        onClose={() => easePix.setIsShareModalOpen(false)}
        user={user}
        events={events}
        seatEventIdInput={easePix.seatEventIdInput}
        onSeatEventIdInputChange={easePix.setSeatEventIdInput}
        seatSectionInput={easePix.seatSectionInput}
        onSeatSectionInputChange={easePix.setSeatSectionInput}
        seatRowInput={easePix.seatRowInput}
        onSeatRowInputChange={easePix.setSeatRowInput}
        seatPhotoInput={easePix.seatPhotoInput}
        onSeatPhotoInputChange={easePix.setSeatPhotoInput}
        sectionOptions={easePix.sectionOptions}
        rowSeatOptions={easePix.rowSeatOptions}
        shareModalOrigin={easePix.shareModalOrigin}
        selectedEventId={feed.selectedEventId}
        onSelectedEventIdChange={feed.setSelectedEventId}
        onSubmitUpload={handleModalUploadSubmit}
        onShowToast={showToast}
      />

      {/* Floating EaseVoice Widget */}
      <CommunityVoiceWidget
        isPlaying={voice.isPlaying}
        onToggle={voice.toggleVoice}
      />

      {/* 360° Photo Preview Modal */}
      <EaseXplore360Modal
        preview360Photo={easePix.preview360Photo}
        onClose={() => easePix.setPreview360Photo(null)}
        sectionOptions={easePix.sectionOptions}
        hasAccessibleSeats={easePix.eventSeats.some((s) => s.isAccessible)}
        onUpdatePreview={easePix.setPreview360Photo}
      />

      {/* Toast Notification */}
      <div
        className={cx(
          "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-brand-deep px-5 py-3 text-xs font-bold text-white shadow-2xl transition-all duration-300 pointer-events-none flex items-center gap-2",
          toastMessage ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
      >
        <Sparkles className="h-4 w-4 text-brand-orange" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}
