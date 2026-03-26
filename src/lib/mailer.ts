import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  secure: false, // STARTTLS on port 587
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM ?? `Scheduler <${process.env.SMTP_USER}>`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Send an org invite notification to an existing user. */
export async function sendOrgInviteEmail({
  toEmail,
  orgName,
  invitedByEmail,
  acceptUrl,
}: {
  toEmail: string;
  orgName: string;
  invitedByEmail: string;
  acceptUrl: string;
}): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: `You've been invited to join ${orgName} on Score Bar`,
    text: [
      `Hi,`,
      ``,
      `${invitedByEmail} has invited you to join the organization "${orgName}" on Score Bar Scheduler.`,
      ``,
      `To accept the invite, open Score Bar and go to your Organization settings:`,
      `${acceptUrl}`,
      ``,
      `If you didn't expect this invite, you can safely ignore this email.`,
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <h2 style="margin:0 0 16px">You've been invited!</h2>
        <p style="margin:0 0 12px">
          <strong>${invitedByEmail}</strong> has invited you to join
          <strong>${orgName}</strong> on Score Bar Scheduler.
        </p>
        <p style="margin:0 0 24px">
          To accept, open Score Bar and check your Organization settings — you'll see the invite waiting there.
        </p>
        <a href="${acceptUrl}"
           style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Open Score Bar
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#888">
          If you didn't expect this invite, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
