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
                const targetY = c.getBoundingClientRect().top + c.getBoundingClientRect().height * 0.5;
                const diff = w.getBoundingClientRect().top - targetY;
                if (Math.abs(diff) > 100) c.scrollTo({ top: c.scrollTop + diff, behavior: 'auto' });
            }
            return;
        }

        let rafId: number;
        const lerpFactors: Record<ScrollSpeed, number> = { slow: 0.03, medium: 0.08, fast: 0.15 };
        const lerp = lerpFactors[scrollSpeed];

        const animate = () => {
            const container = scrollContainerRef.current;
            const word = activeWordRef.current;
            if (!container || !word) { rafId = requestAnimationFrame(animate); return; }

            const cRect = container.getBoundingClientRect();
            const wRect = word.getBoundingClientRect();
            const targetY = cRect.top + cRect.height * 0.5;
            const diff = wRect.top - targetY;

            // Instant jump threshold (30% of container height)
            if (Math.abs(diff) > container.clientHeight * 0.3) {
                container.scrollTop += diff;
                // Don't skip the rest, let lerp handle fine-tuning
            }

            if (scrollMode === 'follow') {
                if (Math.abs(diff) > 1) container.scrollTop += diff * lerp;
            } else if (scrollMode === 'snap') {
                if (wRect.top < cRect.top + 100 || wRect.bottom > cRect.bottom - 150) {
                    container.scrollTop += diff * 0.2;
                }
            }
            rafId = requestAnimationFrame(animate);
        };

        if (isPlaying) rafId = requestAnimationFrame(animate);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [scrollMode, scrollSpeed, isPlaying, isActive, currentWordIndex]);
}
