import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Book, TtsProvider, ScrollMode } from './types';
import { updateBookProgress } from './persistence';
import { findBlockIdx } from './parsers';

export function useTTS(activeBook: Book | null, scrollMode: ScrollMode) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(() => parseFloat(localStorage.getItem('reader_speed') || '1.0'));
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => localStorage.getItem('reader_voice') || "");
    const [ttsProvider, setTtsProvider] = useState<TtsProvider>(() => (localStorage.getItem('reader_provider') as any) || 'system');
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
    const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
    const [sleepTimerRemaining, setSleepTimerRemaining] = useState('');

    const isPlayingRef = useRef(false);
    const wordIdxRef = useRef(0);
    const speechSessionIdRef = useRef(0);
    const heartbeatRef = useRef<HTMLAudioElement | null>(null);
    const lastSavedIndexRef = useRef(0);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const sleepTimerIntervalRef = useRef<number | null>(null);
    const chromeBgIntervalRef = useRef<number | null>(null);

    // Persist settings
    useEffect(() => localStorage.setItem('reader_speed', playbackSpeed.toString()), [playbackSpeed]);
    useEffect(() => localStorage.setItem('reader_provider', ttsProvider), [ttsProvider]);
    useEffect(() => { if (selectedVoiceURI) localStorage.setItem('reader_voice', selectedVoiceURI); }, [selectedVoiceURI]);

    const totalWordsCount = useMemo(() => {
        if (!activeBook) return 0;
        const blocks = activeBook.displayBlocks;
        const last = blocks[blocks.length - 1];
        return last ? last.wordStartIndex + last.wordCount : 0;
    }, [activeBook]);

    const currentChapter = useMemo(() => {
        if (!activeBook?.chapters.length) return null;
        for (let i = activeBook.chapters.length - 1; i >= 0; i--) {
            if (activeBook.chapters[i].startIndex <= currentWordIndex) return activeBook.chapters[i];
        }
        return activeBook.chapters[0];
    }, [activeBook, currentWordIndex]);

    // ============================================================
    // BACKGROUND AUDIO HEARTBEAT
    // A looping silent audio keeps the browser tab "alive" in background,
    // preventing the browser from suspending timers/speech synthesis.
    // ============================================================
    useEffect(() => {
        const audio = new Audio();
        // 1-second silent WAV — enough to register as active media playback
        audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
        audio.loop = true;
        audio.volume = 0.01; // near-silent but enough for media session
        audio.preload = "auto";
        heartbeatRef.current = audio;
        return () => { if (heartbeatRef.current) { heartbeatRef.current.pause(); heartbeatRef.current.src = ""; } };
    }, []);

    // ============================================================
    // WAKE LOCK - prevent screen from sleeping during playback
    // ============================================================
    const requestWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                // Re-acquire wake lock if released by visibility change
                wakeLockRef.current.addEventListener('release', () => {
                    if (isPlayingRef.current && document.visibilityState === 'visible') {
                        navigator.wakeLock.request('screen').then(wl => { wakeLockRef.current = wl; }).catch(() => { });
                    }
                });
            }
        } catch { /* silent */ }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            try { await wakeLockRef.current.release(); } catch { }
            wakeLockRef.current = null;
        }
    }, []);

    // ============================================================
    // VOICE LOADING
    // ============================================================
    useEffect(() => {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                const sorted = voices.filter(v => v.lang !== "").sort((a, b) => {
                    const isNatural = (n: string) => n.includes('Natural') || n.includes('Online') || n.includes('Google') || n.includes('Premium');
                    const aN = isNatural(a.name);
                    const bN = isNatural(b.name);
                    if (aN && !bN) return -1;
                    if (!aN && bN) return 1;
                    return a.name.localeCompare(b.name);
                });
                setAvailableVoices(sorted);
                if (!selectedVoiceURI) {
                    const pref = sorted.find(v => v.default) || sorted.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Premium'))) || sorted[0];
                    if (pref) setSelectedVoiceURI(pref.voiceURI);
                }
            }
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        const poll = setInterval(loadVoices, 500);
        return () => { clearInterval(poll); window.speechSynthesis.onvoiceschanged = null; };
    }, [selectedVoiceURI]);

    // ============================================================
    // PROGRESS SAVING - frequent saves for reliable resume
    // ============================================================
    const saveProgressImmediate = useCallback(() => {
        if (activeBook) {
            updateBookProgress(activeBook.id, wordIdxRef.current, {
                lastTtsSpeed: playbackSpeed,
                lastVoiceURI: selectedVoiceURI,
                lastScrollMode: scrollMode,
            });
            lastSavedIndexRef.current = wordIdxRef.current;
        }
    }, [activeBook, playbackSpeed, selectedVoiceURI, scrollMode]);

    // Save every 50 words spoken (more frequent for better resume)
    const saveProgressThrottled = useCallback(() => {
        if (activeBook && Math.abs(wordIdxRef.current - lastSavedIndexRef.current) > 50) {
            saveProgressImmediate();
        }
    }, [activeBook, saveProgressImmediate]);

    // ============================================================
    // BEFOREUNLOAD - save progress when user closes tab/browser
    // ============================================================
    useEffect(() => {
        const handleBeforeUnload = () => { saveProgressImmediate(); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveProgressImmediate]);

    // ============================================================
    // PERIODIC AUTO-SAVE during playback (every 10 seconds)
    // ============================================================
    useEffect(() => {
        if (!isPlaying || !activeBook) return;
        const interval = setInterval(() => {
            if (isPlayingRef.current && activeBook) {
                saveProgressImmediate();
            }
        }, 10_000);
        return () => clearInterval(interval);
    }, [isPlaying, activeBook, saveProgressImmediate]);

    // ============================================================
    // MEDIA SESSION POSITION
    // ============================================================
    const updateMediaSessionPosition = useCallback(() => {
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
                navigator.mediaSession.setPositionState({
                    duration: Math.max(totalWordsCount, 1),
                    playbackRate: playbackSpeed,
                    position: Math.min(wordIdxRef.current, totalWordsCount)
                });
            } catch { /* silent */ }
        }
    }, [totalWordsCount, playbackSpeed]);

    // ============================================================
    // CHROME BACKGROUND SPEECH WORKAROUND
    // Chrome pauses SpeechSynthesis after ~15s in background.
    // Workaround: periodically pause/resume the synthesis to reset the timer.
    // ============================================================
    const startChromeBgWorkaround = useCallback(() => {
        if (chromeBgIntervalRef.current) clearInterval(chromeBgIntervalRef.current);
        chromeBgIntervalRef.current = window.setInterval(() => {
            if (isPlayingRef.current && window.speechSynthesis.speaking) {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
            }
        }, 10_000); // every 10 seconds, reset Chrome's internal timer
    }, []);

    const stopChromeBgWorkaround = useCallback(() => {
        if (chromeBgIntervalRef.current) {
            clearInterval(chromeBgIntervalRef.current);
            chromeBgIntervalRef.current = null;
        }
    }, []);

    // ============================================================
    // CORE SPEAK FUNCTION
    // ============================================================
    const speak = useCallback(async () => {
        if (!activeBook || !isPlayingRef.current) return;
        const sId = speechSessionIdRef.current;
        const bIdx = findBlockIdx(wordIdxRef.current, activeBook.displayBlocks);
        const block = activeBook.displayBlocks[bIdx];
        if (!block) return;
        const offset = Math.max(0, wordIdxRef.current - block.wordStartIndex);
        const text = block.words.slice(offset).join(" ").trim();

        const finish = () => {
            if (sId !== speechSessionIdRef.current) return;
            const next = block.wordStartIndex + block.wordCount;
            if (next < totalWordsCount && isPlayingRef.current) {
                wordIdxRef.current = next;
                setCurrentWordIndex(next);
                saveProgressThrottled();
                setTimeout(() => { if (sId === speechSessionIdRef.current) speak(); }, 15);
            } else {
                setIsPlaying(false); isPlayingRef.current = false;
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                if (heartbeatRef.current) heartbeatRef.current.pause();
                stopChromeBgWorkaround();
                releaseWakeLock();
                saveProgressImmediate();
            }
        };

        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        const v = availableVoices.find(x => x.voiceURI === selectedVoiceURI) || availableVoices.find(v => v.default) || availableVoices[0];
        if (v) utt.voice = v;
        utt.rate = playbackSpeed;
        utt.onboundary = (e) => {
            if (sId !== speechSessionIdRef.current || e.name !== 'word') return;
            const subStr = text.substring(0, e.charIndex).trim();
            const count = subStr ? subStr.split(/\s+/).length : 0;
            const global = block.wordStartIndex + offset + count;
            if (global >= wordIdxRef.current) {
                wordIdxRef.current = global;
                setCurrentWordIndex(global);
                updateMediaSessionPosition();
            }
        };
        utt.onstart = () => {
            if (sId === speechSessionIdRef.current) {
                if (heartbeatRef.current) heartbeatRef.current.play().catch(() => { });
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                requestWakeLock();
                startChromeBgWorkaround();
            }
        };
        utt.onend = () => { if (sId === speechSessionIdRef.current) finish(); };
        utt.onerror = (ev) => {
            // Don't treat 'interrupted' or 'canceled' as real errors — they happen on skip/jump
            if (ev.error === 'interrupted' || ev.error === 'canceled') return;
            if (sId === speechSessionIdRef.current) finish();
        };
        window.speechSynthesis.speak(utt);
    }, [activeBook, availableVoices, selectedVoiceURI, playbackSpeed, totalWordsCount, saveProgressThrottled, updateMediaSessionPosition, requestWakeLock, releaseWakeLock, saveProgressImmediate, startChromeBgWorkaround, stopChromeBgWorkaround]);

    // ============================================================
    // TOGGLE PLAYBACK
    // ============================================================
    const togglePlayback = useCallback(() => {
        if (isPlayingRef.current) {
            setIsPlaying(false); isPlayingRef.current = false;
            window.speechSynthesis.cancel();
            speechSessionIdRef.current++;
            if (heartbeatRef.current) heartbeatRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            stopChromeBgWorkaround();
            saveProgressImmediate();
            releaseWakeLock();
        } else {
            setIsPlaying(true); isPlayingRef.current = true;
            speechSessionIdRef.current++;
            if (heartbeatRef.current) heartbeatRef.current.play().catch(() => { });
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            requestWakeLock();
            startChromeBgWorkaround();
            speak();
        }
    }, [speak, saveProgressImmediate, requestWakeLock, releaseWakeLock, startChromeBgWorkaround, stopChromeBgWorkaround]);

    // ============================================================
    // JUMP TO WORD
    // ============================================================
    const jumpTo = useCallback((idx: number, limitWords?: number) => {
        speechSessionIdRef.current++;
        window.speechSynthesis.cancel();
        const limit = limitWords !== undefined ? limitWords : totalWordsCount;
        const safeIdx = Math.max(0, limit > 0 ? Math.min(idx, limit - 1) : idx);
        wordIdxRef.current = safeIdx;
        setCurrentWordIndex(safeIdx);
        updateMediaSessionPosition();
        if (activeBook) updateBookProgress(activeBook.id, safeIdx);
        if (isPlayingRef.current) setTimeout(speak, 50);
    }, [totalWordsCount, speak, activeBook, updateMediaSessionPosition]);

    // ============================================================
    // SKIP SENTENCE / PARAGRAPH
    // ============================================================
    const skipSentence = useCallback((direction: 1 | -1) => {
        if (!activeBook) return;
        const allWords = activeBook.displayBlocks.flatMap(b => b.words);
        let idx = wordIdxRef.current;
        if (direction === 1) {
            while (idx < allWords.length - 1) { idx++; if (/[.!?]$/.test(allWords[idx - 1] || '')) break; }
        } else {
            idx = Math.max(0, idx - 2);
            while (idx > 0) { idx--; if (/[.!?]$/.test(allWords[idx] || '')) { idx++; break; } }
        }
        jumpTo(Math.max(0, Math.min(idx, totalWordsCount - 1)));
    }, [activeBook, jumpTo, totalWordsCount]);

    const skipParagraph = useCallback((direction: 1 | -1) => {
        if (!activeBook) return;
        const currentBlockIdx = findBlockIdx(wordIdxRef.current, activeBook.displayBlocks);
        const target = activeBook.displayBlocks[Math.max(0, Math.min(currentBlockIdx + direction, activeBook.displayBlocks.length - 1))];
        if (target) jumpTo(target.wordStartIndex);
    }, [activeBook, jumpTo]);

    // ============================================================
    // SLEEP TIMER
    // ============================================================
    useEffect(() => {
        if (sleepTimerEnd === null) {
            if (sleepTimerIntervalRef.current) { clearInterval(sleepTimerIntervalRef.current); sleepTimerIntervalRef.current = null; }
            setSleepTimerRemaining('');
            return;
        }
        sleepTimerIntervalRef.current = window.setInterval(() => {
            const remaining = sleepTimerEnd - Date.now();
            if (remaining <= 0) {
                setSleepTimerEnd(null); setSleepTimerMinutes(null); setSleepTimerRemaining('');
                if (isPlayingRef.current) togglePlayback();
                return;
            }
            const m = Math.floor(remaining / 60000); const s = Math.floor((remaining % 60000) / 1000);
            setSleepTimerRemaining(`${m}:${s.toString().padStart(2, '0')}`);
        }, 1000);
        return () => { if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current); };
    }, [sleepTimerEnd, togglePlayback]);

    const setSleepTimer = useCallback((minutes: number | null) => {
        if (minutes === null) { setSleepTimerEnd(null); setSleepTimerMinutes(null); }
        else { setSleepTimerMinutes(minutes); setSleepTimerEnd(Date.now() + minutes * 60 * 1000); }
    }, []);

    // ============================================================
    // BACKGROUND PLAYBACK - DO NOT PAUSE on visibility change
    // Instead, keep playing and re-acquire wake lock when returning.
    // The heartbeat audio + Chrome workaround keep speech alive.
    // ============================================================
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                // Re-acquire wake lock when tab becomes visible again
                if (isPlayingRef.current) {
                    await requestWakeLock();
                }
            } else if (document.visibilityState === 'hidden') {
                // Save progress when going to background (but do NOT stop playback)
                if (isPlayingRef.current) {
                    saveProgressImmediate();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [requestWakeLock, saveProgressImmediate]);

    // ============================================================
    // MEDIA SESSION CONTROLS (lock screen / notification controls)
    // ============================================================
    useEffect(() => {
        if ('mediaSession' in navigator && activeBook) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: activeBook.title,
                artist: activeBook.author,
                album: currentChapter?.title || 'Manuscript',
                artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3389/3389081.png', sizes: '512x512', type: 'image/png' }]
            });
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            updateMediaSessionPosition();
            navigator.mediaSession.setActionHandler('play', togglePlayback);
            navigator.mediaSession.setActionHandler('pause', togglePlayback);
            navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime !== undefined) jumpTo(Math.floor(d.seekTime)); });
            navigator.mediaSession.setActionHandler('seekbackward', () => skipSentence(-1));
            navigator.mediaSession.setActionHandler('seekforward', () => skipSentence(1));
            navigator.mediaSession.setActionHandler('previoustrack', () => skipParagraph(-1));
            navigator.mediaSession.setActionHandler('nexttrack', () => skipParagraph(1));
            navigator.mediaSession.setActionHandler('stop', () => { if (isPlayingRef.current) togglePlayback(); });
        }
    }, [activeBook, isPlaying, currentChapter, updateMediaSessionPosition, togglePlayback, jumpTo, skipSentence, skipParagraph]);

    return {
        isPlaying, currentWordIndex, setCurrentWordIndex,
        playbackSpeed, setPlaybackSpeed,
        availableVoices, selectedVoiceURI, setSelectedVoiceURI,
        ttsProvider, setTtsProvider,
        totalWordsCount, currentChapter,
        togglePlayback, jumpTo, speak,
        skipSentence, skipParagraph,
        sleepTimerMinutes, sleepTimerRemaining, setSleepTimer, sleepTimerEnd,
        saveProgressImmediate, releaseWakeLock,
        wordIdxRef,
    };
}
