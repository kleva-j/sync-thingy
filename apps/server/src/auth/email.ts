import nodemailer from "nodemailer";
import { Option, Redacted } from "effect";

import type { SmtpConfig } from "../config.ts";

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface EmailSender {
  readonly send: (message: OutgoingEmail) => Promise<void>;
}

export const makeEmailSender = (
  config: Option.Option<SmtpConfig>,
): EmailSender => {
  if (Option.isNone(config)) {
    return {
      send: async () => {
        throw new Error("Email delivery is not configured");
      },
    };
  }

  const { host, port, from, username, password } = config.value;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(username && password
      ? { auth: { user: username, pass: Redacted.value(password) } }
      : {}),
  });

  return {
    send: async ({ to, subject, text }) => {
      await transport.sendMail({ from, to, subject, text });
    },
  };
};
