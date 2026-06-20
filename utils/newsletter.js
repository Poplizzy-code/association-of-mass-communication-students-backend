import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM_EMAIL || 'AMACOS Media <media@amacos.ng>'
const BASE_URL = process.env.CLIENT_URL?.split(',')[0]?.trim() || 'https://amacos-axsa.onrender.com'

const PLATFORM_LABELS = { tv: 'AMACOS TV', radio: 'AMACOS Radio', newspaper: 'AMACOS Newspaper', magazine: 'AMACOS Magazine' }

export async function sendPublishedNotification(content, recipientEmails) {
  if (!recipientEmails.length) return
  const platformLabel = PLATFORM_LABELS[content.platform] || content.platform
  const url = `${BASE_URL}/media/content/${content._id}`
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#060d1a;color:#fff;border-radius:12px">
      <div style="margin-bottom:16px">
        <span style="background:#f59e0b;color:#1a3c5e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase">${platformLabel}</span>
      </div>
      <h1 style="font-size:22px;margin:0 0 8px">${content.title}</h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 20px">${content.description || ''}</p>
      <a href="${url}" style="display:inline-block;background:#f59e0b;color:#1a3c5e;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;font-size:14px">Read / Watch Now</a>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0">
      <p style="color:#64748b;font-size:12px">You're receiving this because you subscribed to ${platformLabel} notifications.<br>
      <a href="${BASE_URL}/media/unsubscribe" style="color:#64748b">Manage preferences</a></p>
    </div>`

  // Send in batches of 50
  const chunks = []
  for (let i = 0; i < recipientEmails.length; i += 50) chunks.push(recipientEmails.slice(i, i + 50))
  for (const chunk of chunks) {
    await resend.emails.send({ from: FROM, bcc: chunk, subject: `New on ${platformLabel}: ${content.title}`, html }).catch(console.error)
  }
}

export async function sendWeeklyDigest(contentByPlatform, subscriberMap) {
  // subscriberMap: { 'tv': [email, ...], 'radio': [...], ... }
  const platformEntries = Object.entries(contentByPlatform).filter(([, items]) => items.length > 0)
  if (!platformEntries.length) return { sent: 0 }

  // Build a map: email → platforms they care about
  const emailMap = {}
  for (const [platform, emails] of Object.entries(subscriberMap)) {
    for (const email of emails) {
      if (!emailMap[email]) emailMap[email] = []
      emailMap[email].push(platform)
    }
  }

  const allEmails = Object.keys(emailMap)
  if (!allEmails.length) return { sent: 0 }

  const platformHtml = (platform, items) => `
    <div style="margin-bottom:32px">
      <h2 style="color:#f59e0b;font-size:16px;font-weight:700;text-transform:uppercase;margin:0 0 12px;letter-spacing:1px">${PLATFORM_LABELS[platform]}</h2>
      ${items.slice(0, 5).map(item => `
        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:8px">
          <a href="${BASE_URL}/media/content/${item._id}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">${item.title}</a>
          <p style="color:#94a3b8;font-size:12px;margin:4px 0 0">${item.description?.slice(0, 80) || ''}${(item.description?.length > 80) ? '…' : ''}</p>
        </div>`).join('')}
    </div>`

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#060d1a;color:#fff;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="color:#f59e0b;font-size:24px;margin:0">AMACOS Media</h1>
        <p style="color:#94a3b8;margin:4px 0 0">Weekly Digest</p>
      </div>
      ${platformEntries.map(([p, items]) => platformHtml(p, items)).join('')}
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0">
      <p style="color:#64748b;font-size:12px;text-align:center">
        <a href="${BASE_URL}/media/unsubscribe" style="color:#64748b">Unsubscribe</a> · AMACOS, Adeleke University
      </p>
    </div>`

  const chunks = []
  for (let i = 0; i < allEmails.length; i += 50) chunks.push(allEmails.slice(i, i + 50))
  let sent = 0
  for (const chunk of chunks) {
    const res = await resend.emails.send({ from: FROM, bcc: chunk, subject: 'AMACOS Media Weekly Digest', html }).catch(console.error)
    if (res?.id) sent += chunk.length
  }
  return { sent }
}
