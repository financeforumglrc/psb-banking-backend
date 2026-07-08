/**
 * Keep-alive script for Render free tier.
 * Pings the backend and frontend every 10 minutes to reduce cold starts.
 * Can be required from server.js or run standalone.
 */

const BACKEND = process.env.BACKEND_URL || 'https://psb-securewealth-backend.onrender.com';
const FRONTEND = process.env.FRONTEND_URL || 'https://psb-securewealth-frontend.onrender.com';
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function ping(name, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log(`[keepAlive] ${new Date().toISOString()} ${name} ${res.status} OK`);
  } catch (err) {
    console.error(`[keepAlive] ${new Date().toISOString()} ${name} FAILED — ${err.message}`);
  }
}

function start() {
  // Immediate first ping
  ping('backend', BACKEND + '/ping');
  ping('frontend', FRONTEND);

  setInterval(() => {
    ping('backend', BACKEND + '/ping');
    ping('frontend', FRONTEND);
  }, INTERVAL_MS);
}

if (require.main === module) {
  start();
}

module.exports = { start };
