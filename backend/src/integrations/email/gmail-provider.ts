/**
 * GmailProvider — Nodemailer-backed EmailProvider implementation for Gmail.
 *
 * Uses a pooled SMTP transport (pool:true, maxConnections:1) to stay within
 * Gmail's concurrency limits while reusing the underlying TCP connection.
 *
 * Credentials are passed in at construction time; the factory (factory.ts)
 * is responsible for sourcing them from settings (decrypted in Phase 11).
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EmailProvider, OutgoingEmail, SendResult } from "./provider.js";

export interface GmailCreds {
  user: string;
  pass: string;
}

export class GmailProvider implements EmailProvider {
  readonly name = "gmail";

  private readonly transporter: Transporter;
  private readonly user: string;

  constructor(creds: GmailCreds) {
    this.user = creds.user;
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 1,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(msg: OutgoingEmail): Promise<SendResult> {
    const info = await this.transporter.sendMail({
      from: this.user,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      attachments: msg.attachments,
    });
    return { messageId: info.messageId as string };
  }
}
