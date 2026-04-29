const $ = (id) => document.getElementById(id);

let currentFormats = [];
let currentTitle = '';
let outputFolder = null;
let lastDownloadPath = null;
let isDownloading = false;

const states = {
  idle: $('state-idle'),
  loading: $('state-loading'),
  error: $('state-error'),
  video: $('state-video'),
};

function showState(name) {
  Object.entries(states).forEach(([k, el]) => {
    el.classList.toggle('hidden', k !== name);
    if (k === name) el.classList.add('state-visible');
  });
}

function showError(msg) {
  $('error-msg').textContent = msg || 'Unknown error.';
  showState('error');
}

(async () => {
  initBackground();
  showState('idle');

  const dlPath = await window.phAPI.getDownloadsPath();
  $('folder-path').textContent = `Default (${dlPath})`;

  window.phAPI.onProgress(handleProgress);

  $('btn-fetch').addEventListener('click', onFetch);
  $('url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') onFetch(); });
  $('btn-retry').addEventListener('click', () => showState('idle'));
  $('btn-folder').addEventListener('click', onChooseFolder);
  $('btn-download').addEventListener('click', onDownload);
  $('quality-select').addEventListener('change', updateDownloadButton);
  $('btn-open-folder').addEventListener('click', () => {
    if (lastDownloadPath) window.phAPI.openPath(lastDownloadPath);
  });
})();

async function onChooseFolder() {
  const folder = await window.phAPI.chooseFolder();
  if (folder) {
    outputFolder = folder;
    const short = folder.length > 50 ? '...' + folder.slice(-47) : folder;
    $('folder-path').textContent = short;
  }
}

function initBackground() {
  if (!window.particlesJS || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  window.particlesJS('animated-bg', {
    particles: {
      number: {
        value: 42,
        density: { enable: true, value_area: 820 },
      },
      color: { value: '#ff9000' },
      shape: { type: 'circle' },
      opacity: {
        value: 0.26,
        random: true,
      },
      size: {
        value: 2.4,
        random: true,
      },
      line_linked: {
        enable: true,
        distance: 126,
        color: '#ff9000',
        opacity: 0.12,
        width: 1,
      },
      move: {
        enable: true,
        speed: 0.72,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
      },
    },
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: { enable: true, mode: 'grab' },
        onclick: { enable: false },
        resize: true,
      },
      modes: {
        grab: {
          distance: 120,
          line_linked: { opacity: 0.22 },
        },
      },
    },
    retina_detect: true,
  });
}

async function onFetch() {
  const url = $('url-input').value.trim();
  if (!url) {
    showError('Please enter a valid PornHub link.');
    return;
  }

  if (isDownloading) return;

  showState('loading');
  $('btn-fetch').disabled = true;

  const res = await window.phAPI.getVideoInfo(url);
  $('btn-fetch').disabled = false;

  if (!res.success) {
    showError(res.error);
    return;
  }

  const { title, thumbnail, formats } = res.data;
  currentTitle = title;
  currentFormats = formats;

  renderVideo(title, thumbnail, formats);
  showState('video');
}

function renderVideo(title, thumbnail, formats) {
  $('video-title').textContent = title;

  const img = $('thumb');
  const ph = $('thumb-ph');
  if (thumbnail) {
    img.onload = () => ph.classList.add('hidden');
    img.onerror = () => { ph.classList.remove('hidden'); img.style.opacity = '0'; };
    img.src = thumbnail;
    img.style.opacity = '1';
  } else {
    ph.classList.remove('hidden');
  }

  const mp4Count = formats.filter(f => f.type === 'mp4').length;
  const hlsCount = formats.filter(f => f.type === 'hls').length;
  const badge = $('format-badge');
  badge.innerHTML = '';
  if (mp4Count > 0) badge.innerHTML += `<span class="badge badge-mp4">${mp4Count} resolutions found</span>`;
  if (hlsCount > 0) badge.innerHTML += `<span class="badge badge-hls">${hlsCount} resolutions found</span>`;

  const sel = $('quality-select');
  sel.innerHTML = '';

  const mp4 = formats.filter(f => f.type === 'mp4');
  const hls = formats.filter(f => f.type === 'hls');
  let idx = 0;

  if (mp4.length > 0 && hls.length > 0) {
    const g1 = document.createElement('optgroup');
    g1.label = 'MP4 - Direct download';
    mp4.forEach((fmt) => {
      const o = document.createElement('option');
      o.value = idx++;
      o.textContent = formatLabel(fmt);
      g1.appendChild(o);
    });
    sel.appendChild(g1);

    const g2 = document.createElement('optgroup');
    g2.label = 'HLS - Conversion via ffmpeg';
    hls.forEach((fmt) => {
      const o = document.createElement('option');
      o.value = idx++;
      o.textContent = formatLabel(fmt) + ' (MP4)';
      g2.appendChild(o);
    });
    sel.appendChild(g2);
  } else {
    formats.forEach((fmt) => {
      const o = document.createElement('option');
      o.value = idx++;
      o.textContent = formatLabel(fmt) + (fmt.type === 'hls' ? ' (MP4)' : '');
      sel.appendChild(o);
    });
  }

  resetDownloadUI();
  updateDownloadButton();
}

