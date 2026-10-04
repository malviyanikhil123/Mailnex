import nodemailer from 'nodemailer';
import { env } from './env.js';
import { log } from './log.js';

/**
 * Sends you an email when something needs your attention — a key running out,
 * a site asking for a human, an account looking unhappy.
 * Quiet by design: it never throws, so a failed alarm cannot stop a run.
 */

const seen = new Set<string>();   // the same alarm is not repeated in one run

export async function alert(
  subject: string,
  body: string,
  extra: { to?: string | null; html?: string } = {},
): Promise<void> {
  // Alarms repeat; a digest addressed to a particular person does not.
  const key = `${subject}|${extra.to ?? ''}`;
  if (!extra.html && seen.has(key)) return;
  seen.add(key);

  const to = extra.to ?? env.ALERT_EMAIL ?? env.GMAIL_EMAIL;
  if (!to || !env.GMAIL_EMAIL || !env.GMAIL_APP_PASSWORD) {
    log.warn({ subject }, 'no mailbox set up, so this alarm is only in the log');
    log.warn({ body }, 'alarm');
    return;
  }

  try {
    const post = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: env.GMAIL_EMAIL, pass: env.GMAIL_APP_PASSWORD },
    });
    await post.sendMail({
      from: `Job Autopilot <${env.GMAIL_EMAIL}>`,
      to,
      subject,
      text: `${body}\n\n— Job Autopilot, ${new Date().toLocaleString('en-IN')}`,
    });
    log.info({ subject, to }, 'alarm emailed');
  } catch (err) {
    log.error({ subject, why: err instanceof Error ? err.message : String(err) }, 'could not send the alarm email');
  }
}
