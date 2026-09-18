import path from 'path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

function edgeTtsPlugin(): Plugin {
  let cachedVoices: any = null;

  return {
    name: 'edge-tts-api',
    configureServer(server) {
      handleTtsRoutes(server.middlewares);
    },
    configurePreviewServer(server) {
      handleTtsRoutes(server.middlewares);
    }
  };

  function handleTtsRoutes(middlewares: any) {
    middlewares.use(async (req: any, res: any, next: any) => {
      const parsedUrl = new URL(req.url, 'http://localhost:3000');
      const pathname = parsedUrl.pathname;

      // 1. Edge Voices List
      if (pathname === '/api/tts/edge/voices' && req.method === 'GET') {
        try {
          if (!cachedVoices) {
            const tts = new MsEdgeTTS();
            cachedVoices = await tts.getVoices();
          }
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(cachedVoices));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message || 'Failed to fetch Edge voices' }));
        }
        return;
      }

      // 2. Edge Direct Instant Stream (GET) - starts in <150ms
      if (pathname === '/api/tts/edge/stream' && req.method === 'GET') {
        try {
          const text = parsedUrl.searchParams.get('text');
          const voice = parsedUrl.searchParams.get('voice') || 'en-US-JennyNeural';

          if (!text) {
            res.statusCode = 400;
            res.end('Missing text query parameter');
            return;
          }

          const tts = new MsEdgeTTS();
          await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
          const { audioStream } = tts.toStream(text);

          const chunks: Buffer[] = [];
          audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
          audioStream.on('close', () => {
            const buffer = Buffer.concat(chunks);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end(buffer);
          });

          audioStream.on('error', (err: any) => {
            console.error('Edge stream error:', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end('Stream error');
            }
          });
        } catch (err: any) {
          console.error('Edge stream exception:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end('Synthesis failed: ' + err.message);
          }
        }
        return;
      }

      // 3. Free Public Google Speech (Zero API Key)
      if (pathname === '/api/tts/google' && req.method === 'GET') {
        try {
          const text = parsedUrl.searchParams.get('text');
          const lang = parsedUrl.searchParams.get('lang') || 'en';

          if (!text) {
            res.statusCode = 400;
            res.end('Missing text query parameter');
            return;
          }

          const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodeURIComponent(text.slice(0, 500))}&tl=${encodeURIComponent(lang)}`;
          const response = await fetch(googleUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
          });

          if (!response.ok) {
            res.statusCode = response.status;
            res.end('Google TTS upstream error');
            return;
          }

          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'public, max-age=86400');

          const arrayBuffer = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err: any) {
          console.error('Google TTS error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end('Google synthesis failed: ' + err.message);
          }
        }
        return;
      }

      // 4. Edge POST Fallback (for large texts)
      if (pathname === '/api/tts/edge' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', async () => {
          try {
            const { text, voice } = JSON.parse(body || '{}');
            if (!text) {
              res.statusCode = 400;
              res.end('Missing text parameter');
              return;
            }

            const tts = new MsEdgeTTS();
            const voiceId = voice || 'en-US-JennyNeural';
            await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

            const { audioStream } = tts.toStream(text);

            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');

            audioStream.pipe(res);

            audioStream.on('error', (err) => {
              console.error('Edge TTS stream error:', err);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.end('Edge TTS stream error: ' + err.message);
              }
            });
          } catch (err: any) {
            console.error('Edge TTS error:', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end('Edge TTS synthesis failed: ' + (err.message || 'Internal error'));
            }
          }
        });
        return;
      }

      next();
    });
  }
}

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), edgeTtsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  }
});