function formatLabel(fmt) {
  const q = parseInt(fmt.quality);
  return (!isNaN(q) && q > 0) ? `${q}p` : (fmt.label || fmt.quality || 'Default');
}

function updateDownloadButton() {
  const idx = parseInt($('quality-select').value);
  const fmt = currentFormats[idx];
  if (!fmt) return;

  const isHLS = fmt.type === 'hls';
  $('hls-notice').classList.toggle('hidden', !isHLS);

  const btn = $('btn-download');
  if (isHLS) {
    btn.style.background = 'linear-gradient(135deg, #c97200, #a85e00)';
    $('btn-label').textContent = 'Download';
  } else {
    btn.style.background = '';
    $('btn-label').textContent = 'Download';
  }
}

async function onDownload() {
  if (isDownloading) return;
  const idx = parseInt($('quality-select').value);
  const fmt = currentFormats[idx];
  if (!fmt) return;

  isDownloading = true;
  $('btn-download').disabled = true;
  $('btn-fetch').disabled = true;
  $('done-wrap').classList.add('hidden');
  $('progress-wrap').classList.remove('hidden');
  setProgress(0, 'Starting...', '');

  const opts = { url: fmt.url, title: currentTitle, folder: outputFolder || null };

  let res;
  if (fmt.type === 'hls') {
    $('btn-label').textContent = 'Converting video...';
    res = await window.phAPI.downloadHLS(opts);
  } else {
    $('btn-label').textContent = 'Downloading...';
    res = await window.phAPI.downloadMP4(opts);
  }

  isDownloading = false;
  $('btn-fetch').disabled = false;
  $('btn-download').disabled = false;

  if (!res.success) {
    $('progress-wrap').classList.add('hidden');
    showError('Download failed: ' + res.error);
    resetDownloadUI();
  }
}

function handleProgress(data) {
  if (data.status === 'downloading') {
    let mainText, sub;

    if (data.hls) {
      if (data.pct === 0 && (!data.totalSec || data.totalSec === 0)) {
        mainText = 'Analyzing playlist...';
        sub = '';
      } else {
        mainText = `Converting video... ${data.pct}%`;
        const elapsed = data.received || '00:00:00';
        const totalFmt = data.totalSec ? fmtSec(data.totalSec) : '?';
        const speed = data.total ? ` - ${data.total}` : '';
        sub = `Time: ${elapsed} / ${totalFmt}${speed}`;
      }
    } else {
      mainText = `Downloading... ${data.pct}%`;
      sub = `${data.received} / ${data.total}`;
    }

    setProgress(data.pct, mainText, sub);

  } else if (data.status === 'done') {
    lastDownloadPath = data.path;
    $('progress-wrap').classList.add('hidden');
    $('done-wrap').classList.remove('hidden');
    $('btn-label').textContent = 'Download video';
    updateDownloadButton();

  } else if (data.status === 'error') {
    $('progress-wrap').classList.add('hidden');
    showError(data.error || 'Download error.');
    resetDownloadUI();
  }
}

function fmtSec(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function setProgress(pct, text, sub) {
  $('progress-bar').style.width = `${pct}%`;
  $('progress-text').textContent = text;
  $('progress-pct').textContent = `${pct}%`;
  $('progress-sub').textContent = sub || '';
}

function resetDownloadUI() {
  isDownloading = false;
  $('btn-download').disabled = false;
  $('btn-fetch').disabled = false;
  $('btn-label').textContent = 'Download video';
  $('progress-wrap').classList.add('hidden');
  $('progress-bar').style.width = '0%';
  updateDownloadButton();
}
