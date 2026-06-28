import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const clientUrl = () => (process.env.CLIENT_URL || '').split(',')[0].trim() || 'http://localhost:5173'
const fromAddress = () => process.env.RESEND_FROM || 'AMACOS Platform <onboarding@resend.dev>'

export const sendVerificationEmail = async (to, fullName, token) => {
  const link = `${clientUrl()}/verify-email?token=${token}`
  const firstName = fullName?.split(' ')[0] || 'there'

  const { error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: 'Verify your AMACOS account',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#060d1a 0%,#1a3c5e 100%);padding:32px 40px;text-align:center">
            <div style="display:inline-flex;align-items:center;gap:10px">
              <div style="width:40px;height:40px;background:#fbbf24;border-radius:12px;display:inline-block;line-height:40px;text-align:center;font-weight:900;color:#1a3c5e;font-size:18px">A</div>
              <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:1px">AMACOS</span>
            </div>
            <p style="color:#60a5fa;font-size:12px;margin:6px 0 0">Adeleke University · Mass Communication</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px">
            <h2 style="color:#1a3c5e;font-size:22px;margin:0 0 8px">Hey ${firstName}! 👋</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
              Welcome to AMACOS — the official digital campus platform for Mass Communication students at Adeleke University.<br><br>
              Click the button below to verify your email address and activate your account.
            </p>
            <div style="text-align:center;margin:32px 0">
              <a href="${link}" style="display:inline-block;background:#fbbf24;color:#1a3c5e;font-weight:800;font-size:15px;padding:14px 36px;border-radius:14px;text-decoration:none;letter-spacing:0.3px">
                Verify My Account
              </a>
            </div>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin:24px 0 0">
              This link expires in <strong>24 hours</strong>. If you didn't create an account, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;text-align:center">
            <p style="color:#9ca3af;font-size:11px;margin:0">© 2026 AMACOS · Built by Bukunmi · Flamedev Studio · NEXUS Team 2026/2027</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })

  if (error) throw new Error(error.message)
}

export const sendWelcomeEmail = async (to, fullName) => {
  const firstName = fullName?.split(' ')[0] || 'there'
  await resend.emails.send({
    from: fromAddress(),
    to,
    subject: "Welcome to AMACOS — you're verified!",
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#060d1a 0%,#1a3c5e 100%);padding:32px 40px;text-align:center">
            <div style="width:40px;height:40px;background:#fbbf24;border-radius:12px;display:inline-block;line-height:40px;text-align:center;font-weight:900;color:#1a3c5e;font-size:18px">A</div>
            <p style="color:#ffffff;font-size:20px;font-weight:800;margin:8px 0 0">AMACOS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;text-align:center">
            <div style="font-size:48px;margin-bottom:16px">🎉</div>
            <h2 style="color:#1a3c5e;font-size:22px;margin:0 0 12px">You're in, ${firstName}!</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">
              Your AMACOS account is now verified and active. Welcome to the Mass Communication campus platform at Adeleke University.<br><br>
              Explore the feed, practice CBT, access resources, and connect with your classmates.
            </p>
            <p style="color:#9ca3af;font-size:12px;margin:24px 0 0">© 2026 AMACOS · NEXUS Team 2026/2027</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })
}
