import { ExternalVoice } from '../types';

export const POPULAR_EDGE_VOICES: ExternalVoice[] = [
    // English (US)
    { id: 'en-US-JennyNeural', name: 'Jenny (Natural)', lang: 'en-US', gender: 'Female', provider: 'edge', tag: 'Ultra Realistic' },
    { id: 'en-US-GuyNeural', name: 'Guy (Natural)', lang: 'en-US', gender: 'Male', provider: 'edge', tag: 'Deep & Expressive' },
    { id: 'en-US-AriaNeural', name: 'Aria (Storyteller)', lang: 'en-US', gender: 'Female', provider: 'edge', tag: 'Expressive' },
    { id: 'en-US-ChristopherNeural', name: 'Christopher (Narrator)', lang: 'en-US', gender: 'Male', provider: 'edge', tag: 'Audiobook' },
    { id: 'en-US-EricNeural', name: 'Eric (Casual)', lang: 'en-US', gender: 'Male', provider: 'edge', tag: 'Casual' },
    { id: 'en-US-MichelleNeural', name: 'Michelle (Gentle)', lang: 'en-US', gender: 'Female', provider: 'edge', tag: 'Gentle' },
    { id: 'en-US-RogerNeural', name: 'Roger (Mature)', lang: 'en-US', gender: 'Male', provider: 'edge', tag: 'Authoritative' },
    // English (UK)
    { id: 'en-GB-SoniaNeural', name: 'Sonia (British Natural)', lang: 'en-GB', gender: 'Female', provider: 'edge', tag: 'British Classic' },
    { id: 'en-GB-RyanNeural', name: 'Ryan (British Natural)', lang: 'en-GB', gender: 'Male', provider: 'edge', tag: 'British Classic' },
    { id: 'en-GB-LibbyNeural', name: 'Libby (British Story)', lang: 'en-GB', gender: 'Female', provider: 'edge', tag: 'Audiobook' },
    // English (Other)
    { id: 'en-AU-NatashaNeural', name: 'Natasha (Australian)', lang: 'en-AU', gender: 'Female', provider: 'edge', tag: 'Australian' },
    { id: 'en-AU-WilliamNeural', name: 'William (Australian)', lang: 'en-AU', gender: 'Male', provider: 'edge', tag: 'Australian' },
    { id: 'en-IN-NeerjaNeural', name: 'Neerja (Indian English)', lang: 'en-IN', gender: 'Female', provider: 'edge', tag: 'Indian Accent' },
    { id: 'en-IN-PrabhatNeural', name: 'Prabhat (Indian English)', lang: 'en-IN', gender: 'Male', provider: 'edge', tag: 'Indian Accent' },
    // Spanish
    { id: 'es-ES-ElviraNeural', name: 'Elvira (Spanish)', lang: 'es-ES', gender: 'Female', provider: 'edge', tag: 'European Spanish' },
    { id: 'es-ES-AlvaroNeural', name: 'Alvaro (Spanish)', lang: 'es-ES', gender: 'Male', provider: 'edge', tag: 'European Spanish' },
    { id: 'es-MX-DaliaNeural', name: 'Dalia (Mexican Spanish)', lang: 'es-MX', gender: 'Female', provider: 'edge', tag: 'Latin America' },
    // French
    { id: 'fr-FR-DeniseNeural', name: 'Denise (French)', lang: 'fr-FR', gender: 'Female', provider: 'edge', tag: 'French' },
    { id: 'fr-FR-HenriNeural', name: 'Henri (French)', lang: 'fr-FR', gender: 'Male', provider: 'edge', tag: 'French' },
    // German
    { id: 'de-DE-KatjaNeural', name: 'Katja (German)', lang: 'de-DE', gender: 'Female', provider: 'edge', tag: 'German' },
    { id: 'de-DE-ConradNeural', name: 'Conrad (German)', lang: 'de-DE', gender: 'Male', provider: 'edge', tag: 'German' },
    // Hindi
    { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi)', lang: 'hi-IN', gender: 'Female', provider: 'edge', tag: 'Hindi' },
    { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi)', lang: 'hi-IN', gender: 'Male', provider: 'edge', tag: 'Hindi' },
    // Japanese
    { id: 'ja-JP-NanamiNeural', name: 'Nanami (Japanese)', lang: 'ja-JP', gender: 'Female', provider: 'edge', tag: 'Japanese' },
    { id: 'ja-JP-KeitaNeural', name: 'Keita (Japanese)', lang: 'ja-JP', gender: 'Male', provider: 'edge', tag: 'Japanese' },
];

let allEdgeVoicesCache: ExternalVoice[] | null = null;
const prefetchAudioPool = new Map<string, HTMLAudioElement>();

export async function getEdgeVoices(): Promise<ExternalVoice[]> {
    if (allEdgeVoicesCache && allEdgeVoicesCache.length > 0) return allEdgeVoicesCache;

    try {
        const res = await fetch('/api/tts/edge/voices');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                allEdgeVoicesCache = data.map((v: any) => ({
                    id: v.ShortName,
                    name: `${v.FriendlyName?.replace(/Microsoft |Online \(Natural\) - /g, '') || v.ShortName} (${v.Locale})`,
                    lang: v.Locale,
                    gender: v.Gender === 'Male' ? 'Male' : 'Female',
                    provider: 'edge',
                    tag: v.VoiceTag?.VoicePersonalities?.[0] || 'Neural'
                }));
                return allEdgeVoicesCache;
            }
        }
    } catch {
        // Fallback to popular voices
    }
    return POPULAR_EDGE_VOICES;
}

// Instant Direct Stream URL - browser starts playing within <150ms
export function getEdgeStreamUrl(text: string, voiceId: string): string {
    return `/api/tts/edge/stream?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voiceId || 'en-US-JennyNeural')}`;
}

// Prefetch upcoming block audio in background for 0ms pause between blocks
export function prefetchEdgeAudio(text: string, voiceId: string): void {
    if (!text || text.trim().length === 0) return;
    const url = getEdgeStreamUrl(text, voiceId);
    if (prefetchAudioPool.has(url)) return;

    // Keep pool limited to 3 items
    if (prefetchAudioPool.size > 3) {
        const oldestKey = prefetchAudioPool.keys().next().value;
        if (oldestKey) {
            const oldAudio = prefetchAudioPool.get(oldestKey);
            if (oldAudio) { oldAudio.src = ''; }
            prefetchAudioPool.delete(oldestKey);
        }
    }

    try {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;
        prefetchAudioPool.set(url, audio);
    } catch { /* silent */ }
}
