import { ExternalVoice } from '../types';

export const GOOGLE_VOICES: ExternalVoice[] = [
    // Journey (Deep Learning Human Cadence)
    { id: 'en-US-Journey-F', name: 'Journey Female (Storyteller)', lang: 'en-US', gender: 'Female', provider: 'google', tag: 'Journey AI', description: 'Exceptional storytelling & conversational realism' },
    { id: 'en-US-Journey-D', name: 'Journey Male (Storyteller)', lang: 'en-US', gender: 'Male', provider: 'google', tag: 'Journey AI', description: 'Rich, natural narrator tone' },
    { id: 'en-US-Journey-O', name: 'Journey Youth (Warm)', lang: 'en-US', gender: 'Female', provider: 'google', tag: 'Journey AI', description: 'Warm and friendly expressive tone' },

    // Studio (Ultra Studio Grade)
    { id: 'en-US-Studio-O', name: 'Studio Female (Professional)', lang: 'en-US', gender: 'Female', provider: 'google', tag: 'Studio', description: 'Broadcast studio quality female voice' },
    { id: 'en-US-Studio-Q', name: 'Studio Male (Professional)', lang: 'en-US', gender: 'Male', provider: 'google', tag: 'Studio', description: 'Broadcast studio quality male voice' },

    // Neural2 (Google High Fidelity)
    { id: 'en-US-Neural2-C', name: 'Neural2 Female (US)', lang: 'en-US', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'en-US-Neural2-D', name: 'Neural2 Male (US)', lang: 'en-US', gender: 'Male', provider: 'google', tag: 'Neural2' },
    { id: 'en-US-Neural2-F', name: 'Neural2 Expressive (US)', lang: 'en-US', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'en-GB-Neural2-A', name: 'Neural2 British Female', lang: 'en-GB', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'en-GB-Neural2-B', name: 'Neural2 British Male', lang: 'en-GB', gender: 'Male', provider: 'google', tag: 'Neural2' },
    { id: 'en-IN-Neural2-A', name: 'Neural2 Indian English Female', lang: 'en-IN', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'en-IN-Neural2-B', name: 'Neural2 Indian English Male', lang: 'en-IN', gender: 'Male', provider: 'google', tag: 'Neural2' },

    // Multilingual Neural2
    { id: 'es-ES-Neural2-A', name: 'Neural2 Spanish Female', lang: 'es-ES', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'fr-FR-Neural2-A', name: 'Neural2 French Female', lang: 'fr-FR', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'de-DE-Neural2-B', name: 'Neural2 German Male', lang: 'de-DE', gender: 'Male', provider: 'google', tag: 'Neural2' },
    { id: 'hi-IN-Neural2-A', name: 'Neural2 Hindi Female', lang: 'hi-IN', gender: 'Female', provider: 'google', tag: 'Neural2' },
    { id: 'ja-JP-Neural2-B', name: 'Neural2 Japanese Female', lang: 'ja-JP', gender: 'Female', provider: 'google', tag: 'Neural2' },
];

export function getGoogleApiKey(): string {
    return localStorage.getItem('google_tts_api_key') || '';
}

export function setGoogleApiKey(key: string): void {
    localStorage.setItem('google_tts_api_key', key.trim());
}

export async function synthesizeGoogleTTS(
    text: string,
    voiceId: string,
    rate: number = 1.0,
    apiKey?: string
): Promise<Blob> {
    const key = (apiKey || getGoogleApiKey()).trim();
    if (!key) {
        throw new Error('Please enter your Google Cloud / AI Studio API key in Settings');
    }

    const voice = GOOGLE_VOICES.find(v => v.id === voiceId) || GOOGLE_VOICES[0];
    const languageCode = voice.lang;

    const payload = {
        input: { text },
        voice: {
            languageCode,
            name: voice.id
        },
        audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: Math.max(0.25, Math.min(rate, 4.0))
        }
    };

    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `Google TTS error ${res.status}: ${res.statusText}`;
        throw new Error(msg);
    }

    const data = await res.json();
    if (!data.audioContent) {
        throw new Error('Google TTS returned no audio content');
    }

    // Convert base64 to Blob
    const binary = atob(data.audioContent);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: 'audio/mpeg' });
}
