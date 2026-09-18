import { ExternalVoice } from '../types';

export const GOOGLE_VOICES: ExternalVoice[] = [
    { id: 'en', name: 'Google English (US)', lang: 'en-US', gender: 'Female', provider: 'google', tag: 'Natural' },
    { id: 'en-gb', name: 'Google English (UK)', lang: 'en-GB', gender: 'Female', provider: 'google', tag: 'British' },
    { id: 'en-au', name: 'Google English (Australia)', lang: 'en-AU', gender: 'Female', provider: 'google', tag: 'Australian' },
    { id: 'en-in', name: 'Google English (India)', lang: 'en-IN', gender: 'Female', provider: 'google', tag: 'Indian' },
    { id: 'es', name: 'Google Spanish', lang: 'es-ES', gender: 'Female', provider: 'google', tag: 'Spanish' },
    { id: 'fr', name: 'Google French', lang: 'fr-FR', gender: 'Female', provider: 'google', tag: 'French' },
    { id: 'de', name: 'Google German', lang: 'de-DE', gender: 'Female', provider: 'google', tag: 'German' },
    { id: 'hi', name: 'Google Hindi', lang: 'hi-IN', gender: 'Female', provider: 'google', tag: 'Hindi' },
    { id: 'ja', name: 'Google Japanese', lang: 'ja-JP', gender: 'Female', provider: 'google', tag: 'Japanese' },
    { id: 'it', name: 'Google Italian', lang: 'it-IT', gender: 'Female', provider: 'google', tag: 'Italian' },
    { id: 'pt', name: 'Google Portuguese', lang: 'pt-BR', gender: 'Female', provider: 'google', tag: 'Portuguese' },
    { id: 'ru', name: 'Google Russian', lang: 'ru-RU', gender: 'Female', provider: 'google', tag: 'Russian' },
];

export function getGoogleStreamUrl(text: string, voiceId: string): string {
    const lang = voiceId || 'en';
    return `/api/tts/google?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`;
}
