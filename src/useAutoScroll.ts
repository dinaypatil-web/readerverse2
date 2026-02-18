import React, { useEffect } from 'react';
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
    useEffect(() => {
        if (!isActive) return;

        if (scrollMode === 'manual') {
            // One-time scroll on word click (not during playback)
            if (!isPlaying && activeWordRef.current && scrollContainerRef.current) {
                const c = scrollContainerRef.current;
                const w = activeWordRef.current;
                const wRect = w.getBoundingClientRect();
                const targetY = window.innerHeight / 2;
                const wordCenter = wRect.top + wRect.height / 2;
                const diff = wordCenter - targetY;
                if (Math.abs(diff) > 50) c.scrollTo({ top: c.scrollTop + diff, behavior: 'auto' });
            }
            return;
        }

        let rafId: number;
        // Aggressive lerp factors for absolute center-lock
        const lerpFactors: Record<ScrollSpeed, number> = { slow: 0.15, medium: 0.25, fast: 0.4 };
        const lerp = lerpFactors[scrollSpeed];

        const animate = () => {
            const container = scrollContainerRef.current;
            const word = activeWordRef.current;
            if (!container || !word) { rafId = requestAnimationFrame(animate); return; }

            const cRect = container.getBoundingClientRect();
            const wRect = word.getBoundingClientRect();

            // Absolute screen center targeting
            const targetY = window.innerHeight * 0.5; // Use multiplier for precision
            const wordCenter = wRect.top + (wRect.height * 0.5);
            const diff = wordCenter - targetY;

            // Instant jump for transitions
            if (Math.abs(diff) > container.clientHeight * 0.2) {
                container.scrollTop += diff;
            }

            if (scrollMode === 'follow') {
                // Smooth glide to center
                // Increased lerp for better responsiveness to CustomEvent updates
                if (Math.abs(diff) > 0.05) container.scrollTop += diff * (lerp * 1.5);
            } else if (scrollMode === 'snap') {
                if (Math.abs(diff) > 60) {
                    container.scrollTop += diff * 0.45;
                }
            }
            rafId = requestAnimationFrame(animate);
        };

        const handleWordUpdate = () => {
            // Trigger animation frame calculation immediately when a word change event happens
            if (isActive && isPlaying) {
                // The animate loop is already running, but this ensures we don't lag behind the event
            }
        };

        window.addEventListener('word-index-update', handleWordUpdate);
        if (isPlaying) rafId = requestAnimationFrame(animate);
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener('word-index-update', handleWordUpdate);
        };
    }, [scrollMode, scrollSpeed, isPlaying, isActive]);
}
