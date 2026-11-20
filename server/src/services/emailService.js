import nodemailer from "nodemailer";

// Sends the same messages the in-app bell shows, to the person's email. Mail is
// best-effort: a failed send is logged and never fails the action that caused
// it. With SMTP_HOST unset nothing is sent and the mail is only logged, so
// development works without an email account.

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, CLIENT_ORIGIN } = process.env;

const transporter = SMTP_HOST
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    })
  : null;

export function sendEmail({ to, subject, text }) {
  const from = MAIL_FROM || SMTP_USER || "CODI-IS <no-reply@codi-is.local>";
  if (!transporter) {
    console.log(`[email not configured] to=${to} subject="${subject}"`);
    return Promise.resolve();
  }
  return transporter
    .sendMail({ from, to, subject, text })
    .catch((err) => console.error(`Email to ${to} failed: ${err.message}`));
}

export function sendNotificationEmail(user, message, label = "CODI-IS") {
  const link = CLIENT_ORIGIN || "http://localhost:5173";
  return sendEmail({
    to: user.email,
    subject: `${label}: ` + (message.length > 70 ? message.slice(0, 67) + "..." : message),
    text: `Hello ${user.fullName},\n\n${message}\n\nSign in to CODI-IS to view it: ${link}\n`,
  });
}
