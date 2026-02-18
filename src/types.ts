// --- Core Types for ReaderVerse 2 ---

export type TtsProvider = 'system' | 'gemini' | 'kanitts';
export type ScrollMode = 'follow' | 'snap' | 'manual';
export type ScrollSpeed = 'slow' | 'medium' | 'fast';

export interface ChapterEntry {
    title: string;
    startIndex: number;
    pageNumber?: number;
    wordCount?: number;
}

export interface TextBlock {
    words: string[];
    wordStartIndex: number;
    wordCount: number;
}

export interface UserBookmark {
    id: string;
    index: number;
    label: string;
    timestamp: number;
}

export interface Book {
    id: string;
    title: string;
    author: string;
    displayBlocks: TextBlock[];
    chapters: ChapterEntry[];
    bookmarks: UserBookmark[];
    type: 'epub' | 'pdf' | 'txt' | 'docx' | 'mobi' | 'demo';
    fileData?: ArrayBuffer;
    lastIndex?: number;
    lastScrollPosition?: number;
    lastTtsSpeed?: number;
    lastVoiceURI?: string;
    lastScrollMode?: ScrollMode;
    language?: string;
}
