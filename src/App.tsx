import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { BookOpen, List, Settings, Bookmark, Loader2 } from 'lucide-react';
import { Book, ScrollMode, ScrollSpeed } from './types';
import { getBooks, saveBookToDB, removeBookFromDB } from './persistence';
import { extractEpub, extractPdf, extractDocx, extractText, findBlockIdx } from './parsers';
import { useTTS } from './ttsEngine';
import { useAutoScroll } from './useAutoScroll';
import { WordBlock } from './components/WordBlock';
import { FloatingControls } from './components/FloatingControls';
import { SettingsPanel } from './components/SettingsPanel';
import { Sidebar } from './components/Sidebar';
import { Library } from './components/Library';
import { ResumeDialog } from './components/ResumeDialog';

const App = () => {
    // --- Core State ---
    const [books, setBooks] = useState<Book[]>([]);
    const [activeBook, setActiveBook] = useState<Book | null>(null);
    const [view, setView] = useState<'library' | 'reader'>('library');
    // PDF always uses reflow mode for proper word-level TTS highlighting
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState("");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // --- UI State ---
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isPanelExpanded, setIsPanelExpanded] = useState(false);
    const [showResumeDialog, setShowResumeDialog] = useState(false);
    const [pendingResumeBook, setPendingResumeBook] = useState<Book | null>(null);

    // --- Settings State ---
    const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('reader_font_size') || '20'));

    const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>(() => (localStorage.getItem('reader_theme') as any) || 'light');
    const [scrollMode, setScrollMode] = useState<ScrollMode>(() => (localStorage.getItem('reader_scrollmode') as ScrollMode) || 'follow');
    const [scrollSpeed, setScrollSpeed] = useState<ScrollSpeed>(() => (localStorage.getItem('reader_scrollspeed') as ScrollSpeed) || 'medium');

    // --- Refs ---
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const activeWordRef = useRef<HTMLSpanElement | null>(null);

    // --- Persistence ---
    useEffect(() => localStorage.setItem('reader_font_size', fontSize.toString()), [fontSize]);
    useEffect(() => localStorage.setItem('reader_theme', theme), [theme]);
    useEffect(() => localStorage.setItem('reader_scrollmode', scrollMode), [scrollMode]);
    useEffect(() => localStorage.setItem('reader_scrollspeed', scrollSpeed), [scrollSpeed]);

    // --- TTS Hook ---
    const tts = useTTS(activeBook, scrollMode);

    // --- Auto-Scroll Hook ---
    useAutoScroll(
        scrollContainerRef, activeWordRef,
        scrollMode, scrollSpeed,
        tts.isPlaying,
        view === 'reader',
        tts.currentWordIndex
    );

    // --- Load Books ---
    useEffect(() => { getBooks().then(setBooks); }, []);

    // --- Theme Class ---
    const activeTheme = { light: "bg-zinc-50 text-zinc-900", dark: "bg-zinc-950 text-zinc-100", sepia: "bg-[#fdf8ed] text-[#4d3a2b]" }[theme];

    // --- Windowed Rendering ---
    const visibleBlocks = useMemo(() => {
        if (!activeBook) return [];
        const idx = findBlockIdx(tts.currentWordIndex, activeBook.displayBlocks);
        return activeBook.displayBlocks.slice(Math.max(0, idx - 15), Math.min(activeBook.displayBlocks.length, idx + 25));
    }, [activeBook, tts.currentWordIndex]);

    // --- Book Management ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        setIsLoading(true); setLoadingStatus("Processing file...");
        try {
            const buffer = await file.arrayBuffer();
            const ext = file.name.split('.').pop()?.toLowerCase();
            let res;
            if (ext === 'epub') res = await extractEpub(buffer, setLoadingStatus);
            else if (ext === 'pdf') res = await extractPdf(buffer, setLoadingStatus);
            else if (ext === 'docx') res = await extractDocx(buffer, setLoadingStatus);
            else {
                const txt = await file.text();
                res = extractText(txt, file.name);
            }
            const b: Book = {
                id: crypto.randomUUID(),
                title: res.metadata?.title || file.name,
                author: res.metadata?.creator || 'Unknown',
                displayBlocks: res.displayBlocks,
                chapters: res.chapters,
                bookmarks: [],
                type: (ext as any) || 'txt',
                fileData: ext === 'pdf' ? buffer : undefined,
                lastIndex: 0
            };
            await saveBookToDB(b);
            setBooks(p => [...p, b]); setActiveBook(b); tts.jumpTo(0); setView('reader');
            // All formats use reflow mode for consistent word-level TTS highlighting
        } catch (error) {
            setErrorMsg(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const doOpenBook = async (b: Book, startIndex: number) => {
        // Calculate total words to avoid race condition in TTS hook
        const lastBlock = b.displayBlocks[b.displayBlocks.length - 1];
        const totalWords = lastBlock ? lastBlock.wordStartIndex + lastBlock.wordCount : 0;

        setActiveBook(b);
        tts.jumpTo(startIndex, totalWords); // Pass totalWords explicitly
        setView('reader');

        if (b.lastTtsSpeed) tts.setPlaybackSpeed(b.lastTtsSpeed);
        if (b.lastVoiceURI) tts.setSelectedVoiceURI(b.lastVoiceURI);
        if (b.lastScrollMode) setScrollMode(b.lastScrollMode);
    };

    const openBook = (b: Book) => {
        if (b.lastIndex && b.lastIndex > 0) {
            setPendingResumeBook(b);
            setShowResumeDialog(true);
        } else {
            doOpenBook(b, 0);
        }
    };

    const deleteBook = (id: string) => {
        removeBookFromDB(id);
        setBooks(p => p.filter(x => x.id !== id));
    };

    const goToLibrary = () => {
        tts.saveProgressImmediate();
        tts.releaseWakeLock();
        if (tts.isPlaying) tts.togglePlayback();
        setView('library');
    };

    // --- Bookmarks ---
    const addBookmark = useCallback(() => {
        if (!activeBook) return;
        const idx = tts.wordIdxRef.current;
        const bIdx = findBlockIdx(idx, activeBook.displayBlocks);
        const block = activeBook.displayBlocks[bIdx];
        const offset = Math.max(0, idx - block.wordStartIndex);
        const snippet = block.words.slice(offset, offset + 10).join(" ") + "...";

        const newBookmark = {
            id: crypto.randomUUID(),
            index: idx,
            label: snippet,
            timestamp: Date.now()
        };

        const updatedBook = { ...activeBook, bookmarks: [...(activeBook.bookmarks || []), newBookmark] };
        setActiveBook(updatedBook);
        saveBookToDB(updatedBook);
        setBooks(prev => prev.map(b => b.id === activeBook.id ? updatedBook : b));
    }, [activeBook, tts.wordIdxRef]);

    const deleteBookmark = useCallback((id: string) => {
        if (!activeBook) return;
        const updatedBook = { ...activeBook, bookmarks: activeBook.bookmarks.filter(bm => bm.id !== id) };
        setActiveBook(updatedBook);
        saveBookToDB(updatedBook);
        setBooks(prev => prev.map(b => b.id === activeBook.id ? updatedBook : b));
    }, [activeBook]);

    return (
        <div className={`fixed inset-0 flex flex-col transition-all duration-700 overflow-hidden select-none touch-none ${activeTheme}`}>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="fixed inset-0 z-[200] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center animate-fade-in">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mb-8 animate-pulse-glow">
                        <BookOpen size={36} className="text-white" />
                    </div>
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-6" />
                    <h2 className="text-sm font-black uppercase tracking-widest opacity-40">{loadingStatus}</h2>
                </div>
            )}

            {/* Error Dialog */}
            {errorMsg && (
                <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-8">
                    <div className="bg-white dark:bg-zinc-900 rounded-[3rem] p-10 shadow-2xl text-center animate-fade-in">
                        <p className="text-sm font-bold opacity-60 mb-6">{errorMsg}</p>
                        <button onClick={() => setErrorMsg(null)} className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase">Dismiss</button>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="h-20 flex items-center justify-between px-8 z-50 glass">
                <div className="flex items-center gap-6">
                    <button onClick={goToLibrary}
                        className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl active:scale-90 transition-all hover:scale-105">
                        <BookOpen size={24} />
                    </button>
                    <div className="overflow-hidden">
                        <h1 className="text-[12px] font-black opacity-30 uppercase truncate max-w-[120px] tracking-widest">
                            {view === 'reader' && activeBook ? activeBook.title : 'ReaderVerse 2'}
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {view === 'reader' && (
                        <>
                            <button onClick={() => setIsSidebarOpen(true)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-500/5 hover:bg-zinc-500/10 transition-all"><List size={22} /></button>
                            <button onClick={addBookmark} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-500/5 hover:bg-zinc-500/10 transition-all text-blue-600"><Bookmark size={22} fill="currentColor" /></button>
                            <button onClick={() => setIsSettingsOpen(true)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-zinc-500/5 hover:bg-zinc-500/10 transition-all"><Settings size={22} /></button>
                        </>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative">
                {view === 'library' ? (
                    <Library books={books} onOpenBook={openBook} onDeleteBook={deleteBook} onImport={handleFileUpload} />
                ) : (
                    <div className="h-full flex flex-col">
                        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-8 py-24 no-scrollbar scroll-smooth">
                            <article className="max-w-2xl mx-auto space-y-16 pb-[450px]">
                                {visibleBlocks.map(b => (
                                    <WordBlock key={b.wordStartIndex} block={b} currentWordIndex={tts.currentWordIndex}
                                        onWordClick={tts.jumpTo} fontSize={fontSize} activeWordRef={activeWordRef} />
                                ))}
                            </article>
                        </div>

                        {/* Floating Controls */}
                        <FloatingControls
                            isPlaying={tts.isPlaying}
                            isPanelExpanded={isPanelExpanded}
                            setIsPanelExpanded={setIsPanelExpanded}
                            currentWordIndex={tts.currentWordIndex}
                            totalWordsCount={tts.totalWordsCount}
                            playbackSpeed={tts.playbackSpeed}
                            setPlaybackSpeed={tts.setPlaybackSpeed}
                            scrollMode={scrollMode}
                            setScrollMode={setScrollMode}
                            scrollSpeed={scrollSpeed}
                            setScrollSpeed={setScrollSpeed}
                            togglePlayback={tts.togglePlayback}
                            jumpTo={tts.jumpTo}
                            skipSentence={tts.skipSentence}
                            skipParagraph={tts.skipParagraph}
                            addBookmark={addBookmark}
                            sleepTimerMinutes={tts.sleepTimerMinutes}
                            sleepTimerEnd={tts.sleepTimerEnd}
                            sleepTimerRemaining={tts.sleepTimerRemaining}
                            setSleepTimer={tts.setSleepTimer}
                            activeBook={activeBook}
                            currentChapter={tts.currentChapter}
                            wordIdxRef={tts.wordIdxRef}
                            openSettings={() => setIsSettingsOpen(true)}
                        />
                    </div>
                )}
            </main>

            {/* Resume Dialog */}
            <ResumeDialog
                isOpen={showResumeDialog}
                book={pendingResumeBook}
                onResume={() => { if (pendingResumeBook) doOpenBook(pendingResumeBook, pendingResumeBook.lastIndex || 0); setShowResumeDialog(false); setPendingResumeBook(null); }}
                onStartOver={() => { if (pendingResumeBook) doOpenBook(pendingResumeBook, 0); setShowResumeDialog(false); setPendingResumeBook(null); }}
                onClose={() => { setShowResumeDialog(false); setPendingResumeBook(null); }}
            />

            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                activeBook={activeBook}
                currentChapter={tts.currentChapter}
                jumpTo={tts.jumpTo}
                deleteBookmark={deleteBookmark}
            />

            {/* Settings Panel */}
            <SettingsPanel
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                ttsProvider={tts.ttsProvider}
                setTtsProvider={tts.setTtsProvider}
                availableVoices={tts.availableVoices}
                selectedVoiceURI={tts.selectedVoiceURI}
                setSelectedVoiceURI={tts.setSelectedVoiceURI}
                fontSize={fontSize}
                setFontSize={setFontSize}
                theme={theme}
                setTheme={setTheme}
                playbackSpeed={tts.playbackSpeed}
                setPlaybackSpeed={tts.setPlaybackSpeed}
                scrollMode={scrollMode}
                setScrollMode={setScrollMode}
                scrollSpeed={scrollSpeed}
                setScrollSpeed={setScrollSpeed}
            />
        </div>
    );
};

export default App;
