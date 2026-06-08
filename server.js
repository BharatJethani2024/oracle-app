const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'Oracle is running' });
});

app.get('/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try { new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const tmpId = `oracle_${Date.now()}`;
  const tmpOut = path.join(os.tmpdir(), `${tmpId}.mp4`);

  try {
    const ytDlp = new YTDlpWrap();
    await ytDlp.execPromise([
      url,
      '-f', 'best[ext=mp4]/best',
      '--no-playlist',
      '--max-filesize', '500m',
      '-o', tmpOut
    ]);

    if (!fs.existsSync(tmpOut)) {
      return res.status(500).json({ error: 'Download failed' });
    }

    const stat = fs.statSync(tmpOut);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="oracle_${tmpId}.mp4"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(tmpOut);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(tmpOut, () => {}));
    stream.on('error', () => fs.unlink(tmpOut, () => {}));

  } catch (err) {
    console.error(err);
    res.status(422).json({ error: 'Could not download this video' });
  }
});

app.listen(PORT, () => console.log(`Oracle running on port ${PORT}`));
