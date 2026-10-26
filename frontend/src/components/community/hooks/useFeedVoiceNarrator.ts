import { useState, useEffect, useCallback } from "react"
import type { DisplayPost } from "../types"

export function useFeedVoiceNarrator(
  displayPosts: DisplayPost[],
  eventName: (id: string) => string,
  onShowToast: (msg: string) => void,
) {
  const [isPlaying, setIsPlaying] = useState(false)

  const toggleVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      onShowToast("Speech synthesis is not supported on this device.")
      return
    }

    if (isPlaying) {
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      onShowToast("EaseVoice audio paused.")
    } else {
      const topPost = displayPosts[0]
      const textToSpeak = topPost
        ? `EaseVoice narration. Community post by ${topPost.author} on ${eventName(topPost.eventId)}. ${topPost.body}`
        : "Welcome to EaseComms. The night is better together. Discover real seat views, trade tickets securely, and find your people."

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.rate = 1.0
      utterance.pitch = 1.05
      utterance.onend = () => setIsPlaying(false)
      utterance.onerror = () => setIsPlaying(false)

      window.speechSynthesis.speak(utterance)
      setIsPlaying(true)
      onShowToast("Playing EaseVoice feed narration ▷")
    }
  }, [isPlaying, displayPosts, eventName, onShowToast])

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return {
    isPlaying,
    toggleVoice,
  }
}
