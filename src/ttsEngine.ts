import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Book, TtsProvider, ScrollMode, ExternalVoice } from './types';
import { updateBookProgress } from './persistence';
import { findBlockIdx } from './parsers';
import { getEdgeVoices, getEdgeStreamUrl, prefetchEdgeAudio, POPULAR_EDGE_VOICES } from './services/edgeTts';
import { GOOGLE_VOICES, getGoogleStreamUrl } from './services/googleTts';

export function useTTS(activeBook: Book | null, scrollMode: ScrollMode) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentWordIndex, setCurrentWordIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(() => parseFloat(localStorage.getItem('reader_speed') || '1.0'));
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [externalVoices, setExternalVoices] = useState<ExternalVoice[]>([]);
    const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => {
        const prov = localStorage.getItem('reader_provider') || 'edge';
        if (prov === 'edge') return localStorage.getItem('reader_voice_edge') || 'en-US-JennyNeural';
        if (prov === 'google') return localStorage.getItem('reader_voice_google') || 'en';
        return localStorage.getItem('reader_voice') || '';
    });
    const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem('reader_output_device') || "");
    const [ttsProvider, setTtsProviderState] = useState<TtsProvider>(() => {
        const saved = localStorage.getItem('reader_provider');
        if (saved === 'system' || saved === 'edge' || saved === 'google') return saved as TtsProvider;
        return 'edge'; // Default to fast Edge Neural with 320+ voices
    });
    const [providerStatus, setProviderStatus] = useState<string>('');
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
    const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
    const [sleepTimerRemaining, setSleepTimerRemaining] = useState('');

    const isPlayingRef = useRef(false);
    const isInterruptedRef = useRef(false);
    const wordIdxRef = useRef(0);
    const speechSessionIdRef = useRef(0);
    const heartbeatRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const iosCadenceTimerRef = useRef<number | null>(null);
    const lastSavedIndexRef = useRef(0);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const sleepTimerIntervalRef = useRef<number | null>(null);
    const chromeBgIntervalRef = useRef<number | null>(null);
    const speakRef = useRef<() => void>(() => { });

    // Persist settings
    useEffect(() => localStorage.setItem('reader_speed', playbackSpeed.toString()), [playbackSpeed]);
    useEffect(() => localStorage.setItem('reader_provider', ttsProvider), [ttsProvider]);
    useEffect(() => {
        if (!selectedVoiceURI) return;
        if (ttsProvider === 'system') localStorage.setItem('reader_voice', selectedVoiceURI);
        else if (ttsProvider === 'edge') localStorage.setItem('reader_voice_edge', selectedVoiceURI);
        else if (ttsProvider === 'google') localStorage.setItem('reader_voice_google', selectedVoiceURI);
    }, [selectedVoiceURI, ttsProvider]);
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
    // WAKE LOCK - keep screen active during reading
    // ============================================================
    const requestWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
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

    // Stop all active audio elements and speech synthesis
    const stopAllAudio = useCallback(() => {
        window.speechSynthesis.cancel();
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (iosCadenceTimerRef.current) {
            clearInterval(iosCadenceTimerRef.current);
            iosCadenceTimerRef.current = null;
        }
        if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.removeAttribute('src');
            audioPlayerRef.current.load();
            audioPlayerRef.current = null;
        }
    }, []);

    // ============================================================
    // VOICE & DEVICE LOADING
    // ============================================================
    useEffect(() => {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                const sorted = voices.filter(v => v.lang !== "").sort((a, b) => {
                    const isNatural = (n: string) =>
                        n.includes('Natural') ||
                        n.includes('Online') ||
                        n.includes('Google') ||
                        n.includes('Premium') ||
                        n.includes('Neural') ||
                        n.includes('Multilingual');
                    const aN = isNatural(a.name);
                    const bN = isNatural(b.name);
                    if (aN && !bN) return -1;
                    if (!aN && bN) return 1;
                    return a.name.localeCompare(b.name);
                });
                setAvailableVoices(sorted);
                if (ttsProvider === 'system' && !selectedVoiceURI) {
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

        const poll = setInterval(loadVoices, 1000);
        return () => {
            clearInterval(poll);
            window.speechSynthesis.onvoiceschanged = null;
            if ('mediaDevices' in navigator) navigator.mediaDevices.ondevicechange = null;
        };
    }, [ttsProvider, selectedVoiceURI]);

    // Switch provider & update voices list
    const setTtsProvider = useCallback((newProvider: TtsProvider) => {
        stopAllAudio();
        setTtsProviderState(newProvider);

        if (newProvider === 'system') {
            const saved = localStorage.getItem('reader_voice');
            const defaultSys = availableVoices.find(v => v.voiceURI === saved) || availableVoices.find(v => v.default) || availableVoices[0];
            if (defaultSys) setSelectedVoiceURI(defaultSys.voiceURI);
        } else if (newProvider === 'edge') {
            getEdgeVoices().then(voices => {
                setExternalVoices(voices);
                const saved = localStorage.getItem('reader_voice_edge') || 'en-US-JennyNeural';
                const found = voices.find(v => v.id === saved) || voices[0];
                if (found) setSelectedVoiceURI(found.id);
            });
        } else if (newProvider === 'google') {
            setExternalVoices(GOOGLE_VOICES);
            const saved = localStorage.getItem('reader_voice_google') || 'en';
            const found = GOOGLE_VOICES.find(v => v.id === saved) || GOOGLE_VOICES[0];
            if (found) setSelectedVoiceURI(found.id);
        }
    }, [availableVoices, stopAllAudio]);

    // Initial voices population
    useEffect(() => {
        if (ttsProvider === 'edge') {
            getEdgeVoices().then(voices => setExternalVoices(voices));
        } else if (ttsProvider === 'google') {
            setExternalVoices(GOOGLE_VOICES);
        }
    }, [ttsProvider]);

    // Auto-Select Voice based on Book Language
    useEffect(() => {
        if (!activeBook) return;
        const bookLang = (activeBook.language || 'en').toLowerCase();

        if (ttsProvider === 'system' && availableVoices.length > 0) {
            const currentVoice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
            const isLangMatch = currentVoice && currentVoice.lang.toLowerCase().startsWith(bookLang);
            if (!isLangMatch) {
                const match = availableVoices.find(v => v.lang.toLowerCase().startsWith(bookLang) && (v.name.includes('Natural') || v.name.includes('Premium')))
                    || availableVoices.find(v => v.lang.toLowerCase().startsWith(bookLang))
                    || availableVoices.find(v => v.default);
                if (match && match.voiceURI !== selectedVoiceURI) setSelectedVoiceURI(match.voiceURI);
            }
        } else if (externalVoices.length > 0) {
            const currentVoice = externalVoices.find(v => v.id === selectedVoiceURI);
            const isLangMatch = currentVoice && currentVoice.lang.toLowerCase().startsWith(bookLang);
            if (!isLangMatch) {
                const match = externalVoices.find(v => v.lang.toLowerCase().startsWith(bookLang));
                if (match && match.id !== selectedVoiceURI) setSelectedVoiceURI(match.id);
            }
        }
    }, [activeBook, availableVoices, externalVoices, selectedVoiceURI, ttsProvider]);

    // Sync word index when activeBook changes
    useEffect(() => {
        if (activeBook) {
            const resumeIdx = activeBook.lastIndex || 0;
            wordIdxRef.current = resumeIdx;
            lastSavedIndexRef.current = resumeIdx;
            setCurrentWordIndex(resumeIdx);
        }
    }, [activeBook?.id]);

    // Apply audio output device (sinkId)
    useEffect(() => {
        if (heartbeatRef.current && selectedDeviceId && 'setSinkId' in (heartbeatRef.current as any)) {
            (heartbeatRef.current as any).setSinkId(selectedDeviceId).catch(() => { });
        }
        if (audioPlayerRef.current && selectedDeviceId && 'setSinkId' in (audioPlayerRef.current as any)) {
            (audioPlayerRef.current as any).setSinkId(selectedDeviceId).catch(() => { });
        }
    }, [selectedDeviceId]);

    // ============================================================
    // PROGRESS SAVING
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

    const saveProgressThrottled = useCallback(() => {
        if (activeBook && Math.abs(wordIdxRef.current - lastSavedIndexRef.current) > 50) {
            saveProgressImmediate();
        }
    }, [activeBook, saveProgressImmediate]);

    useEffect(() => {
        const handleBeforeUnload = () => { saveProgressImmediate(); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [saveProgressImmediate]);

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

    // Chrome background speech synthesis workaround
    const startChromeBgWorkaround = useCallback(() => {
        if (chromeBgIntervalRef.current) clearInterval(chromeBgIntervalRef.current);
        chromeBgIntervalRef.current = window.setInterval(() => {
            if (isPlayingRef.current && window.speechSynthesis.speaking) {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
            }
        }, 10_000);
    }, []);

    const stopChromeBgWorkaround = useCallback(() => {
        if (chromeBgIntervalRef.current) {
            clearInterval(chromeBgIntervalRef.current);
            chromeBgIntervalRef.current = null;
        }
    }, []);

    // ============================================================
    // CORE SPEAK & ADVANCE
    // ============================================================
    const advanceToNextBlock = useCallback((sId: number, currentBlock: any) => {
        if (sId !== speechSessionIdRef.current) return;
        const next = currentBlock.wordStartIndex + currentBlock.wordCount;
        if (next < totalWordsCount && isPlayingRef.current) {
            wordIdxRef.current = next;
            setCurrentWordIndex(next);
            saveProgressThrottled();

            // Next block transition with minimal latency
            setTimeout(() => { if (sId === speechSessionIdRef.current) speakRef.current(); }, 20);
        } else {
            setIsPlaying(false); isPlayingRef.current = false;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            if (heartbeatRef.current) heartbeatRef.current.pause();
            stopChromeBgWorkaround();
            releaseWakeLock();
            saveProgressImmediate();
        }
    }, [totalWordsCount, stopChromeBgWorkaround, saveProgressImmediate, releaseWakeLock, saveProgressThrottled, setCurrentWordIndex]);

    // System Speech (with iPhone WebKit onboundary fix + rhythmic fallback)
    const speakWithSystem = useCallback(async (text: string, block: any, offset: number, sId: number) => {
        stopAllAudio();
        const utt = new SpeechSynthesisUtterance(text);
        const v = availableVoices.find(x => x.voiceURI === selectedVoiceURI) || availableVoices.find(v => v.default) || availableVoices[0];
        if (v) {
            utt.voice = v;
            utt.lang = v.lang;
        }
        utt.rate = playbackSpeed;

        let lastWordTimestamp = Date.now();

        // Rhythmic fallback interval specifically for iOS Safari (iPhone)
        // If Safari WebKit stops emitting boundary events, this ensures word highlights continue smoothly
        const cadenceTimer = window.setInterval(() => {
            if (sId !== speechSessionIdRef.current || !isPlayingRef.current) {
                clearInterval(cadenceTimer);
                return;
            }
            const timeSinceLast = Date.now() - lastWordTimestamp;
            const msPerWord = 300 / Math.max(0.5, playbackSpeed);
            if (timeSinceLast > msPerWord) {
                lastWordTimestamp = Date.now();
                const currentRel = wordIdxRef.current - block.wordStartIndex;
                if (currentRel < block.wordCount - 1) {
                    const nextGlobal = wordIdxRef.current + 1;
                    const prev = wordIdxRef.current;
                    wordIdxRef.current = nextGlobal;
                    window.dispatchEvent(new CustomEvent('word-index-update', {
                        detail: { index: nextGlobal, prevIndex: prev }
                    }));
                    updateMediaSessionPosition();
                }
            }
        }, 100);
        iosCadenceTimerRef.current = cadenceTimer;

        utt.onboundary = (e) => {
            if (sId !== speechSessionIdRef.current) return;
            // On iOS Safari WebKit, e.name can be empty or undefined, so don't reject empty name
            if (e.name && e.name !== 'word' && e.name !== 'sentence') return;
            lastWordTimestamp = Date.now();

            const subStr = text.substring(0, e.charIndex).trim();
            const count = subStr ? subStr.split(/\s+/).length : 0;
            const global = block.wordStartIndex + offset + count;

            if (global >= wordIdxRef.current && global < block.wordStartIndex + block.wordCount) {
                const prevIdx = wordIdxRef.current;
                wordIdxRef.current = global;

                window.dispatchEvent(new CustomEvent('word-index-update', {
                    detail: { index: global, prevIndex: prevIdx }
                }));

                updateMediaSessionPosition();

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
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                requestWakeLock();
                startChromeBgWorkaround();
            }
        };

        utt.onend = () => {
            clearInterval(cadenceTimer);
            if (sId === speechSessionIdRef.current) advanceToNextBlock(sId, block);
        };

        utt.onerror = (ev) => {
            clearInterval(cadenceTimer);
            if (ev.error === 'interrupted' || ev.error === 'canceled') return;
            if (sId === speechSessionIdRef.current) advanceToNextBlock(sId, block);
        };

        window.speechSynthesis.speak(utt);
    }, [availableVoices, selectedVoiceURI, playbackSpeed, saveProgressThrottled, updateMediaSessionPosition, requestWakeLock, startChromeBgWorkaround, advanceToNextBlock, activeBook, setCurrentWordIndex, stopAllAudio]);

    // Instant Audio-Stream Playback (Edge Neural & Google Speech) - Starts in <150ms with Zero API Keys
    const speakWithAudioStream = useCallback(async (text: string, block: any, offset: number, sId: number) => {
        stopAllAudio();
        try {
            let streamUrl = '';
            if (ttsProvider === 'edge') {
                streamUrl = getEdgeStreamUrl(text, selectedVoiceURI || 'en-US-JennyNeural');
            } else if (ttsProvider === 'google') {
                streamUrl = getGoogleStreamUrl(text, selectedVoiceURI || 'en');
            }

            if (!streamUrl || sId !== speechSessionIdRef.current || !isPlayingRef.current) return;

            // Prefetch upcoming block while this one is starting!
            const currentBlockIdx = findBlockIdx(block.wordStartIndex, activeBook!.displayBlocks);
            const nextBlock = activeBook!.displayBlocks[currentBlockIdx + 1];
            if (nextBlock && ttsProvider === 'edge') {
                prefetchEdgeAudio(nextBlock.words.join(" "), selectedVoiceURI);
            }

            const audio = new Audio();
            audio.src = streamUrl;
            audio.playbackRate = playbackSpeed;
            audioPlayerRef.current = audio;

            if (selectedDeviceId && 'setSinkId' in (audio as any)) {
                (audio as any).setSinkId(selectedDeviceId).catch(() => { });
            }

            audio.onplay = () => {
                if (sId === speechSessionIdRef.current) {
                    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                    requestWakeLock();
                }
            };

            // High-frequency word interpolation for buttery-smooth highlight on Windows & iPhone
            const syncWordHighlight = () => {
                if (sId !== speechSessionIdRef.current || !audio || audio.paused || !audio.duration) return;
                const remainingWords = block.words.slice(offset);
                const progress = Math.min(1, audio.currentTime / audio.duration);
                const wordCount = Math.floor(progress * remainingWords.length);
                const global = Math.min(block.wordStartIndex + block.wordCount - 1, block.wordStartIndex + offset + wordCount);

                if (global >= wordIdxRef.current) {
                    const prevIdx = wordIdxRef.current;
                    wordIdxRef.current = global;

                    window.dispatchEvent(new CustomEvent('word-index-update', {
                        detail: { index: global, prevIndex: prevIdx }
                    }));
                    updateMediaSessionPosition();

                    if (global % 5 === 0) {
                        setCurrentWordIndex(global);
                        saveProgressThrottled();
                    }
                }

                if (!audio.paused && !audio.ended) {
                    animationFrameRef.current = requestAnimationFrame(syncWordHighlight);
                }
            };

            audio.onplaying = () => {
                animationFrameRef.current = requestAnimationFrame(syncWordHighlight);
            };

            audio.ontimeupdate = () => {
                syncWordHighlight();
            };

            audio.onended = () => {
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                    animationFrameRef.current = null;
                }
                if (sId === speechSessionIdRef.current) {
                    advanceToNextBlock(sId, block);
                }
            };

            audio.onerror = (e) => {
                console.error("Stream playback error:", e);
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                if (sId === speechSessionIdRef.current) {
                    advanceToNextBlock(sId, block);
                }
            };

            // Start playing immediately!
            await audio.play();
        } catch (err: any) {
            console.error(`${ttsProvider} playback error:`, err);
            setTimeout(() => {
                if (sId === speechSessionIdRef.current && isPlayingRef.current) {
                    advanceToNextBlock(sId, block);
                }
            }, 1000);
        }
    }, [ttsProvider, selectedVoiceURI, playbackSpeed, selectedDeviceId, stopAllAudio, requestWakeLock, updateMediaSessionPosition, activeBook, saveProgressThrottled, advanceToNextBlock, setCurrentWordIndex]);

    const speak = useCallback(async () => {
        if (!activeBook || !isPlayingRef.current) return;
        const sId = speechSessionIdRef.current;
        const bIdx = findBlockIdx(wordIdxRef.current, activeBook.displayBlocks);
        const block = activeBook.displayBlocks[bIdx];
        if (!block) return;

        const offset = Math.max(0, wordIdxRef.current - block.wordStartIndex);
        const text = block.words.slice(offset).join(" ").trim();
        if (!text) {
            advanceToNextBlock(sId, block);
            return;
        }

        if (ttsProvider === 'system') {
            speakWithSystem(text, block, offset, sId);
        } else {
            speakWithAudioStream(text, block, offset, sId);
        }
    }, [activeBook, ttsProvider, speakWithSystem, speakWithAudioStream, advanceToNextBlock]);

    useEffect(() => { speakRef.current = speak; }, [speak]);

    // ============================================================
    // TOGGLE PLAYBACK
    // ============================================================
    const togglePlayback = useCallback(() => {
        if (isPlayingRef.current) {
            setIsPlaying(false); isPlayingRef.current = false;
            isInterruptedRef.current = false;
            stopAllAudio();
            speechSessionIdRef.current++;
            if (heartbeatRef.current) heartbeatRef.current.pause();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            stopChromeBgWorkaround();
            saveProgressImmediate();
            releaseWakeLock();
        } else {
            if (audioContextRef.current) audioContextRef.current.resume().catch(() => { });
            if (heartbeatRef.current) heartbeatRef.current.play().catch(() => { });
            setIsPlaying(true); isPlayingRef.current = true;
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            requestWakeLock();
            if (ttsProvider === 'system') startChromeBgWorkaround();
            speak();
        }
    }, [speak, saveProgressImmediate, requestWakeLock, releaseWakeLock, startChromeBgWorkaround, stopChromeBgWorkaround, stopAllAudio, ttsProvider]);

    // ============================================================
    // JUMP TO WORD
    // ============================================================
    const jumpTo = useCallback((idx: number, limitWords?: number) => {
        speechSessionIdRef.current++;
        isInterruptedRef.current = false;
        stopAllAudio();
        const limit = limitWords !== undefined ? limitWords : totalWordsCount;
        const safeIdx = Math.max(0, limit > 0 ? Math.min(idx, limit - 1) : idx);

        const prevIdx = wordIdxRef.current;
        wordIdxRef.current = safeIdx;

        window.dispatchEvent(new CustomEvent('word-index-update', {
            detail: { index: safeIdx, prevIndex: prevIdx }
        }));

        updateMediaSessionPosition();
        saveProgressImmediate();

        if (activeBook) {
            updateBookProgress(activeBook.id, safeIdx);

            const prevBlockIdx = findBlockIdx(prevIdx, activeBook.displayBlocks);
            const currentBlockIdx = findBlockIdx(safeIdx, activeBook.displayBlocks);

            if (prevBlockIdx !== currentBlockIdx || !isPlayingRef.current) {
                setCurrentWordIndex(safeIdx);
                saveProgressThrottled();
            }
        }

        if (isPlayingRef.current) {
            if (audioContextRef.current) audioContextRef.current.resume().catch(() => { });
            if (heartbeatRef.current) heartbeatRef.current.play().catch(() => { });
            setTimeout(() => speakRef.current(), 50);
        }
    }, [totalWordsCount, stopAllAudio, activeBook, updateMediaSessionPosition, saveProgressImmediate, saveProgressThrottled, setCurrentWordIndex]);

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
    // MEDIA SESSION CONTROLS
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
                stopAllAudio();
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
                        speakRef.current();
                    }
                }, 1000);
            }
        };

        try {
            const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
            if (AudioCtx) {
                const ctx = new AudioCtx();
                audioContextRef.current = ctx;

                ctx.onstatechange = () => {
                    if (ctx.state === 'suspended' && isPlayingRef.current) {
                        handleSystemPause();
                    } else if (ctx.state === 'running' && isInterruptedRef.current) {
                        handleSystemPlay();
                    }
                };
            }
        } catch {
            console.warn("AudioContext not supported for interruption monitoring");
        }

        audio.addEventListener('pause', handleSystemPause);
        audio.addEventListener('play', handleSystemPlay);

        return () => {
            audio.removeEventListener('pause', handleSystemPause);
            audio.removeEventListener('play', handleSystemPlay);
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => { });
                audioContextRef.current = null;
            }
            if (heartbeatRef.current) { heartbeatRef.current.pause(); heartbeatRef.current.src = ""; }
        };
    }, [activeBook, stopAllAudio]);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                if (isPlayingRef.current) await requestWakeLock();
                if (isInterruptedRef.current && activeBook) {
                    isInterruptedRef.current = false;
                    setIsPlaying(true);
                    isPlayingRef.current = true;
                    speakRef.current();
                }
            } else if (document.visibilityState === 'hidden' && isPlayingRef.current) {
                saveProgressImmediate();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [requestWakeLock, saveProgressImmediate, activeBook]);

    return {
        isPlaying, currentWordIndex, setCurrentWordIndex,
        playbackSpeed, setPlaybackSpeed,
        availableVoices, externalVoices,
        selectedVoiceURI, setSelectedVoiceURI,
        availableDevices, selectedDeviceId, setSelectedDeviceId,
        ttsProvider, setTtsProvider,
        providerStatus,
        totalWordsCount, currentChapter,
        togglePlayback, jumpTo, speak,
        skipSentence, skipParagraph,
        sleepTimerMinutes, sleepTimerRemaining, setSleepTimer, sleepTimerEnd,
        saveProgressImmediate, releaseWakeLock,
        wordIdxRef,
    };
}
