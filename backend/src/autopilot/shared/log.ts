import pino from 'pino';

/** Values that must never reach a log line. */
const redact = [
  'DATABASE_URL', 'password', 'pass', 'token', 'key', 'apiKey', 'api_key',
  '*.password', '*.token', '*.key',
];

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: redact, censor: '[hidden]' },
  transport: process.stdout.isTTY ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } : undefined,
});
