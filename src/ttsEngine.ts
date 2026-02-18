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
    const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem('reader_output_device') || "");
    const [ttsProvider, setTtsProvider] = useState<TtsProvider>(() => (localStorage.getItem('reader_provider') as any) || 'system');
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
    const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
    const [sleepTimerRemaining, setSleepTimerRemaining] = useState('');

    const isPlayingRef = useRef(false);
    const isInterruptedRef = useRef(false);
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
    useEffect(() => { if (selectedDeviceId) localStorage.setItem('reader_output_device', selectedDeviceId); }, [selectedDeviceId]);

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
    // VOICE & DEVICE LOADING
    // ============================================================
    useEffect(() => {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                // Inclusive sorting: Natural/Online/Premium/Google first, but keep ALL voices
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

        const loadDevices = async () => {
            try {
                if ('mediaDevices' in navigator && 'enumerateDevices' in navigator.mediaDevices) {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const outputs = devices.filter(d => d.kind === 'audiooutput');
                    setAvailableDevices(outputs);
                }
            } catch { /* silent */ }
        };

        loadVoices();
        loadDevices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        if ('mediaDevices' in navigator) navigator.mediaDevices.ondevicechange = loadDevices;

        const poll = setInterval(loadVoices, 500);
        return () => {
            clearInterval(poll);
            window.speechSynthesis.onvoiceschanged = null;
            if ('mediaDevices' in navigator) navigator.mediaDevices.ondevicechange = null;
        };
    }, [selectedVoiceURI]);

    // Auto-Select Voice based on Book Language
    useEffect(() => {
        if (!activeBook || availableVoices.length === 0) return;

        const bookLang = activeBook.language || 'en';
        const currentVoice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);

        // If current voice is missing or doesn't match the book language, try to switch
        const isLangMatch = currentVoice && currentVoice.lang.toLowerCase().startsWith(bookLang.toLowerCase());

        if (!isLangMatch) {
            // Find best voice for this language: Natural/Premium > matches lang > system default
            const match = availableVoices.find(v => v.lang.toLowerCase().startsWith(bookLang.toLowerCase()) && (v.name.includes('Natural') || v.name.includes('Premium')))
                || availableVoices.find(v => v.lang.toLowerCase().startsWith(bookLang.toLowerCase()))
                || availableVoices.find(v => v.default);

            if (match && match.voiceURI !== selectedVoiceURI) {
                setSelectedVoiceURI(match.voiceURI);
            }
        }
    }, [activeBook, availableVoices, selectedVoiceURI]);

    // Apply audio output device (sinkId)
    useEffect(() => {
        if (heartbeatRef.current && selectedDeviceId && 'setSinkId' in (heartbeatRef.current as any)) {
            (heartbeatRef.current as any).setSinkId(selectedDeviceId).catch(() => { });
        }
    }, [selectedDeviceId]);

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
    // MEDIA SESSION POSITION & DURATION
    // Mapping word index to approximate "seconds" (approx 3 words per second)
    // ============================================================
    const WORDS_PER_SECOND = 3;
    const updateMediaSessionPosition = useCallback(() => {
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            try {
                const totalDuration = totalWordsCount / WORDS_PER_SECOND;
                const currentPos = wordIdxRef.current / WORDS_PER_SECOND;
                navigator.mediaSession.setPositionState({
                    duration: Math.max(totalDuration, 1),
                    playbackRate: playbackSpeed,
                    position: Math.min(currentPos, totalDuration)
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
    // CORE SPEAK FUNCTION (Routes to appropriate provider)
    // ============================================================
    const advanceToNextBlock = useCallback((sId: number, currentBlock: any) => {
        if (sId !== speechSessionIdRef.current) return;
        const next = currentBlock.wordStartIndex + currentBlock.wordCount;
        if (next < totalWordsCount && isPlayingRef.current) {
            wordIdxRef.current = next;
            setCurrentWordIndex(next);
            saveProgressThrottled();
            setTimeout(() => { if (sId === speechSessionIdRef.current) speak(); }, 50);
        } else {
            setIsPlaying(false); isPlayingRef.current = false;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            if (heartbeatRef.current) heartbeatRef.current.pause();
            stopChromeBgWorkaround();
            releaseWakeLock();
            saveProgressImmediate();
        }
    }, [totalWordsCount, stopChromeBgWorkaround, saveProgressImmediate, releaseWakeLock, saveProgressThrottled, setCurrentWordIndex]);


    const speakWithSystem = useCallback(async (text: string, block: any, offset: number, sId: number) => {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        const v = availableVoices.find(x => x.voiceURI === selectedVoiceURI) || availableVoices.find(v => v.default) || availableVoices[0];
        if (v) {
            utt.voice = v;
            utt.lang = v.lang; // Explicitly set lang for better engine compatibility
        }
        utt.rate = playbackSpeed;
        utt.onboundary = (e) => {
            if (sId !== speechSessionIdRef.current || e.name !== 'word') return;
            const subStr = text.substring(0, e.charIndex).trim();
            const count = subStr ? subStr.split(/\s+/).length : 0;
            const global = block.wordStartIndex + offset + count;

            if (global >= wordIdxRef.current) {
                const prevIdx = wordIdxRef.current;
                wordIdxRef.current = global;

                // 1. Emit low-latency CustomEvent for granular UI updates (highlighting)
                window.dispatchEvent(new CustomEvent('word-index-update', {
                    detail: { index: global, prevIndex: prevIdx }
                }));

                // 2. Refresh Media Session
                updateMediaSessionPosition();

                // 3. Throttle React state updates to avoid sluggishness
                // Update state only if we changed blocks, or every 5 words (down from 10) for slightly better feedback
                const prevBlockIdx = findBlockIdx(prevIdx, activeBook!.displayBlocks);
                const currentBlockIdx = findBlockIdx(global, activeBook!.displayBlocks);

                if (prevBlockIdx !== currentBlockIdx || global % 5 === 0) {
                    setCurrentWordIndex(global);
                    saveProgressThrottled();
                }
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
        utt.onend = () => { if (sId === speechSessionIdRef.current) advanceToNextBlock(sId, block); };
        utt.onerror = (ev) => {
            // Don't treat 'interrupted' or 'canceled' as real errors — they happen on skip/jump
            if (ev.error === 'interrupted' || ev.error === 'canceled') return;
            if (sId === speechSessionIdRef.current) advanceToNextBlock(sId, block);
        };
        window.speechSynthesis.speak(utt);
    }, [availableVoices, selectedVoiceURI, playbackSpeed, saveProgressThrottled, updateMediaSessionPosition, requestWakeLock, startChromeBgWorkaround, advanceToNextBlock, activeBook, setCurrentWordIndex]);

    const speak = useCallback(async () => {
        if (!activeBook || !isPlayingRef.current) return;
        const sId = speechSessionIdRef.current;
        const bIdx = findBlockIdx(wordIdxRef.current, activeBook.displayBlocks);
        const block = activeBook.displayBlocks[bIdx];
        if (!block) return;

        const offset = Math.max(0, wordIdxRef.current - block.wordStartIndex);
        const text = block.words.slice(offset).join(" ").trim();
        if (!text) {
            // Skip empty block
            advanceToNextBlock(sId, block);
            return;
        }

        speakWithSystem(text, block, offset, sId);
    }, [activeBook, speakWithSystem, advanceToNextBlock]);



    // ============================================================
    // TOGGLE PLAYBACK
    // ============================================================
    const togglePlayback = useCallback(() => {
        if (isPlayingRef.current) {
            setIsPlaying(false); isPlayingRef.current = false;
            isInterruptedRef.current = false;
            window.speechSynthesis.cancel();
            speechSessionIdRef.current++;
            if (heartbeatRef.current) heartbeatRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            stopChromeBgWorkaround();
            saveProgressImmediate();
            releaseWakeLock();
        } else {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            requestWakeLock();
            if (ttsProvider === 'system') startChromeBgWorkaround();
            speak();
        }
    }, [speak, saveProgressImmediate, requestWakeLock, releaseWakeLock, startChromeBgWorkaround, stopChromeBgWorkaround]);

    // ============================================================
    // JUMP TO WORD
    // ============================================================
    const jumpTo = useCallback((idx: number, limitWords?: number) => {
        speechSessionIdRef.current++;
        isInterruptedRef.current = false;
        window.speechSynthesis.cancel();
        const limit = limitWords !== undefined ? limitWords : totalWordsCount;
        const safeIdx = Math.max(0, limit > 0 ? Math.min(idx, limit - 1) : idx);

        const prevIdx = wordIdxRef.current;
        wordIdxRef.current = safeIdx;

        // 1. Emit low-latency CustomEvent for manual jumps
        window.dispatchEvent(new CustomEvent('word-index-update', {
            detail: { index: safeIdx, prevIndex: prevIdx }
        }));

        // 2. Refresh Media Session
        updateMediaSessionPosition();

        if (activeBook) {
            updateBookProgress(activeBook.id, safeIdx);

            // 3. Throttle React state updates
            const prevBlockIdx = findBlockIdx(prevIdx, activeBook.displayBlocks);
            const currentBlockIdx = findBlockIdx(safeIdx, activeBook.displayBlocks);

            if (prevBlockIdx !== currentBlockIdx || !isPlayingRef.current) {
                setCurrentWordIndex(safeIdx);
                saveProgressThrottled();
            }
        }

        if (isPlayingRef.current) setTimeout(speak, 50);
    }, [totalWordsCount, speak, activeBook, updateMediaSessionPosition, saveProgressThrottled, setCurrentWordIndex]);

    // ============================================================
    // SKIP SENTENCE / PARAGRAPH
    // ============================================================
    const skipSentence = useCallback((direction: 1 | -1) => {
        if (!activeBook) return;
        const allWords = activeBook.displayBlocks.flatMap(b => b.words);
        let idx = wordIdxRef.current;
        if (direction === 1) {
            while (idx < allWords.length - 1) { idx++; if (/[.!?।]$/.test(allWords[idx - 1] || '')) break; }
        } else {
            idx = Math.max(0, idx - 2);
            while (idx > 0) { idx--; if (/[.!?।]$/.test(allWords[idx] || '')) { idx++; break; } }
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
            navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime !== undefined) jumpTo(Math.floor(d.seekTime * WORDS_PER_SECOND)); });
            navigator.mediaSession.setActionHandler('seekbackward', () => skipSentence(-1));
            navigator.mediaSession.setActionHandler('seekforward', () => skipSentence(1));
            navigator.mediaSession.setActionHandler('previoustrack', () => skipParagraph(-1));
            navigator.mediaSession.setActionHandler('nexttrack', () => skipParagraph(1));
            navigator.mediaSession.setActionHandler('stop', () => { if (isPlayingRef.current) togglePlayback(); });
        }
    }, [activeBook, isPlaying, currentChapter, updateMediaSessionPosition, togglePlayback, jumpTo, skipSentence, skipParagraph, WORDS_PER_SECOND]);

    // ============================================================
    // AUDIO FOCUS & BACKGROUND MANAGEMENT
    // These hooks depend on speak/togglePlayback so they reside here
    // ============================================================
    useEffect(() => {
        const audio = new Audio();
        audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
        audio.loop = true;
        audio.volume = 0.01;
        audio.preload = "auto";
        heartbeatRef.current = audio;

        const handleSystemPause = () => {
            if (isPlayingRef.current) {
                isInterruptedRef.current = true;
                window.speechSynthesis.cancel();
                setIsPlaying(false);
                isPlayingRef.current = false;
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            }
        };

        const handleSystemPlay = () => {
            if (isInterruptedRef.current && activeBook) {
                isInterruptedRef.current = false;
                setTimeout(() => {
                    if (!isPlayingRef.current) {
                        setIsPlaying(true);
                        isPlayingRef.current = true;
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                        speak();
                    }
                }, 1000);
            }
        };

        audio.addEventListener('pause', handleSystemPause);
        audio.addEventListener('play', handleSystemPlay);

        return () => {
            audio.removeEventListener('pause', handleSystemPause);
            audio.removeEventListener('play', handleSystemPlay);
            if (heartbeatRef.current) { heartbeatRef.current.pause(); heartbeatRef.current.src = ""; }
        };
    }, [activeBook, speak]);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                if (isPlayingRef.current) await requestWakeLock();
                if (isInterruptedRef.current && activeBook) {
                    isInterruptedRef.current = false;
                    setIsPlaying(true);
                    isPlayingRef.current = true;
                    speak();
                }
            } else if (document.visibilityState === 'hidden' && isPlayingRef.current) {
                saveProgressImmediate();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [requestWakeLock, saveProgressImmediate, activeBook, speak]);

    return {
        isPlaying, currentWordIndex, setCurrentWordIndex,
        playbackSpeed, setPlaybackSpeed,
        availableVoices, selectedVoiceURI, setSelectedVoiceURI,
        availableDevices, selectedDeviceId, setSelectedDeviceId,
        ttsProvider, setTtsProvider,
        totalWordsCount, currentChapter,
        togglePlayback, jumpTo, speak,
        skipSentence, skipParagraph,
        sleepTimerMinutes, sleepTimerRemaining, setSleepTimer, sleepTimerEnd,
        saveProgressImmediate, releaseWakeLock,
        wordIdxRef,
    };
}
