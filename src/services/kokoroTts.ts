import { ExternalVoice } from '../types';

export const KOKORO_VOICES: ExternalVoice[] = [
    // American Female
    { id: 'af_heart', name: 'Heart (Top Rated)', lang: 'en-US', gender: 'Female', provider: 'kokoro', tag: 'Benchmark Quality', description: 'Warm, expressive studio audio' },
    { id: 'af_bella', name: 'Bella (Gentle)', lang: 'en-US', gender: 'Female', provider: 'kokoro', tag: 'Studio', description: 'Calm and conversational' },
    { id: 'af_sarah', name: 'Sarah (Natural)', lang: 'en-US', gender: 'Female', provider: 'kokoro', tag: 'Storyteller' },
    { id: 'af_sky', name: 'Sky (Youthful)', lang: 'en-US', gender: 'Female', provider: 'kokoro', tag: 'Casual' },
    { id: 'af_nicole', name: 'Nicole (Crisp)', lang: 'en-US', gender: 'Female', provider: 'kokoro', tag: 'Narrator' },

    // American Male
    { id: 'am_adam', name: 'Adam (Narrator)', lang: 'en-US', gender: 'Male', provider: 'kokoro', tag: 'Audiobook', description: 'Deep, clear narration' },
    { id: 'am_michael', name: 'Michael (Natural)', lang: 'en-US', gender: 'Male', provider: 'kokoro', tag: 'Storyteller' },
    { id: 'am_echo', name: 'Echo (Calm)', lang: 'en-US', gender: 'Male', provider: 'kokoro', tag: 'Smooth' },
    { id: 'am_eric', name: 'Eric (Conversational)', lang: 'en-US', gender: 'Male', provider: 'kokoro', tag: 'Casual' },

    // British Female
    { id: 'bf_emma', name: 'Emma (British Classic)', lang: 'en-GB', gender: 'Female', provider: 'kokoro', tag: 'British', description: 'Elegant British narration' },
    { id: 'bf_isabella', name: 'Isabella (British Soft)', lang: 'en-GB', gender: 'Female', provider: 'kokoro', tag: 'British' },

    // British Male
    { id: 'bm_george', name: 'George (British Narrator)', lang: 'en-GB', gender: 'Male', provider: 'kokoro', tag: 'British', description: 'Distinguished British tone' },
    { id: 'bm_lewis', name: 'Lewis (British Natural)', lang: 'en-GB', gender: 'Male', provider: 'kokoro', tag: 'British' },
];

let kokoroInstance: any = null;
let isLoadingKokoro = false;
let loadPromise: Promise<any> | null = null;

export async function getKokoroInstance(onStatus?: (msg: string) => void): Promise<any> {
    if (kokoroInstance) return kokoroInstance;
    if (loadPromise) return loadPromise;

    isLoadingKokoro = true;
    onStatus?.('Loading Kokoro AI Neural Model (82M)...');

    loadPromise = (async () => {
        try {
            const { KokoroTTS } = await import('kokoro-js');
            onStatus?.('Initializing ONNX WebAssembly Neural Engine...');
            const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
            const tts = await KokoroTTS.from_pretrained(model_id, {
                dtype: "q8",
                device: "wasm"
            });
            kokoroInstance = tts;
            onStatus?.('Kokoro AI Ready');
            return tts;
        } catch (err: any) {
            console.error("Failed to load Kokoro:", err);
            onStatus?.('Error loading Kokoro: ' + (err.message || String(err)));
            throw err;
        } finally {
            isLoadingKokoro = false;
        }
    })();

    return loadPromise;
}

export function isKokoroLoaded(): boolean {
    return kokoroInstance !== null;
}

export async function synthesizeKokoroTTS(
    text: string,
    voiceId: string,
    onStatus?: (msg: string) => void
): Promise<Blob> {
    const tts = await getKokoroInstance(onStatus);
    onStatus?.('Synthesizing with Kokoro AI...');

    const audioResult = await tts.generate(text, {
        voice: voiceId || 'af_heart'
    });

    onStatus?.('Synthesis complete');

    // audioResult contains .toBlob() or .audio data
    if (typeof audioResult.toBlob === 'function') {
        return await audioResult.toBlob();
    } else if (audioResult.audio instanceof Float32Array || audioResult.audio instanceof Int16Array) {
        // Convert Float32Array PCM to WAV Blob
        return pcmToWav(audioResult.audio, audioResult.sampling_rate || 24000);
    } else if (audioResult instanceof Blob) {
        return audioResult;
    }

    throw new Error('Unsupported Kokoro audio output format');
}

// Lightweight PCM to WAV Blob converter
function pcmToWav(samples: Float32Array | Int16Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);

    // Write audio samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        let s = samples[i];
        if (samples instanceof Float32Array) {
            s = Math.max(-1, Math.min(1, s));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        view.setInt16(offset, s, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
