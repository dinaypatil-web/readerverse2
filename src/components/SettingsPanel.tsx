import React from 'react';
import { X, ChevronRight, Globe, Volume2 } from 'lucide-react';
import { TtsProvider, ScrollMode, ScrollSpeed } from '../types';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    ttsProvider: TtsProvider;
    setTtsProvider: (v: TtsProvider) => void;
    availableVoices: SpeechSynthesisVoice[];
    selectedVoiceURI: string;
    setSelectedVoiceURI: (v: string) => void;
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
    availableVoices, selectedVoiceURI, setSelectedVoiceURI,
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
            <div className="relative w-full rounded-t-[5rem] p-10 pb-20 border-t border-white/10 animate-slide-up glass max-h-[90vh] overflow-y-auto no-scrollbar shadow-5xl">
                <div className="w-12 h-1.5 bg-zinc-500/10 rounded-full mx-auto mb-10" />
                <div className="flex justify-between items-center mb-12">
                    <h2 className="text-2xl font-black uppercase tracking-widest opacity-60">Settings</h2>
                    <button onClick={onClose} className="p-4 bg-zinc-500/10 rounded-full active:scale-90 transition-all"><X size={24} /></button>
                </div>
                <div className="max-w-xl mx-auto space-y-12 pb-10">
                    {/* TTS Provider */}
                    <div className="space-y-6">
                        <span className="text-[11px] font-black opacity-30 uppercase tracking-widest block">Neural Provider</span>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => setTtsProvider('system')}
                                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all ${ttsProvider === 'system' ? 'border-blue-600 bg-blue-600 text-white shadow-xl' : 'border-zinc-500/5 bg-zinc-500/5 opacity-40'}`}>
                                <Globe size={24} />
                                <span className="text-xs font-black uppercase">System</span>
                            </button>
                            <button onClick={() => setTtsProvider('gemini')}
                                className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all ${ttsProvider === 'gemini' ? 'border-blue-600 bg-blue-600 text-white shadow-xl' : 'border-zinc-500/5 bg-zinc-500/5 opacity-40'}`}>
                                <Volume2 size={24} />
                                <span className="text-xs font-black uppercase tracking-tighter">Neural AI</span>
                            </button>
                        </div>
                    </div>

                    {/* Voice Selector */}
                    {ttsProvider === 'system' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-black opacity-30 uppercase tracking-widest">Voice</span>
                                <span className="text-[10px] font-black text-blue-600 bg-blue-600/10 px-3 py-1 rounded-full uppercase">{availableVoices.length} Voices</span>
                            </div>
                            <div className="relative group">
                                <select value={selectedVoiceURI} onChange={e => setSelectedVoiceURI(e.target.value)}
                                    className="w-full p-6 pr-12 rounded-[2.5rem] bg-zinc-500/5 border-2 border-transparent focus:border-blue-600 outline-none font-bold appearance-none dark:text-white transition-all truncate shadow-inner">
                                    {availableVoices.length === 0 ? <option>Loading Voices...</option> : availableVoices.map(v => (
                                        <option key={v.voiceURI} value={v.voiceURI}>
                                            {v.default ? '★ ' : ''}{v.name.replace(/(Microsoft |Google |Natural |Online |Premium )/g, '')} ({v.lang}) {v.default ? '(Default)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 rotate-90 opacity-40 pointer-events-none" />
                            </div>
                        </div>
                    )}

                    {/* Audio Output Selector */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-30 uppercase tracking-widest">Audio Output</span>
                            <span className="text-[10px] font-black text-blue-600 bg-blue-600/10 px-3 py-1 rounded-full uppercase">{availableDevices.length} Devices</span>
                        </div>
                        <div className="relative group">
                            <select value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)}
                                className="w-full p-6 pr-12 rounded-[2.5rem] bg-zinc-500/5 border-2 border-transparent focus:border-blue-600 outline-none font-bold appearance-none dark:text-white transition-all truncate shadow-inner">
                                <option value="">Default System Output</option>
                                {availableDevices.map(d => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || `Speaker/Headphones (${d.deviceId.slice(0, 5)})`}
                                    </option>
                                ))}
                            </select>
                            <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 rotate-90 opacity-40 pointer-events-none" />
                        </div>
                    </div>

                    {/* Font Size */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-30 uppercase tracking-widest">Typeface Size</span>
                            <span className="text-xl font-black text-blue-600">{fontSize}px</span>
                        </div>
                        <input type="range" min="14" max="32" step="1" value={fontSize}
                            onChange={e => setFontSize(parseInt(e.target.value))}
                            className="w-full h-2 rounded-full appearance-none accent-blue-600 bg-zinc-500/10" />
                    </div>

                    {/* Theme */}
                    <div className="space-y-6">
                        <span className="text-[11px] font-black opacity-30 uppercase tracking-widest block">Theme</span>
                        <div className="grid grid-cols-3 gap-4">
                            {(['light', 'dark', 'sepia'] as const).map(t => (
                                <button key={t} onClick={() => setTheme(t)}
                                    className={`py-4 rounded-2xl text-xs font-black capitalize border-2 transition-all ${theme === t ? 'border-blue-600 bg-blue-600 text-white shadow-xl scale-105' : 'border-zinc-500/5 bg-zinc-500/5 opacity-40'}`}>{t}</button>
                            ))}
                        </div>
                    </div>

                    {/* Playback Speed */}
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black opacity-30 uppercase tracking-widest">Speed</span>
                            <span className="text-xl font-black text-blue-600">{playbackSpeed}x</span>
                        </div>
                        <input type="range" min="0.5" max="3.0" step="0.1" value={playbackSpeed}
                            onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
                            className="w-full h-2 rounded-full appearance-none accent-blue-600 bg-zinc-500/10" />
                    </div>

                    {/* Scroll Mode */}
                    <div className="space-y-6">
                        <span className="text-[11px] font-black opacity-30 uppercase tracking-widest block">Scroll Tracking</span>
                        <div className="grid grid-cols-3 gap-4">
                            {(['follow', 'snap', 'manual'] as const).map(m => (
                                <button key={m} onClick={() => setScrollMode(m)}
                                    className={`py-4 rounded-2xl text-xs font-black capitalize border-2 transition-all ${scrollMode === m ? 'border-blue-600 bg-blue-600 text-white shadow-xl scale-105' : 'border-zinc-500/5 bg-zinc-500/5 opacity-40'}`}>{m}</button>
                            ))}
                        </div>
                        {scrollMode !== 'manual' && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Scroll Speed</span>
                                    <span className="text-sm font-black text-blue-600 capitalize">{scrollSpeed}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['slow', 'medium', 'fast'] as const).map(s => (
                                        <button key={s} onClick={() => setScrollSpeed(s)}
                                            className={`py-3 rounded-xl text-[10px] font-black capitalize transition-all ${scrollSpeed === s ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-500/5 opacity-40'}`}>{s}</button>
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
