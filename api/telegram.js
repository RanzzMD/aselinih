/**
 * Vercel serverless function: api/telegram.js
 * - Sends a text message summary
 * - Optionally uploads 'foto_ktp_url' and 'surat_keterangan_url' (data URLs or remote URLs)
 *
 * Required env vars in Vercel Project Settings:
 *   BOT_TOKEN, CHAT_ID
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ ok: false, error: 'MISSING_ENV' });
  }

  try {
    const payload = req.body || {};
    const {
      nama_lengkap = '-',
      nik = '-',
      tempat_lahir = '-',
      tanggal_lahir = '-',
      alamat = '-',
      no_telepon = '-',
      email = '-',
      alasan = '-',
      foto_ktp_url = null,
      surat_keterangan_url = null,
      tanggal_pengajuan = new Date().toISOString(),
      status = 'Menunggu'
    } = payload;

    // Build the text summary
    const lines = [
      '📝 <b>Pengajuan Izin Baru</b>',
      '',
      `👤 <b>Nama</b>: ${nama_lengkap}`,
      `🆔 <b>NIK</b>: ${nik}`,
      `📍 <b>TTL</b>: ${tempat_lahir}, ${tanggal_lahir}`,
      `🏠 <b>Alamat</b>: ${alamat}`,
      `📞 <b>Kontak</b>: ${no_telepon}`,
      `✉️ <b>Email</b>: ${email}`,
      `🗓️ <b>Tanggal Pengajuan</b>: ${new Date(tanggal_pengajuan).toLocaleString('id-ID')}`,
      `🏷️ <b>Status</b>: ${status}`,
      '',
      `✍️ <b>Alasan</b>:\n${alasan}`,
      ''
    ];
    const text = lines.join('\n');

    // Send summary message first
    const sendMessageResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const sendMessageData = await sendMessageResp.json();

    if (!sendMessageData.ok) {
      // log but continue attempting attachments
      console.warn('sendMessage failed', sendMessageData);
    }

    // Helper: detect data URL
    function isDataUrl(s) {
      return typeof s === 'string' && s.startsWith('data:');
    }

    // Helper: convert data URL to {buffer, filename, mime}
    function parseDataUrl(dataUrl, fallbackName = 'file') {
      const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return null;
      const mime = m[1];
      const b64 = m[2];
      const buffer = Buffer.from(b64, 'base64');
      // Attempt to choose extension
      const ext = mime.split('/')[1] ? mime.split('/')[1].split('+')[0] : 'bin';
      const filename = `${fallbackName}.${ext}`;
      return { buffer, filename, mime };
    }

    // Upload a file to Telegram via multipart/form-data using sendPhoto or sendDocument
    async function uploadFile({buffer, filename, mime, method = 'sendDocument', fieldName = 'document', caption = ''}) {
      const formData = new FormData();
      formData.append('chat_id', CHAT_ID);
      if (caption) formData.append('caption', caption);
      // Node's FormData accepts a Blob or Buffer as value; convert Buffer to Blob-like
      // In Vercel/Node 18+ global FormData supports File/Blob, but appending Buffer works too.
      formData.append(fieldName, buffer, filename);

      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        body: formData
      });
      return resp.json();
    }

    // Send foto_ktp_url (prefer sendPhoto for images)
    if (foto_ktp_url) {
      if (isDataUrl(foto_ktp_url)) {
        const parsed = parseDataUrl(foto_ktp_url, 'foto_ktp');
        if (parsed) {
          // sendPhoto prefers 'photo' field and supports images
          try {
            await uploadFile({ buffer: parsed.buffer, filename: parsed.filename, mime: parsed.mime, method: 'sendPhoto', fieldName: 'photo', caption: '📄 Foto KTP' });
          } catch (e) {
            console.warn('failed sending foto_ktp (dataurl):', e);
          }
        }
      } else {
        // remote URL - ask Telegram to fetch by URL using sendPhoto with photo = url
        try {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, photo: foto_ktp_url, caption: '📄 Foto KTP' })
          });
        } catch (e) {
          console.warn('failed sending foto_ktp (url):', e);
        }
      }
    }

    // Send surat_keterangan_url (image -> sendPhoto, pdf/other -> sendDocument)
    if (surat_keterangan_url) {
      if (isDataUrl(surat_keterangan_url)) {
        const parsed = parseDataUrl(surat_keterangan_url, 'surat_keterangan');
        if (parsed) {
          const isImage = parsed.mime.startsWith('image/');
          try {
            if (isImage) {
              await uploadFile({ buffer: parsed.buffer, filename: parsed.filename, mime: parsed.mime, method: 'sendPhoto', fieldName: 'photo', caption: '📎 Surat Keterangan' });
            } else {
              await uploadFile({ buffer: parsed.buffer, filename: parsed.filename, mime: parsed.mime, method: 'sendDocument', fieldName: 'document', caption: '📎 Surat Keterangan' });
            }
          } catch (e) {
            console.warn('failed sending surat_keterangan (dataurl):', e);
          }
        }
      } else {
        // remote URL - use sendDocument to be safe
        try {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, document: surat_keterangan_url, caption: '📎 Surat Keterangan' })
          });
        } catch (e) {
          console.warn('failed sending surat_keterangan (url):', e);
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('telegram error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
