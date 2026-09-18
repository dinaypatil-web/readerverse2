import React from 'react';
import { X, ChevronRight, Globe, Zap, Volume2, Info } from 'lucide-react';
import { TtsProvider, ScrollMode, ScrollSpeed, ExternalVoice } from '../types';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    ttsProvider: TtsProvider;
    setTtsProvider: (v: TtsProvider) => void;
    availableVoices: SpeechSynthesisVoice[];
    externalVoices?: ExternalVoice[];
    selectedVoiceURI: string;
    setSelectedVoiceURI: (v: string) => void;
    providerStatus?: string;
    availableDevices: MediaDeviceInfo[];
    selectedDeviceId: string;
    setSelectedDeviceId: (v: string) => void;
    fontSize: number;
    setFontSize: (v: number) => void;
    theme: 'light' | 'dark' | 'sepia';
    setTheme: (v: 'light' | 'dark' | 'sepia') => void;
    playbackSpeed: number;
    setPlaybackSpeed: (v: number) => void;
    scrollMode: ScrollMode;
    setScrollMode: (v: ScrollMode) => void;
    scrollSpeed: ScrollSpeed;
    setScrollSpeed: (v: ScrollSpeed) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    isOpen, onClose,
    ttsProvider, setTtsProvider,
    availableVoices, externalVoices = [], selectedVoiceURI, setSelectedVoiceURI,
    providerStatus,
    availableDevices, selectedDeviceId, setSelectedDeviceId,
    fontSize, setFontSize,
    theme, setTheme,
    playbackSpeed, setPlaybackSpeed,
    scrollMode, setScrollMode, scrollSpeed, setScrollSpeed,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-end animate-fade-in">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full rounded-t-[4rem] p-8 sm:p-10 pb-20 border-t border-white/10 animate-slide-up glass max-h-[90vh] overflow-y-auto no-scrollbar shadow-5xl">
                <div className="w-12 h-1.5 bg-zinc-500/20 rounded-full mx-auto mb-8" />
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h2 className="text-2xl font-black uppercase tracking-widest opacity-80">Settings & Audio</h2>
                        <p className="text-xs opacity-50 font-medium">100% Free Neural Speech • Zero API Keys Required</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-zinc-500/10 rounded-full active:scale-90 transition-all hover:bg-zinc-500/20"><X size={22} /></button>
                </div>

                {providerStatus && (
                    <div className="mb-6 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-3 text-blue-400 text-xs font-semibold animate-pulse">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                        <span>{providerStatus}</span>
                    </div>
                )}

                <div className="max-w-xl mx-auto space-y-10 pb-10">
                    {/* TTS Provider Grid */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-40 uppercase tracking-widest block">Neural Speech Engine</span>
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full uppercase">
                                100% Free • No API Key
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {/* Edge Neural */}
                            <button onClick={() => setTtsProvider('edge')}
                                className={`flex flex-col items-center justify-center text-center gap-2 p-4 rounded-2xl border-2 transition-all ${ttsProvider === 'edge' ? 'border-blue-600 bg-blue-600 text-white shadow-lg scale-[1.02]' : 'border-zinc-500/10 bg-zinc-500/5 opacity-70 hover:opacity-100'}`}>
                                <Zap size={22} className={ttsProvider === 'edge' ? 'text-amber-300' : 'text-amber-500'} />
                                <span className="text-xs font-black uppercase tracking-tight">Edge Neural</span>
                                <span className="text-[9px] opacity-75 leading-none">320+ Voices</span>
                            </button>

                            {/* System */}
                            <button onClick={() => setTtsProvider('system')}
                                className={`flex flex-col items-center justify-center text-center gap-2 p-4 rounded-2xl border-2 transition-all ${ttsProvider === 'system' ? 'border-blue-600 bg-blue-600 text-white shadow-lg scale-[1.02]' : 'border-zinc-500/10 bg-zinc-500/5 opacity-70 hover:opacity-100'}`}>
                                <Globe size={22} />
                                <span className="text-xs font-black uppercase tracking-tight">System</span>
                                <span className="text-[9px] opacity-75 leading-none">Native Device</span>
                            </button>

                            {/* Google Speech */}
                            <button onClick={() => setTtsProvider('google')}
                                className={`flex flex-col items-center justify-center text-center gap-2 p-4 rounded-2xl border-2 transition-all ${ttsProvider === 'google' ? 'border-blue-600 bg-blue-600 text-white shadow-lg scale-[1.02]' : 'border-zinc-500/10 bg-zinc-500/5 opacity-70 hover:opacity-100'}`}>
                                <Volume2 size={22} className={ttsProvider === 'google' ? 'text-emerald-300' : 'text-emerald-400'} />
                                <span className="text-xs font-black uppercase tracking-tight">Google Speech</span>
                                <span className="text-[9px] opacity-75 leading-none">Free Public</span>
                            </button>
                        </div>

                        {/* Informative Provider Cards */}
                        {ttsProvider === 'edge' && (
                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 flex items-start gap-2.5">
                                <Info size={16} className="mt-0.5 shrink-0 text-amber-400" />
                                <div>
                                    <p className="font-semibold text-amber-200">Instant Streaming & Lock Screen Support</p>
                                    <p className="opacity-80 text-[11px] mt-0.5">Zero API keys required. Starts audio in under 150ms with next-block background prefetching. Keeps playing seamlessly when your iPhone or Android screen locks.</p>
                                </div>
                            </div>
                        )}

                        {ttsProvider === 'system' && (
                            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300/90 flex items-start gap-2.5">
                                <Info size={16} className="mt-0.5 shrink-0 text-blue-400" />
                                <div>
                                    <p className="font-semibold text-blue-200">Device Built-In Engine</p>
                                    <p className="opacity-80 text-[11px] mt-0.5">Works 100% offline with zero network latency. Word highlight has been synchronized with iOS Safari cadence fixes for smooth mobile tracking.</p>
                                </div>
                            </div>
                        )}

                        {ttsProvider === 'google' && (
                            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300/90 flex items-start gap-2.5">
                                <Info size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                                <div>
                                    <p className="font-semibold text-emerald-200">Free Google Neural Speech</p>
                                    <p className="opacity-80 text-[11px] mt-0.5">100% free with zero API key required. High fidelity voices across English, Spanish, French, German, Hindi, Japanese, and more.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Voice Selector */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-40 uppercase tracking-widest">
                                {ttsProvider === 'system' ? 'Device Voice' : `${ttsProvider.toUpperCase()} Voice`}
                            </span>
                            <span className="text-[10px] font-black text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full uppercase">
                                {ttsProvider === 'system' ? `${availableVoices.length} Voices` : `${externalVoices.length} Voices`}
                            </span>
                        </div>
                        <div className="relative group">
                            {ttsProvider === 'system' ? (
                                <select value={selectedVoiceURI} onChange={e => setSelectedVoiceURI(e.target.value)}
                                    className="w-full p-5 pr-12 rounded-2xl bg-zinc-500/5 border-2 border-transparent focus:border-blue-600 outline-none font-bold appearance-none dark:text-white transition-all truncate shadow-inner">
                                    {availableVoices.length === 0 ? <option>Loading System Voices...</option> : availableVoices.map(v => (
                                        <option key={v.voiceURI} value={v.voiceURI}>
                                            {v.default ? '★ ' : ''}{v.name.replace(/(Microsoft |Google |Natural |Online |Premium )/g, '')} ({v.lang}) {v.default ? '(Default)' : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <select value={selectedVoiceURI} onChange={e => setSelectedVoiceURI(e.target.value)}
                                    className="w-full p-5 pr-12 rounded-2xl bg-zinc-500/5 border-2 border-transparent focus:border-blue-600 outline-none font-bold appearance-none dark:text-white transition-all truncate shadow-inner">
                                    {externalVoices.length === 0 ? <option>Loading Voices...</option> : externalVoices.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.name} {v.gender ? `— ${v.gender}` : ''} {v.tag ? `[${v.tag}]` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 rotate-90 opacity-40 pointer-events-none" />
                        </div>
                    </div>

                    {/* Audio Output Selector */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-40 uppercase tracking-widest">Audio Output Destination</span>
                            <span className="text-[10px] font-black text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full uppercase">{availableDevices.length} Devices</span>
                        </div>
                        <div className="relative group">
                            <select value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)}
                                className="w-full p-5 pr-12 rounded-2xl bg-zinc-500/5 border-2 border-transparent focus:border-blue-600 outline-none font-bold appearance-none dark:text-white transition-all truncate shadow-inner">
                                <option value="">Default Audio Output (Speaker/Headphones)</option>
                                {availableDevices.map(d => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || `Audio Output (${d.deviceId.slice(0, 5)})`}
                                    </option>
                                ))}
                            </select>
                            <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 rotate-90 opacity-40 pointer-events-none" />
                        </div>
                    </div>

                    {/* Font Size */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-40 uppercase tracking-widest">Typeface Size</span>
                            <span className="text-lg font-black text-blue-500">{fontSize}px</span>
                        </div>
                        <input type="range" min="14" max="32" step="1" value={fontSize}
                            onChange={e => setFontSize(parseInt(e.target.value))}
                            className="w-full h-2 rounded-full appearance-none accent-blue-600 bg-zinc-500/10" />
                    </div>

                    {/* Theme */}
                    <div className="space-y-4">
                        <span className="text-[11px] font-black opacity-40 uppercase tracking-widest block">Color Palette Theme</span>
                        <div className="grid grid-cols-3 gap-3">
                            {(['light', 'dark', 'sepia'] as const).map(t => (
                                <button key={t} onClick={() => setTheme(t)}
                                    className={`py-3.5 rounded-2xl text-xs font-black capitalize border-2 transition-all ${theme === t ? 'border-blue-600 bg-blue-600 text-white shadow-lg scale-105' : 'border-zinc-500/10 bg-zinc-500/5 opacity-50 hover:opacity-80'}`}>{t}</button>
                            ))}
                        </div>
                    </div>

                    {/* Playback Speed */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-40 uppercase tracking-widest">Speech Playback Speed</span>
                            <span className="text-lg font-black text-blue-500">{playbackSpeed}x</span>
                        </div>
                        <input type="range" min="0.5" max="3.0" step="0.1" value={playbackSpeed}
                            onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
                            className="w-full h-2 rounded-full appearance-none accent-blue-600 bg-zinc-500/10" />
                    </div>

                    {/* Scroll Mode */}
                    <div className="space-y-4">
                        <span className="text-[11px] font-black opacity-40 uppercase tracking-widest block">Reading Scroll Tracking</span>
                        <div className="grid grid-cols-3 gap-3">
                            {(['follow', 'snap', 'manual'] as const).map(m => (
                                <button key={m} onClick={() => setScrollMode(m)}
                                    className={`py-3.5 rounded-2xl text-xs font-black capitalize border-2 transition-all ${scrollMode === m ? 'border-blue-600 bg-blue-600 text-white shadow-lg scale-105' : 'border-zinc-500/10 bg-zinc-500/5 opacity-50 hover:opacity-80'}`}>{m}</button>
                            ))}
                        </div>
                        {scrollMode !== 'manual' && (
                            <div className="space-y-2 mt-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black opacity-40 uppercase tracking-widest">Scroll Speed</span>
                                    <span className="text-xs font-black text-blue-500 capitalize">{scrollSpeed}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['slow', 'medium', 'fast'] as const).map(s => (
                                        <button key={s} onClick={() => setScrollSpeed(s)}
                                            className={`py-2.5 rounded-xl text-[10px] font-black capitalize transition-all ${scrollSpeed === s ? 'bg-blue-600 text-white shadow-md' : 'bg-zinc-500/10 opacity-60'}`}>{s}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
