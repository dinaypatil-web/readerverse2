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
      const url = req.url?.split('?')[0];

      if (url === '/api/tts/edge/voices' && req.method === 'GET') {
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

      if (url === '/api/tts/edge' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', async () => {
          try {
            const { text, voice, rate } = JSON.parse(body || '{}');
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
            res.setHeader('Cache-Control', 'public, max-age=3600');

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

