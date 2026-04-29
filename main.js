const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const logoPath = path.join(__dirname, 'logo.png');
const WINDOW_WIDTH = 1000;
const WINDOW_HEIGHT = 800;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.zuvisck.phdownloader');
}

function createWindow() {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    maxHeight: WINDOW_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: '#101010',
    title: 'PH Downloader',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: true,
    icon: logoPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const PH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Referer': 'https://www.pornhub.com/',
  'Accept-Language': 'en-US,en;q=0.9',
};

function sanitize(name = '') {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 180) || 'video';
}

function fmtBytes(n) {
  if (!n || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return (n / Math.pow(1024, i)).toFixed(1) + ' ' + u[i];
}

async function fetchVideoInfo(pageUrl) {
  const res = await axios.get(pageUrl, {
    headers: PH_HEADERS,
    timeout: 20000,
    maxRedirects: 5,
  });
  const html = res.data;
  const match = html.match(/var\s+flashvars_\w+\s*=\s*(\{[\s\S]*?"mediaDefinitions"[\s\S]*?\});/);
  if (!match) throw new Error('No video found on this page.');

  let fv;
  try {
    fv = JSON.parse(match[1]);
  } catch {
    throw new Error('Failed to parse video data.');
  }

  if (!Array.isArray(fv.mediaDefinitions) || fv.mediaDefinitions.length === 0) {
    throw new Error('No video formats available.');
  }

  return {
    title: fv.video_title || 'video',
    thumbnail: fv.image_url || fv.thumbs?.[0]?.src || null,
    mediaDefinitions: fv.mediaDefinitions,
  };
}


async function resolveFormats(mediaDefinitions) {
  const formats = [];
  const seen = new Set();

  for (const def of mediaDefinitions) {
    if (!def.videoUrl) continue;

    if (def.videoUrl.includes('/video/get_media')) {
      try {
        const r = await axios.get(def.videoUrl, { headers: PH_HEADERS, timeout: 10000 });
        const items = Array.isArray(r.data) ? r.data : [];
        for (const item of items) {
          if (item.videoUrl && !seen.has(item.videoUrl)) {
            seen.add(item.videoUrl);
            const isHLS = item.videoUrl.includes('.m3u8') || item.format === 'hls';
            formats.push({
              quality: item.quality || 'unknown',
              url: item.videoUrl,
              type: isHLS ? 'hls' : 'mp4',
              label: item.quality ? `${item.quality}p` : 'Unknown',
            });
          }
        }
      } catch (e) {
        console.warn('get_media failed:', e.message);
      }
    } else {
      if (!seen.has(def.videoUrl)) {
        seen.add(def.videoUrl);
        const isHLS = def.videoUrl.includes('.m3u8') || def.format === 'hls';
        const q = def.quality || (def.defaultQuality ? 'default' : 'unknown');
        formats.push({
          quality: q,
          url: def.videoUrl,
          type: isHLS ? 'hls' : 'mp4',
          label: isNaN(parseInt(q)) ? q : `${q}p`,
        });
      }
    }
  }

  return formats.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'mp4' ? -1 : 1;
    return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
  });
}

