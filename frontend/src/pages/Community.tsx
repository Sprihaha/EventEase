import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router";
import { Sparkles, Camera, Rotate3d, Users, Bookmark, Clock } from "lucide-react";
import { cx } from "../components/ui";
import { SEO } from "../components/common";
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
      null;

    const matchedEvent = targetEventId ? events.find((e) => e.id === targetEventId) : null;
    const targetVenue =
      easePix.seatVenueInput.trim() ||
      matchedEvent?.venue ||
      (events[0]?.venue ?? "");

    if (!targetVenue) {
      showToast("Please specify a venue before uploading EasePix");
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
        venueName: targetVenue,
        eventId: targetEventId || undefined,
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
          venueName: targetVenue,
          eventId: targetEventId || undefined,
          section: sec,
          rowLabel: rowLabel || undefined,
          seatNumber: isNaN(seatNum as number) ? undefined : seatNum,
          photoUrl: photoToUse,
          caption: matchedEvent?.title
            ? `View from ${sec}, ${row} at ${targetVenue} · ${matchedEvent.title}.`
            : `View from ${sec}, ${row} at ${targetVenue}.`,
          authorName: user?.name ?? "Fan",
        });

        addPost({
          author: user?.name ?? "You",
          eventId: targetEventId || (events[0]?.id ?? ""),
          body: matchedEvent?.title
            ? `View from ${sec}, ${row} at ${targetVenue} (${matchedEvent.title}). Fantastic sightlines!`
            : `View from ${sec}, ${row} at ${targetVenue}. Fantastic sightlines!`,
          photo: photoToUse,
          section: sec,
          seatLabel: row,
        });

        await reloadCommunityData();
        easePix.setSeatPhotoInput("");
        easePix.setIsShareModalOpen(false);
        easePix.setHasSearched(true);
        easePix.setSeatVenueInput(targetVenue);
        easePix.setGallerySearchFilter({
          eventId: targetEventId || undefined,
          section: sec,
        });
        showToast("Seat view uploaded to EasePix successfully! You earned +15 EasePoints ✨");
        scrollToSection("seat-search-results");
      } catch {
        addPost({
          author: user?.name ?? "You",
          eventId: targetEventId || (events[0]?.id ?? ""),
          body: `View from ${sec}, ${row} at ${targetVenue}!`,
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

  const commsTitle =
    tab === "exchange"
      ? "EaseXchange — Verified Fan-to-Fan Ticket Exchange"
      : tab === "views"
      ? "EasePix & Venue Views — Real Fan Seat Photos"
      : "EaseComms — Fan Community & Event Discussions";
  const commsDesc =
    tab === "exchange"
      ? "Exchange and buy verified event tickets safely without scalpers or fraudulent markups on EventEase."
      : tab === "views"
      ? "Browse real community seat photos, stage visibility, and 360 degree venue views before you buy tickets."
      : "Connect with fellow event attendees in Singapore, discuss concerts and upcoming shows, and share your experiences.";

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <SEO
        title={commsTitle}
        description={commsDesc}
        canonicalPath={`/community${tab !== "feed" ? `?tab=${tab}` : ""}`}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": commsTitle,
          "description": commsDesc,
          "url": `https://eventease-frontend.onrender.com/community${tab !== "feed" ? `?tab=${tab}` : ""}`,
        }}
      />
      {/* 1. Cinematic Hero Banner */}
      <CommunityHeroBanner
        user={user}
        onExploreViews={() => setTab("views")}
      />

      {/* 2. Primary 3-tab navigation: EaseConnect vs EasePix & EaseXplore vs EaseXchange */}
      <CommunityHeaderNav
        activeTab={tab as "feed" | "views" | "exchange"}
        onSelectTab={(newTab) => {
          setTab(newTab);
          scrollToTabsIfAbove();
        }}
      />

      {/* 3. Main Content: EaseConnect / EasePix & EaseXplore vs EaseXchange */}
      <div
        ref={scrollContainerRef}
        id="community-scroll-viewport"
        className="community-scroll-container overflow-y-auto max-h-[calc(100vh-65px)] pr-2 sm:pr-3"
      >
        {tab === "feed" && (
          <div
            id="comms-workspace"
            className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
          >
            {/* Center Column */}
            <main className="min-w-0 space-y-5">
              {/* Section Header */}
              <div className="space-y-3 px-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-feature italic font-black text-2xl tracking-tight text-brand-purple leading-none">
                      EaseConnect
                    </h2>
                    <p className="text-xs text-muted mt-1.5">
                      What fans are talking about right now across Singapore
                    </p>
                  </div>
                </div>

                {/* Horizontal Quick Actions: Saved posts, My groups, Recent activity */}
                <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted mr-1">
                    Your space:
                  </span>
                  <button
                    type="button"
                    disabled={!user}
                    title={!user ? "Log in to view saved posts" : "View your saved posts"}
                    onClick={() => {
                      if (!user) {
                        showToast("Please log in to view your saved posts");
                        return;
                      }
                      showToast("You have 4 saved posts.");
                    }}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all shadow-2xs",
                      user
                        ? "cursor-pointer border-brand-line/70 bg-white text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple hover:border-brand-purple/30"
                        : "cursor-not-allowed opacity-45 bg-gray-100 text-gray-400 border-gray-200 shadow-none",
                    )}
                  >
                    <Bookmark className={cx("h-3.5 w-3.5", user ? "text-brand-purple" : "text-gray-400")} />
                    <span>Saved posts</span>
                  </button>
                  <button
                    type="button"
                    disabled={!user}
                    title={!user ? "Log in to view your groups" : "View your groups"}
                    onClick={() => {
                      if (!user) {
                        showToast("Please log in to view your groups");
                        return;
                      }
                      showToast("You are part of: Live Music Fans & Festival Crew");
                    }}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all shadow-2xs",
                      user
                        ? "cursor-pointer border-brand-line/70 bg-white text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple hover:border-brand-purple/30"
                        : "cursor-not-allowed opacity-45 bg-gray-100 text-gray-400 border-gray-200 shadow-none",
                    )}
                  >
                    <Users className={cx("h-3.5 w-3.5", user ? "text-brand-magenta" : "text-gray-400")} />
                    <span>My groups</span>
                  </button>
                  <button
                    type="button"
                    disabled={!user}
                    title={!user ? "Log in to view recent activity" : "View recent activity"}
                    onClick={() => {
                      if (!user) {
                        showToast("Please log in to view recent activity");
                        return;
                      }
                      showToast("All recent activity is up to date.");
                    }}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all shadow-2xs",
                      user
                        ? "cursor-pointer border-brand-line/70 bg-white text-brand-deep hover:bg-brand-lilac/50 hover:text-brand-purple hover:border-brand-purple/30"
                        : "cursor-not-allowed opacity-45 bg-gray-100 text-gray-400 border-gray-200 shadow-none",
                    )}
                  >
                    <Clock className={cx("h-3.5 w-3.5", user ? "text-brand-orange" : "text-gray-400")} />
                    <span>Recent activity</span>
                  </button>
                  {!user && (
                    <span className="text-[11px] text-muted italic ml-1">
                      (Log in to access)
                    </span>
                  )}
                </div>
              </div>

              {/* EaseConnect Feed */}
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
            </main>

            {/* Right Rail: Visible on EaseConnect feed */}
            <FeedRightRail events={events} onShowToast={showToast} />
          </div>
        )}

        {tab === "views" && (
          <div className="space-y-5 min-h-[580px] pb-10">
            {/* Section Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <h2 className="font-feature italic font-black text-2xl tracking-tight text-brand-purple leading-none">
                  EasePix & EaseXplore
                </h2>
                <p className="text-xs text-muted mt-1.5">
                  Share your seat view and browse verified community photos before buying
                </p>
              </div>
            </div>

            {/* EasePix & EaseXplore View without sidebar */}
            <EasePixView
              user={user}
              events={events}
              seatVenueInput={easePix.seatVenueInput}
              onSeatVenueInputChange={easePix.handleSeatVenueInputChange}
              venueOptions={easePix.venueOptions}
              seatEventIdInput={easePix.seatEventIdInput}
              onSeatEventIdInputChange={easePix.handleSeatEventIdInputChange}
              eventOptions={easePix.eventOptions}
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
                if (!easePix.seatVenueInput && events.length > 0) {
                  easePix.setSeatVenueInput(events[0].venue);
                }
                easePix.setIsShareModalOpen(true);
              }}
              onOpenEaseExplore={(sectionName) => easePix.handleOpenEaseExplore(sectionName)}
              onLikeEasePix={easePix.handleLikeEasePix}
            />
          </div>
        )}

        {tab === "exchange" && (
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
        seatVenueInput={easePix.seatVenueInput}
        onSeatVenueInputChange={easePix.setSeatVenueInput}
        venueOptions={easePix.venueOptions}
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
