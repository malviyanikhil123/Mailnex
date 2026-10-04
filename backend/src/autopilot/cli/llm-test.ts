import { ask, nowUsing } from '../shared/llm.js';
import { log } from '../shared/log.js';
import { env } from '../shared/env.js';

try {
  const reply = await ask('Reply with exactly: ready', 'Answer in as few words as possible.');
  log.info({ model: nowUsing(), reply: reply.trim().slice(0, 40) }, 'AI is reachable');
} catch (err) {
  log.error({ why: err instanceof Error ? err.message.slice(0, 200) : String(err) }, 'AI check failed');
  process.exitCode = 1;
}
