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

            if (scrollMode === 'follow') {
                const targetY = cRect.top + cRect.height * 0.5;
                const diff = wRect.top - targetY;
                if (Math.abs(diff) > 2) container.scrollTop += diff * lerp;
            } else if (scrollMode === 'snap') {
                if (wRect.top < cRect.top + 100 || wRect.bottom > cRect.bottom - 150) {
                    const targetY = cRect.top + cRect.height * 0.5;
                    const diff = wRect.top - targetY;
                    container.scrollTop += diff * 0.2;
                }
            }
            rafId = requestAnimationFrame(animate);
        };

        if (isPlaying) rafId = requestAnimationFrame(animate);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [scrollMode, scrollSpeed, isPlaying, isActive, currentWordIndex]);
}
