import { generateText, generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { z } from 'zod';
import { env } from './env.js';
import { log } from './log.js';
import { alert } from './alert.js';

/**
 * One way in to the AI, with a spare tyre.
 * Gemini is tried first. If its quota runs out, the work moves to OpenRouter
 * and you get one email about it — not one per job.
 */

/**
 * The models to try, in order. The first is the one we want; the rest are spares.
 * LLM_FALLBACK may name several, separated by commas, because free models are flaky by
 * nature — one is rate-limited, the next is overloaded, a third answers. Working down a
 * list is the difference between "the AI is down" and a few seconds' delay.
 */
const CHAIN = [env.LLM_PRIMARY, ...env.LLM_FALLBACK.split(',')].map((m) => m.trim()).filter(Boolean);

const google = env.GEMINI_API_KEY ? createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY }) : null;
const openrouter = env.OPENROUTER_API_KEY ? createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }) : null;

/**
 * A model running on this machine, through Ollama.
 *
 * It costs nothing, has no quota, and the resume never leaves the room — which matters,
 * because what we send it is somebody's work history. Slower than the hosted models and
 * less sure-footed with strict shapes, so it sits in the same chain as everything else
 * and the next model picks up whatever it fumbles.
 */
const ollama = createOpenAICompatible({
  name: 'ollama',
  baseURL: env.OLLAMA_URL,
  // Ollama wants a key in the header and then ignores it.
  apiKey: 'not-needed',
  // Without this it is never told the shape we want, and answers in prose instead.
  supportsStructuredOutputs: true,
});

function pick(spec: string) {
  const [vendor, ...rest] = spec.split(':');
  const name = rest.join(':');
  if (vendor === 'google') {
    if (!google) throw new Error('GEMINI_API_KEY is missing from .env');
    return { model: google(name), label: `gemini/${name}` };
  }
  if (vendor === 'openrouter') {
    if (!openrouter) throw new Error('OPENROUTER_API_KEY is missing from .env');
    return { model: openrouter(name), label: `openrouter/${name}` };
  }
  if (vendor === 'ollama') {
    return { model: ollama(name), label: `ollama/${name}` };
  }
  throw new Error(`Unknown model "${spec}" — use google:…, openrouter:… or ollama:…`);
}

const textOf = (err: unknown) =>
  (err instanceof Error ? `${err.message} ${(err as { cause?: string }).cause ?? ''}` : String(err)).toLowerCase();

/** Out of credit, over the limit, or the key was rejected — you should know about this. */
function isQuotaProblem(err: unknown): boolean {
  return /quota|rate.?limit|429|insufficient|exhaust|billing|credit|expired|api key not valid|invalid api key|401|403/.test(textOf(err));
}

/** Busy, down, or renamed — nothing for you to fix, just use the next one. */
function isTemporaryProblem(err: unknown): boolean {
  return /high demand|overload|unavailable|no longer available|try again later|500|502|503|504|timeout|timed out|aborted|fetch failed|econnreset/.test(textOf(err));
}

/**
 * The model answered, but not in the shape that was asked for.
 *
 * Several of the free models cannot reliably return structured data — they talk their
 * way around it, or wrap the JSON in commentary. That is no different in practice from
 * a model being down, so it is a reason to try the next one rather than to give up.
 */
function isWrongShape(err: unknown): boolean {
  return /failed to process successful response|no object generated|could not parse|invalid json|type validation failed|does not match schema|response did not match/.test(textOf(err));
}

/**
 * How long one attempt may take. Someone is often waiting on the other side of this —
 * the resume screen asks and then sits there — so a model that has gone quiet is
 * abandoned rather than waited on for ever.
 */
const PATIENCE = Number(process.env.LLM_TIMEOUT_MS ?? 240_000);

/** Which model answered last, so the next job starts where the last one succeeded. */
let startAt = 0;
let toldYou = false;

async function withFallback<T>(job: (m: ReturnType<typeof pick>) => Promise<T>, what: string): Promise<T> {
  const order = [...CHAIN.slice(startAt), ...CHAIN.slice(0, startAt)];
  let last: unknown;

  for (const [step, spec] of order.entries()) {
    try {
      const out = await job(pick(spec));
      // Remember what worked, so the whole chain is not walked again next time.
      startAt = CHAIN.indexOf(spec);
      return out;
    } catch (err) {
      last = err;
      const outOfCredit = isQuotaProblem(err);
      if (!outOfCredit && !isTemporaryProblem(err) && !isWrongShape(err)) throw err;

      log.warn({ what, model: spec, why: textOf(err).slice(0, 140), next: order[step + 1] ?? 'nothing left' },
        'that model would not answer — trying the next');

      if (outOfCredit && !toldYou && spec === env.LLM_PRIMARY) {
        toldYou = true;
        await alert(
          'Job Autopilot: the Gemini key has run out',
          `While doing: ${what}

Gemini said:
${textOf(err).slice(0, 200)}

`
          + `The work has moved to the spares (${env.LLM_FALLBACK}) and carries on.
`
          + 'Top up or replace GEMINI_API_KEY in .env when you can.',
        );
      }
    }
  }

  throw last ?? new Error('no model would answer');
}

export async function ask(prompt: string, system?: string): Promise<string> {
  const out = await withFallback(async ({ model, label }) => {
    const res = await generateText({ model, prompt, system, maxRetries: 2, abortSignal: AbortSignal.timeout(PATIENCE) });
    log.debug({ model: label }, 'answered');
    return res.text;
  }, 'writing text');
  return out;
}

/** Same, but the answer must fit a shape you define with zod. */
export async function askFor<T>(schema: z.ZodType<T>, prompt: string, system?: string): Promise<T> {
  return withFallback(async ({ model, label }) => {
    const res = await generateObject({ model, schema, prompt, system, maxRetries: 2, abortSignal: AbortSignal.timeout(PATIENCE) });
    log.debug({ model: label }, 'answered');
    return res.object as T;
  }, 'reading structured data');
}

/** True when something other than the first choice is doing the work. */
export function usingFallback(): boolean {
  return startAt > 0;
}

/** Which model is answering at the moment. */
export function nowUsing(): string {
  return CHAIN[startAt] ?? CHAIN[0] ?? 'none';
}
