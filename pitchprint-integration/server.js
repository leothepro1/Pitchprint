// server.js
import http from 'http';
import crypto from 'crypto';
import fetch from 'node-fetch';    // Se till att du har kört: npm install node-fetch@2
import { URL } from 'url';

// --- 1) Hämta API-nycklar från miljövariabler ---
const API_KEY    = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const PORT       = process.env.PORT || 3001;

if (!API_KEY || !SECRET_KEY) {
  console.error('[SERVER][FATAL] Saknar API_KEY eller SECRET_KEY i miljövariabler!');
  process.exit(1);
}

// --- 2) Konfigurera CORS headers ---
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const server = http.createServer((req, res) => {
  const { method, url, headers } = req;
  const parsed = new URL(url, `http://${headers.host}`);
  console.log(`[SERVER] ${method} ${parsed.pathname}`);

  // --- 3) Preflight (CORS) ---
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  // --- 4) Signature endpoint ---
  if (method === 'GET' && parsed.pathname === '/api/pitchprint/signature') {
    console.log('[SERVER] GET /api/pitchprint/signature → Genererar signatur');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash('md5')
      .update(API_KEY + SECRET_KEY + timestamp)
      .digest('hex');

    const payload = { apiKey: API_KEY, timestamp, signature };
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    });
    return res.end(JSON.stringify(payload));
  }

  // --- 5) File upload proxy ---
  if (method === 'POST' && parsed.pathname === '/api/pitchprint/file_upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        console.log('[SERVER] POST /api/pitchprint/file_upload → Mottog body length:', body.length);
        const { designId, fileName, fileData } = JSON.parse(body);

        if (!designId || !fileName || !fileData) {
          throw new Error('designId, fileName och fileData krävs i request-body');
        }

        // Generera ny signatur
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = crypto
          .createHash('md5')
          .update(API_KEY + SECRET_KEY + timestamp)
          .digest('hex');

        const payload = {
          apiKey:    API_KEY,
          timestamp,
          signature,
          designId,
          fileName,
          fileData
        };

        console.log('[SERVER] → Full PitchPrint-payload:', {
          apiKey: payload.apiKey,
          timestamp: payload.timestamp,
          signature: payload.signature,
          designId: payload.designId,
          fileName: payload.fileName,
          fileDataLength: payload.fileData.length
        });

        // Skicka till PitchPrint
        const ppRes = await fetch('https://api.pitchprint.io/runtime/file_upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const text = await ppRes.text();
        console.log(`[SERVER] PitchPrint svarade status: ${ppRes.status}`);
        console.log('[SERVER] PitchPrint svar-body:', text);

        res.writeHead(ppRes.status, {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        });
        return res.end(text);
      } catch (err) {
        console.error('[SERVER][ERROR] /api/pitchprint/file_upload:', err);
        res.writeHead(500, {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        });
        return res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- 6) Allt annat: 404 ---
  res.writeHead(404, CORS_HEADERS);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
  console.log('  • GET  /api/pitchprint/signature');
  console.log('  • POST /api/pitchprint/file_upload');
});

