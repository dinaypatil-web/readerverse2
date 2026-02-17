import React, { useEffect, useRef, memo } from 'react';
import {
    Play, Pause, SkipForward, SkipBack, Bookmark,
    ChevronUp, ChevronDown, Eye, Crosshair, Hand, Clock
} from 'lucide-react';
import { ScrollMode, ScrollSpeed, ChapterEntry, Book } from '../types';

interface FloatingControlsProps {
    isPlaying: boolean;
    isPanelExpanded: boolean;
    setIsPanelExpanded: (v: boolean) => void;
    currentWordIndex: number;
    totalWordsCount: number;
    playbackSpeed: number;
    setPlaybackSpeed: (v: number) => void;
    scrollMode: ScrollMode;
    setScrollMode: (v: ScrollMode) => void;
    scrollSpeed: ScrollSpeed;
    setScrollSpeed: (v: ScrollSpeed) => void;
    togglePlayback: () => void;
    jumpTo: (idx: number, limitWords?: number) => void;
    skipSentence: (d: 1 | -1) => void;
    skipParagraph: (d: 1 | -1) => void;
    addBookmark: () => void;
    sleepTimerMinutes: number | null;
    sleepTimerEnd: number | null;
    sleepTimerRemaining: string;
    setSleepTimer: (m: number | null) => void;
    activeBook: Book | null;
    currentChapter: ChapterEntry | null;
    wordIdxRef: React.RefObject<number>;
    openSettings: () => void;
}

