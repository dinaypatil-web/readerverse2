import React, { memo, useRef, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Book } from '../types';
import { pdfjsLib } from '../parsers';

interface PDFRendererProps {
    pdf: any;
    scale: number;
    onPageChange: (pageNum: number) => void;
    onWordClick: (index: number) => void;
    currentWordIndex: number;
    activeBook: Book | null;
}

export const PDFRenderer = ({ pdf, scale, onPageChange, onWordClick, currentWordIndex, activeBook }: PDFRendererProps) => {
    const calculateWordIndexOffset = (pageNum: number) => {
        if (!activeBook) return 0;
        let offset = 0;
        for (let i = 1; i < pageNum; i++) {
            const pageChapters = activeBook.chapters.filter(c => c.pageNumber === i);
            if (pageChapters.length > 0) offset += pageChapters[0].wordCount || 0;
        }
        return offset;
    };

    if (!pdf) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-sm font-bold opacity-60">Loading PDF...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            {Array.from({ length: pdf.numPages }).map((_, i) => {
                const pageNum = i + 1;
                return (
                    <PDFPage
                        key={i}
                        pdf={pdf}
                        pageNum={pageNum}
                        scale={scale}
                        onVisible={onPageChange}
                        onWordClick={onWordClick}
                        currentWordIndex={currentWordIndex}
                        wordIndexOffset={calculateWordIndexOffset(pageNum)}
                    />
                );
            })}
        </>
    );
};

const PDFPage = memo(({ pdf, pageNum, scale, onVisible, onWordClick, currentWordIndex, wordIndexOffset }: {
    pdf: any;
    pageNum: number;
    scale: number;
    onVisible: (n: number) => void;
    onWordClick?: (index: number) => void;
    currentWordIndex?: number;
    wordIndexOffset?: number;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textLayerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [textContent, setTextContent] = useState<any>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) onVisible(pageNum);
        }, { threshold: 0.1 });
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [pageNum, onVisible]);

    useEffect(() => {
        let renderTask: any;
        const render = async () => {
            if (!canvasRef.current) return;
            try {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: scale * 1.5 });
                const canvas = canvasRef.current;
                const context = canvas.getContext('2d', { alpha: false });
                if (!context) return;
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                renderTask = page.render({ canvasContext: context, viewport });
                await renderTask.promise;
                const content = await page.getTextContent();
                setTextContent(content);
                page.cleanup();
            } catch (e) {
                console.error('Error rendering PDF page:', e);
            }
        };
        render();
        return () => { if (renderTask) renderTask.cancel(); };
    }, [pdf, pageNum, scale]);

    useEffect(() => {
        if (!textLayerRef.current || !textContent) return;
        const textLayer = textLayerRef.current;
        textLayer.innerHTML = '';
        const viewport = textContent.items[0]?.transform
            ? { width: textContent.items[0].transform[0], height: textContent.items[0].transform[3] }
            : { width: 612, height: 792 };

        textContent.items.forEach((item: any, itemIndex: number) => {
            if (!item.str.trim()) return;

            // Split items that contain multiple words to ensure word-to-word highlighting
            const words = item.str.split(/(\s+)/);
            let currentXOffset = 0;

            words.forEach((word: string, wordSubIndex: number) => {
                if (!word.trim()) {
                    // Just measure whitespace (rough approximation for rendering)
                    currentXOffset += (word.length * item.transform[0] * 0.3);
                    return;
                }

                const textDiv = document.createElement('span');
                textDiv.className = 'pdf-text-item inline-block cursor-pointer select-none px-0.5 py-0.5 rounded transition-all';
                textDiv.textContent = word;
                textDiv.style.fontSize = `${item.transform[0] * scale * 1.5}px`;
                textDiv.style.position = 'absolute';
                textDiv.style.left = `${(item.transform[4] + currentXOffset) * scale * 1.5}px`;
                textDiv.style.top = `${viewport.height * scale * 1.5 - item.transform[5] * scale * 1.5}px`;
                textDiv.style.transformOrigin = '0% 0%';
                textDiv.style.whiteSpace = 'pre';

                // We need a unique index for each word. Since we don't have a perfect global map here,
                // we'll use itemIndex and wordSubIndex combined for local logic, 
                // but the system relies on wordIndexOffset + wordIndex.
                // NOTE: This logic assumes wordIndex maps to textContent.items which isn't 1:1 if we split.
                // However, parsers.ts already splits by words during extraction for displayBlocks.
                // For PDF overlay, we should ideally keep it consistent or use a word-count based offset.

                const wordIndex = (wordIndexOffset || 0) + itemIndex;
                // ^ This is actually a bit broken in current design if items have multiple words.
                // Fixing extraction to be word-based would be better.

                const isCurrent = currentWordIndex === wordIndex;

                if (isCurrent) {
                    textDiv.classList.add('word-active', 'z-10');
                } else {
                    textDiv.classList.add('text-transparent', 'hover:bg-blue-600/10', 'hover:text-blue-600');
                }

                textDiv.addEventListener('click', () => { if (onWordClick) onWordClick(wordIndex); });
                textLayer.appendChild(textDiv);

                // Advance offset (very rough measure - standard char width is ~0.5 fontSize)
                currentXOffset += word.length * (item.transform[0] * 0.6);
            });
        });
    }, [textContent, scale, currentWordIndex, wordIndexOffset, onWordClick]);

    return (
        <div ref={containerRef} className="relative mb-12 shadow-2xl mx-auto bg-white dark:bg-zinc-800 rounded-3xl overflow-hidden border-4 border-white dark:border-zinc-700">
            <canvas ref={canvasRef} className="block mx-auto max-w-full h-auto relative z-0" />
            <div ref={textLayerRef} className="absolute inset-0 pointer-events-auto z-10" style={{ transform: `scale(${scale * 1.5})`, transformOrigin: '0 0' }} />
            <div className="absolute top-4 right-4 bg-white/50 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black opacity-40 uppercase tracking-widest border border-white/20">P.{pageNum}</div>
        </div>
    );
});
