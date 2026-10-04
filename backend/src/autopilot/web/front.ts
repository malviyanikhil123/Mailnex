import express from 'express';
import { fileURLToPath } from 'node:url';
import { log } from '../shared/log.js';

/**
 * Serves the page, and nothing else. Kept apart from the API so either half can be
 * restarted on its own, and so the browser is talking to the API across a real origin
 * boundary now rather than the first day it is hosted properly.
 */
const app = express();
const PORT = Number(process.env.FRONT_PORT ?? 5056);
const API = process.env.API_URL ?? process.env.VITE_API_URL ?? `http://localhost:${process.env.PORT ?? 6002}`;

// The page reads this to find the API. Written here rather than baked into the file,
// so the same page works whoever is serving it.
app.get('/config.js', (_req, res) => {
  res.type('application/javascript').send(`window.AUTOPILOT_API = ${JSON.stringify(API)};\n`);
});

app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url))));

app.listen(PORT, () => log.info({ page: `http://localhost:${PORT}`, api: API }, 'Autopilot page is up'));
