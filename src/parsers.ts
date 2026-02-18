import { TextBlock, ChapterEntry } from './types';
import { safeCloneArrayBuffer } from './persistence';
import e from 'epubjs';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
} catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.mjs`;
}

// --- DOM Walker ---
function walkNodes(node: Node, results: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
        const val = node.textContent?.trim();
        if (val) results.push(val);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as Element).tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'SVG', 'NOSCRIPT'].includes(tag)) return;
        for (let i = 0; i < node.childNodes.length; i++) walkNodes(node.childNodes[i], results);
        if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BR', 'TR', 'BLOCKQUOTE'].includes(tag)) {
            results.push(" [[PARA_BREAK]] ");
        }
    }
}

function buildBlocks(contentStr: string, startOffset: number = 0): { blocks: TextBlock[]; totalWords: number } {
    const splitParas = contentStr.split('[[PARA_BREAK]]');
    const blocks: TextBlock[] = [];
    let count = 0;
    for (const p of splitParas) {
        const words = p.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length > 0) {
            blocks.push({ words, wordStartIndex: startOffset + count, wordCount: words.length });
            count += words.length;
        }
    }
    return { blocks, totalWords: count };
}

// --- Language Detection Helper ---
export function detectLanguage(text: string, metadataLang?: string): string {
    if (metadataLang && metadataLang.length >= 2) return metadataLang.split('-')[0].split('_')[0].toLowerCase();

    // Sample text for script detection
    const sample = text.slice(0, 2000);
    const scripts = [
        { name: 'hi', range: /[\u0900-\u097F]/ }, // Devanagari (Hindi, Marathi, etc.)
        { name: 'bn', range: /[\u0980-\u09FF]/ }, // Bengali
        { name: 'ta', range: /[\u0B80-\u0BFF]/ }, // Tamil
        { name: 'te', range: /[\u0C00-\u0C7F]/ }, // Telugu
        { name: 'kn', range: /[\u0C80-\u0CFF]/ }, // Kannada
        { name: 'ml', range: /[\u0D00-\u0D7F]/ }, // Malayalam
        { name: 'gu', range: /[\u0A80-\u0AFF]/ }, // Gujarati
        { name: 'pa', range: /[\u0A00-\u0A7F]/ }, // Gurmukhi (Punjabi)
    ];

    for (const s of scripts) {
        if (s.range.test(sample)) return s.name;
    }

    return 'en';
}

// --- EPUB Parser ---
export async function extractEpub(buffer: ArrayBuffer, onStatus: (s: string) => void): Promise<{ displayBlocks: TextBlock[]; chapters: ChapterEntry[]; metadata: any; language: string }> {
    const book = e(buffer);
    onStatus("Reading EPUB...");
    await book.opened;
    const metadata = await (book as any).loaded.metadata;
    const navigation = await (book as any).loaded.navigation;
    const toc = navigation?.toc || [];

    // Flatten nested TOC with depth tracking
    const flatToc: { label: string; href: string; level: number }[] = [];
    const flattenToc = (items: any[], level: number) => {
        for (const item of items) {
            if (item.label?.trim()) {
                flatToc.push({ label: item.label.trim(), href: item.href || '', level });
            }
            if (item.subitems?.length) flattenToc(item.subitems, level + 1);
        }
    };
    flattenToc(toc, 0);

    const getCanonical = (p: string) => p?.split('#')[0].replace(/(\.\.\/|\.\/)/g, '').replace(/^\/+/, '').toLowerCase() || '';
    const chapters: ChapterEntry[] = [];
    const displayBlocks: TextBlock[] = [];
    let totalWordCount = 0;

    const spine = (book as any).spine;
    const spineItems: any[] = [];
    spine.each((item: any) => spineItems.push(item));

    for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i];
        try {
            const url = item.url || item.href;
            const rawHtml = await book.archive.getText(url);
            if (!rawHtml) continue;
            const doc = new DOMParser().parseFromString(rawHtml, "text/html");
            const itemHref = getCanonical(item.href || '');

            // Match TOC entries to this spine item
            let matched = false;
            for (const tocEntry of flatToc) {
                const tHref = getCanonical(tocEntry.href);
                if (itemHref === tHref || itemHref.endsWith(tHref) || tHref.endsWith(itemHref) ||
                    itemHref.includes(tHref) || tHref.includes(itemHref)) {
                    const prefix = tocEntry.level > 0 ? '  '.repeat(tocEntry.level) : '';
                    chapters.push({ title: `${prefix}${tocEntry.label}`, startIndex: totalWordCount });
                    matched = true;
                }
            }

            // Fallback: detect headings inside the document for un-matched spine items
            if (!matched) {
                const headings = doc.querySelectorAll('h1, h2, h3');
                if (headings.length > 0) {
                    const hText = headings[0].textContent?.trim();
                    if (hText && hText.length > 1 && hText.length < 200) {
                        chapters.push({ title: hText, startIndex: totalWordCount });
                    }
                }
            }

            const parts: string[] = [];
            walkNodes(doc.body || doc.documentElement, parts);
            const contentStr = parts.join(" ").replace(/\s+/g, ' ');
            const { blocks, totalWords } = buildBlocks(contentStr, totalWordCount);
            displayBlocks.push(...blocks);
            totalWordCount += totalWords;
        } catch (e) {
            console.error("Spine error", e);
        }
        if (i % 5 === 0) onStatus(`Processing... ${Math.round((i / spineItems.length) * 100)}%`);
    }

    // Sort, deduplicate by startIndex
    const sorted = chapters.sort((a, b) => a.startIndex - b.startIndex);
    const deduped = sorted.filter((c, i, arr) => i === 0 || c.startIndex !== arr[i - 1].startIndex);

    // Initial detection from metadata, fallback to text scan
    const sampleText = displayBlocks.slice(0, 5).map(b => b.words.join(' ')).join(' ');
    const language = detectLanguage(sampleText, metadata?.language);

    return { displayBlocks, chapters: deduped, metadata, language };
}

// --- PDF Parser (Batch-Concurrent) ---
export async function extractPdf(buffer: ArrayBuffer, onStatus: (s: string) => void): Promise<{ displayBlocks: TextBlock[]; chapters: ChapterEntry[]; metadata: any; language: string }> {
    onStatus("Loading PDF...");
    const bufferCopy = safeCloneArrayBuffer(buffer);
    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: bufferCopy, useSystemFonts: true }).promise;
    } catch (e) {
        throw new Error(`Failed to load PDF: ${(e as Error)?.message || 'Unknown error'}`);
    }

    if (pdf.numPages === 0) throw new Error('PDF contains no pages');

    const BATCH_SIZE = 5;
    const pageTexts: string[] = new Array(pdf.numPages).fill('');

    // Process pages in concurrent batches for speed
    type RawLine = { y: number; text: string };
    const pageLines: RawLine[][] = new Array(pdf.numPages).fill([]);

    for (let batchStart = 0; batchStart < pdf.numPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, pdf.numPages);
        const batchPromises: Promise<void>[] = [];

        for (let i = batchStart; i < batchEnd; i++) {
            batchPromises.push(
                (async () => {
                    const pageNum = i + 1;
                    try {
                        const page = await pdf.getPage(pageNum);
                        const content = await page.getTextContent();

                        // Sort items by Y descending (top to bottom), then X ascending
                        const items = content.items.map((it: any) => ({
                            str: it.str,
                            y: it.transform[5],
                            x: it.transform[4]
                        }));

                        items.sort((a, b) => b.y - a.y || a.x - b.x);

                        const lines: RawLine[] = [];
                        let currentY = -1;
                        let currentText = "";

                        for (const item of items) {
                            if (Math.abs(item.y - currentY) < 3) {
                                // Same line (approx)
                                currentText += (currentText.endsWith(' ') ? '' : ' ') + item.str;
                            } else {
                                if (currentText.trim()) lines.push({ y: currentY, text: currentText.trim() });
                                currentY = item.y;
                                currentText = item.str;
                            }
                        }
                        if (currentText.trim()) lines.push({ y: currentY, text: currentText.trim() });

                        pageLines[i] = lines;
                        page.cleanup();
                    } catch {
                        pageLines[i] = [];
                    }
                })()
            );
        }
        await Promise.all(batchPromises);
        onStatus(`Parsing PDF... ${Math.round((batchEnd / pdf.numPages) * 100)}%`);
    }

    // Build display blocks with paragraph splitting (Y-gap detection)
    const displayBlocks: TextBlock[] = [];
    const pageWordStart: number[] = new Array(pdf.numPages).fill(-1);
    let totalWords = 0;

    for (let i = 0; i < pageLines.length; i++) {
        const lines = pageLines[i];
        if (lines.length === 0) continue;

        pageWordStart[i] = totalWords;

        let currentParagraph: string[] = [];
        let lastY = -1;

        for (const line of lines) {
            // If there's a significant Y gap (more than ~1.5x line height), split block
            const gap = lastY === -1 ? 0 : Math.abs(line.y - lastY);

            // Heuristic: line height is usually 10-15px. 20px+ gap is a paragraph break.
            if (gap > 20 && currentParagraph.length > 0) {
                const pText = currentParagraph.join(' ').replace(/\s+/g, ' ').trim();
                const words = pText.split(/\s+/).filter(w => w.length > 0);
                if (words.length > 0) {
                    displayBlocks.push({ words, wordStartIndex: totalWords, wordCount: words.length });
                    totalWords += words.length;
                }
                currentParagraph = [];
            }

            currentParagraph.push(line.text);
            lastY = line.y;
        }

        if (currentParagraph.length > 0) {
            const pText = currentParagraph.join(' ').replace(/\s+/g, ' ').trim();
            const words = pText.split(/\s+/).filter(w => w.length > 0);
            if (words.length > 0) {
                displayBlocks.push({ words, wordStartIndex: totalWords, wordCount: words.length });
                totalWords += words.length;
            }
        }
    }

    // --- Extract real PDF outline (TOC) ---
    onStatus("Indexing chapters...");
    let chapters: ChapterEntry[] = [];

    try {
        const outline = await pdf.getOutline();
        if (outline && outline.length > 0) {
            // Flatten nested outline items with depth tracking
            const flatItems: { title: string; dest: any; level: number }[] = [];
            const flatten = (items: any[], level: number) => {
                for (const item of items) {
                    if (item.title) flatItems.push({ title: item.title.trim(), dest: item.dest, level });
                    if (item.items && item.items.length > 0) flatten(item.items, level + 1);
                }
            };
            flatten(outline, 0);

            // Resolve each outline entry to a page number → word index
            for (const entry of flatItems) {
                try {
                    let pageIndex = -1;

                    if (entry.dest) {
                        if (typeof entry.dest === 'string') {
                            // Named destination → resolve to explicit dest
                            const resolved = await pdf.getDestination(entry.dest);
                            if (resolved && resolved[0]) {
                                pageIndex = await pdf.getPageIndex(resolved[0]);
                            }
                        } else if (Array.isArray(entry.dest) && entry.dest[0]) {
                            // Explicit destination array [pageRef, ...]
                            pageIndex = await pdf.getPageIndex(entry.dest[0]);
                        }
                    }

                    if (pageIndex >= 0 && pageIndex < pdf.numPages) {
                        // Find the word start for this page (or nearest page with text)
                        let wordStart = pageWordStart[pageIndex];
                        if (wordStart < 0) {
                            // Page had no text, find nearest following page with text
                            for (let p = pageIndex + 1; p < pdf.numPages; p++) {
                                if (pageWordStart[p] >= 0) { wordStart = pageWordStart[p]; break; }
                            }
                        }
                        if (wordStart >= 0) {
                            const prefix = entry.level > 0 ? '  '.repeat(entry.level) : '';
                            chapters.push({
                                title: `${prefix}${entry.title}`,
                                startIndex: wordStart,
                                pageNumber: pageIndex + 1,
                            });
                        }
                    }
                } catch {
                    // Skip entries that can't be resolved
                }
            }
        }
    } catch {
        // Outline extraction failed, will use fallback
    }

    // Fallback: if no real outline found, create chapters from semantic patterns or pages
    if (chapters.length === 0) {
        onStatus("Scanning for chapters...");
        for (const block of displayBlocks) {
            const firstLine = block.words.slice(0, 10).join(' ');
            // Regex for common chapter patterns: Chapter 1, PART II, Book One, etc.
            const chapterMatch = firstLine.match(/^(chapter|part|book|section)\s+([0-9ivxlcdm]+|[one|two|three|four|five|six|seven|eight|nine|ten]+)/i);
            if (chapterMatch) {
                // Determine page number from word index
                let pNum = 1;
                for (let p = 0; p < pageWordStart.length; p++) {
                    if (pageWordStart[p] >= 0 && pageWordStart[p] <= block.wordStartIndex) {
                        pNum = p + 1;
                    } else if (pageWordStart[p] > block.wordStartIndex) {
                        break;
                    }
                }
                chapters.push({
                    title: block.words.slice(0, 5).join(' '),
                    startIndex: block.wordStartIndex,
                    pageNumber: pNum
                });
            }
        }

        // If still no chapters, fall back to page-based
        if (chapters.length === 0) {
            for (let i = 0; i < pdf.numPages; i++) {
                if (pageWordStart[i] >= 0) {
                    chapters.push({ title: `Page ${i + 1}`, startIndex: pageWordStart[i], pageNumber: i + 1 });
                }
            }
        }
    }

    // Sort chapters by position and deduplicate
    chapters.sort((a, b) => a.startIndex - b.startIndex);
    chapters = chapters.filter((c, i, arr) => i === 0 || c.startIndex !== arr[i - 1].startIndex);

    let metadata: any = {};
    try { metadata = await pdf.getMetadata(); } catch { }

    const sampleText = displayBlocks.slice(0, 3).map(b => b.words.join(' ')).join(' ');
    const language = detectLanguage(sampleText, metadata?.info?.Language);

    return { displayBlocks, chapters, metadata, language };
}

// --- DOCX Parser ---
export async function extractDocx(buffer: ArrayBuffer, onStatus: (s: string) => void): Promise<{ displayBlocks: TextBlock[]; chapters: ChapterEntry[]; metadata: any; language: string }> {
    onStatus("Converting DOCX...");
    const mammoth = (window as any).mammoth;
    if (!mammoth) throw new Error("DOCX support library not loaded. Please refresh and try again.");
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const doc = new DOMParser().parseFromString(result.value, 'text/html');
    const chapters: ChapterEntry[] = [];
    const headings = doc.querySelectorAll('h1, h2, h3');
    const chapterTitles: string[] = [];
    headings.forEach(h => chapterTitles.push(h.textContent?.trim() || ''));
    const parts: string[] = [];
    walkNodes(doc.body || doc.documentElement, parts);
    const contentStr = parts.join(" ").replace(/\s+/g, ' ');
    const splitParas = contentStr.split('[[PARA_BREAK]]');
    const displayBlocks: TextBlock[] = [];
    let totalWordCount = 0;
    let chapterIdx = 0;
    for (const p of splitParas) {
        const words = p.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length > 0) {
            const paraText = words.join(' ');
            if (chapterIdx < chapterTitles.length && chapterTitles[chapterIdx] && paraText.startsWith(chapterTitles[chapterIdx].substring(0, 15))) {
                chapters.push({ title: chapterTitles[chapterIdx], startIndex: totalWordCount });
                chapterIdx++;
            }
            displayBlocks.push({ words, wordStartIndex: totalWordCount, wordCount: words.length });
            totalWordCount += words.length;
        }
    }
    const sampleText = displayBlocks.slice(0, 3).map(b => b.words.join(' ')).join(' ');
    const language = detectLanguage(sampleText);
    return { displayBlocks, chapters: chapters.sort((a, b) => a.startIndex - b.startIndex), metadata: { title: 'Document' }, language };
}

// --- Text Parser ---
export function extractText(text: string, filename: string): { displayBlocks: TextBlock[]; chapters: ChapterEntry[]; metadata: any; language: string } {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const displayBlocks: TextBlock[] = [];
    let totalWords = 0;
    for (const p of paragraphs) {
        const words = p.trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length > 0) {
            displayBlocks.push({ words, wordStartIndex: totalWords, wordCount: words.length });
            totalWords += words.length;
        }
    }
    const language = detectLanguage(text);
    return { displayBlocks, chapters: [], metadata: { title: filename }, language };
}

// --- Utility: Find Block Index by Word Position ---
export function findBlockIdx(wIdx: number, blocks: TextBlock[]): number {
    if (!blocks.length) return 0;
    let l = 0, r = blocks.length - 1;
    while (l <= r) {
        const m = (l + r) >>> 1;
        const b = blocks[m];
        if (wIdx >= b.wordStartIndex && wIdx < (b.wordStartIndex + b.wordCount)) return m;
        if (wIdx < b.wordStartIndex) r = m - 1; else l = m + 1;
    }
    return Math.max(0, Math.min(blocks.length - 1, l));
}

// Re-export pdfjsLib for PDF rendering component
export { pdfjsLib };
