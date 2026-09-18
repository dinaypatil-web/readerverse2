import React, { useEffect, useRef } from 'react';
import { ScrollMode, ScrollSpeed } from './types';

export function useAutoScroll(
    scrollContainerRef: React.RefObject<HTMLDivElement | null>,
    activeWordRef: React.RefObject<HTMLSpanElement | null>,
    scrollMode: ScrollMode,
    scrollSpeed: ScrollSpeed,
    isPlaying: boolean,
    isActive: boolean,
    currentWordIndex: number
) {
    const lastScrolledLineTopRef = useRef<number>(-9999);
    const lastScrollTimeRef = useRef<number>(0);

    // 1. One-time center jump when clicking a word or resuming
    useEffect(() => {
        if (!isActive) return;
        const container = scrollContainerRef.current;
        const word = activeWordRef.current;
        if (!container || !word) return;

        if (scrollMode === 'manual' || !isPlaying) {
            const cRect = container.getBoundingClientRect();
            const wRect = word.getBoundingClientRect();
            const wordCenterRelative = (wRect.top + wRect.height / 2) - cRect.top;
            const targetY = cRect.height * 0.42;
            const diff = wordCenterRelative - targetY;
            if (Math.abs(diff) > 30) {
                container.scrollBy({ top: diff, behavior: 'smooth' });
            }
        }
    }, [currentWordIndex, isActive, isPlaying, scrollMode, scrollContainerRef, activeWordRef]);

    // 2. Active Line Movement during playback
    useEffect(() => {
        if (!isActive || !isPlaying || scrollMode === 'manual') return;

        const container = scrollContainerRef.current;
        const word = activeWordRef.current;
        if (!container || !word) return;

        const cRect = container.getBoundingClientRect();
        const wRect = word.getBoundingClientRect();

        // Detect line change (word top changed by more than 12px)
        const currentLineTop = Math.round(wRect.top);
        const lineChanged = Math.abs(currentLineTop - lastScrolledLineTopRef.current) > 12;

        // Target reading line position: 42% down the visible reading viewport
        const wordCenterRelative = (wRect.top + wRect.height / 2) - cRect.top;
        const targetY = cRect.height * 0.42;
        const diff = wordCenterRelative - targetY;

        const now = Date.now();
        const minInterval = scrollSpeed === 'fast' ? 120 : scrollSpeed === 'medium' ? 180 : 260;

        if (scrollMode === 'follow') {
            // Scroll when the line advances or when word moves out of the reading anchor zone
            if ((lineChanged && Math.abs(diff) > 16) || Math.abs(diff) > 50) {
                if (now - lastScrollTimeRef.current > minInterval) {
                    lastScrolledLineTopRef.current = currentLineTop;
                    lastScrollTimeRef.current = now;
                    container.scrollBy({ top: diff, behavior: 'smooth' });
                }
            }
        } else if (scrollMode === 'snap') {
            if (Math.abs(diff) > 50 && now - lastScrollTimeRef.current > minInterval) {
                lastScrolledLineTopRef.current = currentLineTop;
                lastScrollTimeRef.current = now;
                container.scrollBy({ top: diff, behavior: 'smooth' });
            }
        }
    }, [currentWordIndex, scrollMode, scrollSpeed, isPlaying, isActive, scrollContainerRef, activeWordRef]);
}
