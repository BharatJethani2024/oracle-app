// ══════════════════════════════════════════════════════
//  BLACKHOLE — Backend Server
//  Stack: Node.js + Express + yt-dlp
//
//  DEPLOY TO RAILWAY:
//  1. Push this file (+ package.json) to a GitHub repo
//  2. Go to railway.app → New Project → Deploy from GitHub
//  3. Railway auto-detects Node.js and starts the server
//  4. Copy the Railway URL into the Blackhole app settings
// ══════════════════════════════════════════════════════

const express = require('express');
const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS: allow your frontend to call this API ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'Blackhole is running', version: '1.0.0' });
});

// ── Check yt-dlp is installed ──
function checkYtDlp() {
  return new Promise((resolve) => {
    exec('yt-dlp --version', (err) => resolve(!err));
  });
}

// ── Get video info (title, ext) before downloading ──
function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', ['--print', '%(title)s|||%(ext)s', '--no-playlist', url], (err, stdout) => {
      if (err) return reject(err);
      const [title, ext] = stdout.trim().split('|||');
      resolve({ title: title || 'video', ext: ext || 'mp4' });
    });
  });
}

// ── Sanitize filename ──
function sanitize(name) {
  return name.replace(/[^\w\s\-\.]/g, '').replace(/\s+/g, '_').substring(0, 100);
}

// ── DOWNLOAD ENDPOINT ──
// GET /download?url=<encoded_video_url>
app.get('/download', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Basic URL validation
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Block non-http(s) schemes
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are allowed' });
  }

  // Check yt-dlp available
  const ytDlpAvailable = await checkYtDlp();
  if (!ytDlpAvailable) {
    return res.status(500).json({ error: 'yt-dlp not installed on server. See setup instructions.' });
  }

  // Temp file path
  const tmpDir = os.tmpdir();
  const tmpId = `bh_${Date.now()}_${Math.random().toString(36).substring(2,8)}`;
  const outputTemplate = path.join(tmpDir, `${tmpId}.%(ext)s`);

  console.log(`[BLACKHOLE] Downloading: ${url}`);

  // yt-dlp args:
  // -f: best mp4 first, fallback to best available
  // --merge-output-format: ensure mp4 output
  // --no-playlist: don't download entire playlists
  // --max-filesize: 500MB safety cap
  // --socket-timeout: avoid hanging forever
  const ytArgs = [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--max-filesize', '500m',
    '--socket-timeout', '30',
    '-o', outputTemplate,
    url
  ];

  execFile('yt-dlp', ytArgs, { timeout: 120000 }, async (err, stdout, stderr) => {
    if (err) {
      console.error('[BLACKHOLE] yt-dlp error:', stderr);
      // Parse common errors into friendly messages
      let msg = 'Download failed';
      if (stderr.includes('Unsupported URL')) msg = 'This URL is not supported';
      else if (stderr.includes('Private video')) msg = 'Video is private';
      else if (stderr.includes('unavailable')) msg = 'Video is unavailable';
      else if (stderr.includes('File is larger')) msg = 'File exceeds 500MB limit';
      return res.status(422).json({ error: msg });
    }

    // Find the output file (yt-dlp resolves the actual extension)
    let outputFile;
    try {
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(tmpId));
      if (!files.length) throw new Error('Output file not found');
      outputFile = path.join(tmpDir, files[0]);
    } catch {
      return res.status(500).json({ error: 'Could not locate downloaded file' });
    }

    // Get video title for a nice filename
    let filename;
    try {
      const info = await getVideoInfo(url);
      filename = `${sanitize(info.title)}.${info.ext}`;
    } catch {
      filename = `blackhole_video_${Date.now()}.mp4`;
    }

    // Stream the file to client
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stat = fs.statSync(outputFile);
    res.setHeader('Content-Length', stat.size);

    const readStream = fs.createReadStream(outputFile);
    readStream.pipe(res);

    // Cleanup temp file after streaming
    readStream.on('end', () => {
      fs.unlink(outputFile, () => {});
      console.log(`[BLACKHOLE] Delivered: ${filename} (${(stat.size/1024/1024).toFixed(1)} MB)`);
    });

    readStream.on('error', (streamErr) => {
      console.error('[BLACKHOLE] Stream error:', streamErr);
      fs.unlink(outputFile, () => {});
    });
  });
});

app.listen(PORT, () => {
  console.log(`[BLACKHOLE] Server running on port ${PORT}`);
});
