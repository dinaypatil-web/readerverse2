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
        // Increased lerp factors for tighter centering
        const lerpFactors: Record<ScrollSpeed, number> = { slow: 0.1, medium: 0.15, fast: 0.25 };
        const lerp = lerpFactors[scrollSpeed];

        const animate = () => {
            const container = scrollContainerRef.current;
            const word = activeWordRef.current;
            if (!container || !word) { rafId = requestAnimationFrame(animate); return; }

            const cRect = container.getBoundingClientRect();
            const wRect = word.getBoundingClientRect();

            // Recalculate based on true screen center and word vertical midpoint
            const targetY = window.innerHeight / 2;
            const wordCenter = wRect.top + wRect.height / 2;
            const diff = wordCenter - targetY;

            // Instant jump threshold (30% of container height)
            if (Math.abs(diff) > container.clientHeight * 0.3) {
                container.scrollTop += diff;
            }

            if (scrollMode === 'follow') {
                if (Math.abs(diff) > 0.5) container.scrollTop += diff * lerp;
            } else if (scrollMode === 'snap') {
                // Snap if far from center
                if (Math.abs(diff) > 100) {
                    container.scrollTop += diff * 0.25;
                }
            }
            rafId = requestAnimationFrame(animate);
        };

        if (isPlaying) rafId = requestAnimationFrame(animate);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [scrollMode, scrollSpeed, isPlaying, isActive, currentWordIndex]);
}
