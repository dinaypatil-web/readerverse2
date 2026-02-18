export async function getOpenAiTtsAudio(text: string, apiKey: string, voice: string = 'alloy', speed: number = 1.0): Promise<string> {
    if (!apiKey) throw new Error('OpenAI API Key is required');

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: voice,
            speed: speed,
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `OpenAI TTS error: ${response.statusText}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}
