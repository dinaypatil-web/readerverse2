import React, { memo, useEffect, useRef } from 'react';
import { TextBlock } from '../types';

interface WordBlockProps {
    block: TextBlock;
    currentWordIndex: number;
    onWordClick: (idx: number) => void;
    fontSize: number;
    activeWordRef: React.RefObject<HTMLSpanElement | null>;
    bookType?: string;
}

export const WordBlock = memo(({ block, currentWordIndex, onWordClick, fontSize, activeWordRef, bookType }: WordBlockProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const elementsCache = useRef<Map<number, HTMLSpanElement>>(new Map());
    const currentlyActiveSpanRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        const handleWordUpdate = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const { index } = detail;

            const isCurrentIn = index >= block.wordStartIndex && index < block.wordStartIndex + block.wordCount;
            const activeClass = bookType === 'pdf' ? 'word-active-pdf' : 'word-active';

            if (!isCurrentIn) {
                // If this block held an active highlight, clean it up completely
                if (currentlyActiveSpanRef.current) {
                    currentlyActiveSpanRef.current.classList.remove('word-active', 'word-active-pdf');
                    currentlyActiveSpanRef.current.classList.add('opacity-70', 'dark:text-zinc-300');
                    currentlyActiveSpanRef.current = null;
                }
                return;
            }

            // Target word belongs to this block
            const targetEl = elementsCache.current.get(index);
            if (currentlyActiveSpanRef.current && currentlyActiveSpanRef.current !== targetEl) {
                currentlyActiveSpanRef.current.classList.remove('word-active', 'word-active-pdf');
                currentlyActiveSpanRef.current.classList.add('opacity-70', 'dark:text-zinc-300');
            }

            if (targetEl) {
                targetEl.classList.add(activeClass);
                targetEl.classList.remove('opacity-70', 'dark:text-zinc-300');
                currentlyActiveSpanRef.current = targetEl;
                if (activeWordRef) {
                    (activeWordRef as any).current = targetEl;
                }
            }
        };

        window.addEventListener('word-index-update', handleWordUpdate);
        return () => window.removeEventListener('word-index-update', handleWordUpdate);
    }, [block.wordStartIndex, block.wordCount, activeWordRef, bookType]);

    return (
        <div ref={containerRef} className="reader-text leading-[1.8] text-left mb-12" style={{ fontSize: `${fontSize}px` }}>
            {block.words.map((word, wIdx) => {
                const globalIdx = block.wordStartIndex + wIdx;
                const isCurrent = currentWordIndex === globalIdx;
                const isPdf = bookType === 'pdf';
                const activeClass = isPdf ? 'word-active-pdf' : 'word-active';

                return (
                    <span
                        key={wIdx}
                        ref={(el) => {
                            if (el) {
                                elementsCache.current.set(globalIdx, el);
                                if (isCurrent) currentlyActiveSpanRef.current = el;
                            } else {
                                elementsCache.current.delete(globalIdx);
                            }
                        }}
                        data-idx={globalIdx}
                        onClick={() => onWordClick(globalIdx)}
                        className={`relative inline-block mr-[0.28em] px-1.5 py-0.5 rounded-lg cursor-pointer select-none touch-manipulation transition-colors duration-100 ${!isPdf ? 'word-highlight' : ''
                            } ${isCurrent
                                ? activeClass
                                : 'opacity-70 hover:opacity-100 dark:text-zinc-300'
                            }`}
                    >
                        {word}
                    </span>
                );
            })}
        </div>
    );
},
    (prev, next) => {
        const isIn = (idx: number, b: TextBlock) => idx >= b.wordStartIndex && idx < b.wordStartIndex + b.wordCount;
        const prevWasIn = isIn(prev.currentWordIndex, prev.block);
        const nextIsIn = isIn(next.currentWordIndex, next.block);
        if (!prevWasIn && !nextIsIn) return prev.fontSize === next.fontSize;
        return prev.currentWordIndex === next.currentWordIndex && prev.fontSize === next.fontSize;
    });