export const FloatingControls: React.FC<FloatingControlsProps> = memo(({
    isPlaying, isPanelExpanded, setIsPanelExpanded,
    currentWordIndex, totalWordsCount,
    playbackSpeed, setPlaybackSpeed,
    scrollMode, setScrollMode, scrollSpeed, setScrollSpeed,
    togglePlayback, jumpTo, skipSentence, skipParagraph,
    addBookmark,
    sleepTimerMinutes, sleepTimerEnd, sleepTimerRemaining, setSleepTimer,
    activeBook, currentChapter, wordIdxRef, openSettings
}) => {
    const progressBarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleWordUpdate = (e: Event) => {
            if (!progressBarRef.current || totalWordsCount <= 0) return;
            const index = (e as CustomEvent).detail.index;
            const percentage = (index / totalWordsCount) * 100;
            progressBarRef.current.style.width = `${percentage}%`;
        };
        window.addEventListener('word-index-update', handleWordUpdate);
        return () => window.removeEventListener('word-index-update', handleWordUpdate);
    }, [totalWordsCount]);

    return (
        <div className="absolute bottom-10 left-0 right-0 px-4 z-50 pointer-events-none flex justify-center">
            <div className={`w-full max-w-lg glass pointer-events-auto ${isPanelExpanded ? 'rounded-[2rem]' : 'rounded-full'} border border-white/20 dark:border-white/5 shadow-[0_25px_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col transition-all duration-300`}>
                {/* Progress Bar */}
                <div className="w-full h-[3px] bg-zinc-500/10 flex">
                    <div ref={progressBarRef} className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
                        style={{ width: `${(currentWordIndex / Math.max(1, totalWordsCount)) * 100}%` }} />
                </div>

                {/* Expanded Panel */}
                {isPanelExpanded && (
                    <div className="px-5 pt-4 pb-3 border-b border-zinc-500/5 space-y-4 animate-fade-in">
                        {/* Progress */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Progress</span>
                                <span className="text-[11px] font-bold text-blue-600">
                                    {currentWordIndex.toLocaleString()} / {totalWordsCount.toLocaleString()}
                                    <span className="opacity-40 ml-1">({((currentWordIndex / Math.max(1, totalWordsCount)) * 100).toFixed(1)}%)</span>
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    placeholder="Go to word..."
                                    min="0"
                                    max={totalWordsCount}
                                    className="flex-1 bg-zinc-500/5 rounded-xl px-4 py-2 text-[11px] font-bold outline-none border border-white/5 focus:border-blue-600/30 transition-all"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = parseInt((e.target as HTMLInputElement).value);
                                            if (!isNaN(val)) jumpTo(val);
                                            (e.target as HTMLInputElement).value = '';
                                        }
                                    }}
                                />
                                <button
                                    onClick={(e) => {
                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                        const val = parseInt(input.value);
                                        if (!isNaN(val)) jumpTo(val);
                                        input.value = '';
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all"
                                >
                                    Go
                                </button>
                            </div>
                        </div>

                        {/* Speed Slider */}
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Speed</span>
                                <span className="text-[11px] font-bold text-blue-600">{playbackSpeed}x</span>
                            </div>
                            <input type="range" min="0.5" max="3.0" step="0.1" value={playbackSpeed}
                                onChange={ev => setPlaybackSpeed(parseFloat(ev.target.value))}
                                className="w-full h-1 rounded-full appearance-none accent-blue-600 bg-zinc-500/10" />
                        </div>

                        {/* Scroll Mode */}
                        <div className="space-y-1">
                            <span className="text-[10px] font-black opacity-30 uppercase tracking-widest block">Scroll</span>
                            <div className="grid grid-cols-3 gap-2">
                                {([['follow', 'Follow', Eye], ['snap', 'Snap', Crosshair], ['manual', 'Manual', Hand]] as const).map(([mode, label, Icon]) => (
                                    <button key={mode} onClick={() => setScrollMode(mode as ScrollMode)}
                                        className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${scrollMode === mode ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-500/5 opacity-40 hover:opacity-70'}`}>
                                        <Icon size={11} /> {label}
                                    </button>
                                ))}
                            </div>
                            {scrollMode !== 'manual' && (
                                <div className="grid grid-cols-3 gap-2 mt-1">
                                    {(['slow', 'medium', 'fast'] as const).map(s => (
                                        <button key={s} onClick={() => setScrollSpeed(s)}
                                            className={`py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${scrollSpeed === s ? 'bg-blue-600/20 text-blue-600' : 'bg-zinc-500/5 opacity-30'}`}>{s}</button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Skip Controls */}
                        <div className="space-y-1">
                            <span className="text-[10px] font-black opacity-30 uppercase tracking-widest block">Skip</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => skipSentence(-1)} className="py-2 rounded-xl bg-zinc-500/5 text-[10px] font-bold opacity-60 hover:opacity-100 active:scale-95 transition-all">← Sentence</button>
                                <button onClick={() => skipSentence(1)} className="py-2 rounded-xl bg-zinc-500/5 text-[10px] font-bold opacity-60 hover:opacity-100 active:scale-95 transition-all">Sentence →</button>
                                <button onClick={() => skipParagraph(-1)} className="py-2 rounded-xl bg-zinc-500/5 text-[10px] font-bold opacity-60 hover:opacity-100 active:scale-95 transition-all">← Paragraph</button>
                                <button onClick={() => skipParagraph(1)} className="py-2 rounded-xl bg-zinc-500/5 text-[10px] font-bold opacity-60 hover:opacity-100 active:scale-95 transition-all">Paragraph →</button>
                            </div>
                        </div>

                        {/* Sleep Timer */}
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Sleep Timer</span>
                                {sleepTimerEnd && <span className="text-[10px] font-bold text-orange-500">{sleepTimerRemaining}</span>}
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                                {[{ label: 'Off', value: null as number | null }, { label: '5m', value: 5 }, { label: '10m', value: 10 }, { label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '1h', value: 60 }].map(opt => (
                                    <button key={opt.label}
                                        onClick={() => setSleepTimer(opt.value)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${(opt.value === null && !sleepTimerEnd) || sleepTimerMinutes === opt.value ? 'bg-orange-500 text-white shadow-lg' : 'bg-zinc-500/5 opacity-40 hover:opacity-70'}`}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chapter Selector */}
                        {activeBook && activeBook.chapters.length > 0 && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest block">Chapter</span>
                                <select value={currentChapter?.startIndex || 0} onChange={ev => jumpTo(parseInt(ev.target.value))}
                                    className="w-full py-2 px-3 rounded-xl bg-zinc-500/5 text-[11px] font-bold outline-none appearance-none dark:text-white truncate">
                                    {activeBook.chapters.map((c, i) => (<option key={i} value={c.startIndex}>{c.title}</option>))}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {/* Compact Controls */}
                <div className="px-3 py-2.5 flex items-center justify-between gap-1">
                    <button onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                        className="h-10 px-3 rounded-full bg-zinc-500/5 flex items-center justify-center active:scale-95 transition-all">
                        {isPanelExpanded ? <ChevronDown size={16} className="opacity-40" /> : <ChevronUp size={16} className="opacity-40" />}
                    </button>

                    <button onClick={openSettings}
                        className="h-10 px-4 rounded-full bg-zinc-500/5 flex items-center justify-center active:scale-95 transition-all group">
                        <span className="text-[10px] font-black text-blue-600/60 group-hover:text-blue-600">{playbackSpeed}x</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                        <button onClick={() => skipSentence(-1)}
                            className="w-10 h-10 flex items-center justify-center rounded-full opacity-40 hover:opacity-100 active:scale-90 transition-all">
                            <SkipBack size={20} fill="currentColor" />
                        </button>
                        <button onClick={togglePlayback}
                            className={`w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all hover:bg-blue-500 ${isPlaying ? 'animate-pulse-glow' : ''}`}>
                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
                        </button>
                        <button onClick={() => skipSentence(1)}
                            className="w-10 h-10 flex items-center justify-center rounded-full opacity-40 hover:opacity-100 active:scale-90 transition-all">
                            <SkipForward size={20} fill="currentColor" />
                        </button>
                    </div>

                    <button onClick={addBookmark}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-500/5 text-blue-600 active:scale-95 transition-all">
                        <Bookmark size={20} fill="currentColor" />
                    </button>
                </div>
            </div>
        </div>
    );
});
