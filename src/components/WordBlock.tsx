import React, { memo, useEffect, useRef } from 'react';
import { TextBlock } from '../types';

interface WordBlockProps {
    block: TextBlock;
    currentWordIndex: number;
    onWordClick: (idx: number) => void;
    fontSize: number;
    activeWordRef: React.RefObject<HTMLSpanElement | null>;
}

export const WordBlock = memo(({ block, currentWordIndex, onWordClick, fontSize, activeWordRef }: WordBlockProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleWordUpdate = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const { index, prevIndex } = detail;

            const isPrevIn = prevIndex >= block.wordStartIndex && prevIndex < block.wordStartIndex + block.wordCount;
            const isCurrentIn = index >= block.wordStartIndex && index < block.wordStartIndex + block.wordCount;

            if (!containerRef.current || (!isPrevIn && !isCurrentIn)) return;

            // Remove previous active class
            if (isPrevIn) {
                const prevEl = containerRef.current.querySelector(`[data-idx="${prevIndex}"]`);
                if (prevEl) {
                    prevEl.classList.remove('word-active');
                    prevEl.classList.add('opacity-70', 'dark:text-zinc-300');
                }
            }

            // Add new active class
            if (isCurrentIn) {
                const currentEl = containerRef.current.querySelector(`[data-idx="${index}"]`) as HTMLSpanElement;
                if (currentEl) {
                    currentEl.classList.add('word-active');
                    currentEl.classList.remove('opacity-70', 'dark:text-zinc-300');
                    if (activeWordRef) {
                        (activeWordRef as any).current = currentEl;
                    }
                }
            }
        };

        window.addEventListener('word-index-update', handleWordUpdate);
        return () => window.removeEventListener('word-index-update', handleWordUpdate);
    }, [block.wordStartIndex, block.wordCount, activeWordRef]);

    return (
        <div ref={containerRef} className="reader-text leading-[1.8] text-left mb-12" style={{ fontSize: `${fontSize}px` }}>
            {block.words.map((word, wIdx) => {
                const globalIdx = block.wordStartIndex + wIdx;
                const isCurrent = currentWordIndex === globalIdx;
                return (
                    <span
                        key={wIdx}
                        data-idx={globalIdx}
                        onClick={() => onWordClick(globalIdx)}
                        className={`word-highlight relative inline-block mr-[0.28em] px-1.5 py-0.5 rounded-lg cursor-pointer select-none touch-manipulation transition-all duration-75 ${isCurrent
                            ? 'word-active'
                            : 'opacity-70 hover:opacity-100 dark:text-zinc-300'
                            }`}
                    >
                        {word}
                    </span>
                );
            })}
        </div>
    );
}, (prev, next) => {
    const isIn = (idx: number, b: TextBlock) => idx >= b.wordStartIndex && idx < b.wordStartIndex + b.wordCount;
    const prevWasIn = isIn(prev.currentWordIndex, prev.block);
    const nextIsIn = isIn(next.currentWordIndex, next.block);
    if (!prevWasIn && !nextIsIn) return prev.fontSize === next.fontSize;
    return prev.currentWordIndex === next.currentWordIndex && prev.fontSize === next.fontSize;
});