ipcMain.handle('get-video-info', async (_e, pageUrl) => {
  try {
    const isPH = /pornhub\.com|pornhubpremium\.com|thumbzilla\.com/.test(pageUrl);
    if (!isPH) throw new Error('Invalid URL. Please use a PornHub link.');

    const raw = await fetchVideoInfo(pageUrl);
    const formats = await resolveFormats(raw.mediaDefinitions);

    if (formats.length === 0) throw new Error('No formats found.');

    return { success: true, data: { title: raw.title, thumbnail: raw.thumbnail, formats } };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

const activeDownloads = new Map();

function timemarkToSec(timemark = '') {
  const parts = timemark.replace(',', '.').split(':').map(parseFloat);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(parts[0]) || 0;
}

async function getM3U8Duration(m3u8Url, depth = 0) {
  if (depth > 3) return 0;
  try {
    const res = await axios.get(m3u8Url, { headers: PH_HEADERS, timeout: 12000 });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    if (text.includes('#EXT-X-STREAM-INF')) {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('#')) {
          const variantUrl = line.startsWith('http') ? line : new URL(line, m3u8Url).href;
          return getM3U8Duration(variantUrl, depth + 1);
        }
      }
      return 0;
    }

    let total = 0;
    for (const m of text.matchAll(/#EXTINF:([\d.]+)/g)) {
      total += parseFloat(m[1]);
    }
    return total;
  } catch {
    return 0;
  }
}

ipcMain.handle('download-mp4', async (event, { url, title, folder }) => {
  const id = Date.now().toString();
  const filename = sanitize(title) + '.mp4';
  const destDir = folder || app.getPath('downloads');
  const destPath = path.join(destDir, filename);

  try {
    const res = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        ...PH_HEADERS,
        'Connection': 'keep-alive',
        'Accept-Encoding': 'identity',
      },
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const total = parseInt(res.headers['content-length'] || '0', 10);
    let received = 0;
    let lastEmit = 0;

    const writer = fs.createWriteStream(destPath, { highWaterMark: 4 * 1024 * 1024 });
    activeDownloads.set(id, { type: 'mp4', writer, cancelled: false });

    res.data.on('data', (chunk) => {
      received += chunk.length;
      const now = Date.now();
      if (now - lastEmit > 150) {
        lastEmit = now;
        const pct = total > 0 ? Math.min(Math.round((received / total) * 100), 99) : 0;
        event.sender.send('download-progress', {
          id, pct,
          received: fmtBytes(received),
          total: fmtBytes(total),
          status: 'downloading',
        });
      }
    });

    await new Promise((resolve, reject) => {
      res.data.pipe(writer, { end: true });
      writer.on('finish', resolve);
      writer.on('error', reject);
      res.data.on('error', reject);
    });

    activeDownloads.delete(id);
    event.sender.send('download-progress', { id, pct: 100, status: 'done', path: destPath });
    return { success: true, id, path: destPath };
  } catch (e) {
    activeDownloads.delete(id);
    try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
    return { success: false, error: e.message };
  }
});

ipcMain.handle('download-hls', async (event, { url, title, folder }) => {
  const id = Date.now().toString();
  const filename = sanitize(title) + '.mp4';
  const destDir = folder || app.getPath('downloads');
  const destPath = path.join(destDir, filename);

  event.sender.send('download-progress', {
    id, pct: 0, received: '00:00:00', total: 'Analyzing playlist...', status: 'downloading', hls: true,
  });
  const totalSec = await getM3U8Duration(url);

  const headerStr = Object.entries(PH_HEADERS)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n') + '\r\n';

  return new Promise((resolve) => {
    const cmd = ffmpeg(url)
      .inputOptions([
        '-headers', headerStr,
        '-protocol_whitelist', 'file,http,https,tcp,tls',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2'
      ])
      .outputOptions([
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart'
      ])
      .output(destPath)
      .on('progress', (progress) => {
        const elapsed = timemarkToSec(progress.timemark || '0');
        let pct = 0;
        if (totalSec > 0) {
          pct = Math.min(Math.round((elapsed / totalSec) * 100), 99);
        } else {
          pct = Math.min(Math.round(progress.percent || 0), 99);
        }

        const speed = progress.currentKbps
          ? `${(progress.currentKbps / 1000).toFixed(1)} Mbps`
          : '';

        event.sender.send('download-progress', {
          id, pct,
          received: progress.timemark || '00:00:00',
          total: speed,
          status: 'downloading',
          hls: true,
          totalSec: Math.round(totalSec),
        });
      })
      .on('end', () => {
        activeDownloads.delete(id);
        event.sender.send('download-progress', { id, pct: 100, status: 'done', path: destPath });
        resolve({ success: true, id, path: destPath });
      })
      .on('error', (err) => {
        activeDownloads.delete(id);
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
        event.sender.send('download-progress', { id, status: 'error', error: err.message });
        resolve({ success: false, error: err.message });
      });

    activeDownloads.set(id, { type: 'hls', cmd, cancelled: false });
    cmd.run();
  });
});

ipcMain.handle('open-path', (_e, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('get-downloads-path', () => app.getPath('downloads'));
