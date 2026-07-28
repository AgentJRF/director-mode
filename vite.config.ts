import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// ---- AI camera-match proxy (dev server) -----------------------------------
// POST /api/match-camera { imageBase64, mediaType, width, height }
//   → { azimuth_deg, elevation_deg, distance_factor, focal_mm, aperture_f, confidence, reasoning, mocked }
// If ANTHROPIC_API_KEY is set (.env), asks Claude vision to estimate the shot; otherwise returns a
// local heuristic (mocked:true) so the flow works end-to-end without a key.

interface Estimate {
  azimuth_deg: number; elevation_deg: number; distance_factor: number;
  focal_mm: number; aperture_f: number; confidence: number; reasoning: string; mocked?: boolean;
}
const clampNum = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v)); return isNaN(n) ? dflt : Math.min(hi, Math.max(lo, n));
};
function clampEstimate(o: Record<string, unknown>): Estimate {
  return {
    azimuth_deg: clampNum(o.azimuth_deg, -180, 180, 30),
    elevation_deg: clampNum(o.elevation_deg, -25, 85, 12),
    distance_factor: clampNum(o.distance_factor, 1.2, 7, 2.6),
    focal_mm: clampNum(o.focal_mm, 14, 200, 50),
    aperture_f: clampNum(o.aperture_f, 1.4, 16, 2.8),
    confidence: clampNum(o.confidence, 0, 1, 0.5),
    reasoning: typeof o.reasoning === 'string' ? o.reasoning.slice(0, 200) : '',
  };
}

const PROMPT = `You are estimating the CAMERA used to shoot a product photograph, in order to recreate the framing in a 3D studio where a single product sits centered on a turntable.
Analyze the reference image and estimate the camera pose RELATIVE TO THE PRODUCT. Return ONLY a compact JSON object (no prose, no markdown fences) with keys:
- azimuth_deg: horizontal angle around the product. 0 = straight front, positive = camera to the product's right, negative = left. Range -180..180.
- elevation_deg: vertical angle. 0 = eye level, positive = high angle looking down, negative = low angle. Range -25..85.
- distance_factor: camera distance as a multiple of the product height (tight framing ~1.5, wide ~6).
- focal_mm: estimated 35mm-equivalent focal length (14..200).
- aperture_f: estimated aperture (1.4 = very shallow depth/strong bokeh, 16 = deep focus).
- confidence: number 0..1, your confidence in the estimate.
- reasoning: one short sentence.`;

async function estimateWithClaude(key: string, model: string, body: Record<string, unknown>): Promise<Estimate> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 500,
      messages: [{
        role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: body.mediaType || 'image/jpeg', data: body.imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const data = await r.json() as { content?: { text?: string }[] };
  const text = (data.content || []).map(b => b.text || '').join('');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
  return { ...clampEstimate(parsed), mocked: false };
}

function heuristic(body: Record<string, unknown>): Estimate {
  const w = Number(body.width) || 1, h = Number(body.height) || 1; const ar = w / h;
  const focal = ar < 0.85 ? 85 : ar > 1.5 ? 28 : 50; // portrait → longer lens, wide → shorter
  return {
    ...clampEstimate({ azimuth_deg: 32, elevation_deg: 12, distance_factor: 2.6, focal_mm: focal, aperture_f: 2.8, confidence: 0.4 }),
    reasoning: 'Heuristic estimate (set ANTHROPIC_API_KEY for a real Claude vision analysis).', mocked: true,
  };
}

function aiPlugin(env: Record<string, string>): Plugin {
  const KEY = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const MODEL = env.AI_MODEL || 'claude-sonnet-5';
  return {
    name: 'ai-match-camera',
    configureServer(server) {
      server.middlewares.use('/api/match-camera', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const send = (code: number, obj: unknown) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
          const est = KEY ? await estimateWithClaude(KEY, MODEL, body) : heuristic(body);
          send(200, est);
        } catch (e) {
          // Never hard-fail the UI: fall back to a heuristic and report the error alongside it.
          send(200, { ...heuristic({}), reasoning: 'AI error — heuristic fallback: ' + String((e as Error)?.message || e).slice(0, 160), mocked: true });
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), aiPlugin(env)],
    server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  };
})
