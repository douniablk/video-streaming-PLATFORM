

const video = document.getElementById('video');
const segmentListDiv = document.getElementById('segmentList');
const qualityChipsDiv = document.getElementById('qualitySelect');
const bufferProgress = document.getElementById('bufferProgress');
const bufferStatus = document.getElementById('bufferStatus');
const currentSegmentSpan = document.getElementById('currentSegment');
const abrStatus = document.getElementById('abrStatus');
const alertDiv = document.getElementById('alert');
const qualityBadge = document.getElementById('qualityBadge');
const bandwidthBadge = document.getElementById('bandwidthBadge');
const segmentInfo = document.getElementById('segmentInfo');


const SEGMENTS_API = '/segments'; 
const METADATA_API = '/metadata'; 
const MEDIA_PATH = '/media'; 
const VIDEOS_API = '/videos'; 
const ABR_LEVELS = [
  { label: '1080p', value: '1080p' },
  { label: '720p', value: '720p' },
  { label: '480p', value: '480p' },
  { label: '360p', value: '360p' }
];

let segments = [];
let currentVideo = null;
let currentQuality = 'auto';
let manualQuality = null;
let bufferMap = {};
let segmentThumbnails = [];
let abrEnabled = true;
let abrInterval = null;
let lastBandwidth = null;
let segmentDuration = 4; 
let isSwitchingQuality = false;
let metadata = null; 


async function main() {
  try {
    const videoId = getVideoIdFromQuery();
    if (!videoId) {
      alertDiv.textContent = 'No video selected.';
      return;
    }
    currentVideo = videoId;
    await loadMetadata(videoId);
    await loadSegments(videoId);
    await loadThumbnails(videoId);
    renderSegmentList();
    setupQualitySelector();
    setupVideoEvents();
    startABR();
    playSegmentAt(0);
  } catch (err) {
    showError('Failed to initialize player: ' + err.message);
  }
}


async function loadMetadata(videoId) {
  try {
    const res = await fetch(`${METADATA_API}/${videoId}`);
    if (!res.ok) throw new Error('Failed to fetch metadata');
    metadata = await res.json();
    segmentDuration = metadata.segmentDuration || 10;
  } catch (err) {
    showError('Error loading metadata: ' + err.message);
    throw err;
  }
}

async function loadSegments(videoId) {
  try {
   
    const res = await fetch(`${SEGMENTS_API}/${videoId}`);
    if (!res.ok) throw new Error('Failed to fetch segments');
    const data = await res.json();
    segments = data.segments || [];
    segmentDuration = data.segmentDuration || metadata?.segmentDuration || 10;
    bufferMap = {};
    segments.forEach((s, i) => bufferMap[i] = 'missing');
  } catch (err) {
    showError('Error loading segments: ' + err.message);
    throw err;
  }
}

async function loadThumbnails(videoId) {
  
  segmentThumbnails = segments.map(seg => seg.thumbnail || `/media/${videoId}/thumbnail.jpg`);
}

function renderSegmentList() {
  segmentListDiv.innerHTML = '';
  segments.forEach((seg, idx) => {
    const item = document.createElement('div');
    item.className = 'segment-item' + (idx === 0 ? ' active' : '');
    
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'segment-thumb';
    
    const thumbUrl = segmentThumbnails[idx] || `/media/${currentVideo}/thumbnail.jpg`;
    if (thumbUrl) {
      const img = document.createElement('img');
      img.src = thumbUrl;
      img.onerror = () => img.style.display = 'none';
      thumbDiv.appendChild(img);
    }
    
    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `
      <div class="segment-title">Segment ${idx + 1}</div>
      <div class="segment-meta">
        <span>${(seg.duration || segmentDuration).toFixed(1)}s</span>
        <span class="segment-size">${formatBytes(seg.size || 0)}</span>
      </div>
    `;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'segment-size';
    statusSpan.textContent = bufferMap[idx] || 'missing';
    statusSpan.style.margin = '0';
    
    item.appendChild(thumbDiv);
    item.appendChild(infoDiv);
    item.appendChild(statusSpan);
    item.onclick = () => playSegmentAt(idx);
    segmentListDiv.appendChild(item);
  });
  segmentInfo.textContent = `${segments.length} segments`;
}

function updateSegmentStatus(idx, status) {
  bufferMap[idx] = status;
  renderSegmentList();
}


function setupQualitySelector() {
  if (!metadata || !metadata.qualities) {
    qualityChipsDiv.innerHTML = '<div class="chip active"><i class="fa-solid fa-check"></i> Auto</div>';
    currentQuality = '720p';
    return;
  }
  
  
  const qualityNames = metadata.qualities.map(q => q.name);
  qualityChipsDiv.innerHTML = '<div class="chip active" data-quality="auto"><i class="fa-solid fa-check"></i> Auto</div>' +
    qualityNames.map(q => `<div class="chip" data-quality="${q}">${q}</div>`).join('');
  
 
  currentQuality = qualityNames[qualityNames.length - 1] || '720p';
  qualityBadge.textContent = '🎬 Auto';
  
 
  Array.from(qualityChipsDiv.children).forEach(chip => {
    chip.addEventListener('click', () => {
      const quality = chip.dataset.quality;
      Array.from(qualityChipsDiv.children).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      if (quality === 'auto') {
        abrEnabled = true;
        abrStatus.textContent = 'Auto';
        qualityBadge.innerHTML = '<i class="fa-solid fa-video"></i> Auto';
        manualQuality = null;
      } else {
        abrEnabled = false;
        abrStatus.textContent = quality;
        qualityBadge.innerHTML = `<i class="fa-solid fa-video"></i> ${quality}`;
        manualQuality = quality;
      }
      switchQualityAtCurrentTime();
    });
  });
}

function startABR() {
  if (abrInterval) clearInterval(abrInterval);
  abrInterval = setInterval(async () => {
    if (!abrEnabled) return;
    const bandwidth = await estimateBandwidth();
    lastBandwidth = bandwidth;
    bandwidthBadge.innerHTML = `<i class="fa-solid fa-signal"></i> ${Math.round(bandwidth)} kbps`;
    const bestQuality = selectQualityForBandwidth(bandwidth);
    if (currentQuality !== bestQuality) {
      currentQuality = bestQuality;
      qualityBadge.innerHTML = `<i class="fa-solid fa-video"></i> ${bestQuality}`;
      switchQualityAtCurrentTime();
    }
  }, 5000); 
}

async function estimateBandwidth() {
 
  try {
    const testIdx = Math.floor(video.currentTime / segmentDuration);
    const testQuality = metadata?.qualities?.[metadata.qualities.length - 1]?.name || '720p';
    const url = getSegmentUrl(currentVideo, testQuality, Math.max(0, testIdx));
    const start = performance.now();
    
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); 
    
    const res = await fetch(url, { 
      method: 'HEAD', 
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error('Bandwidth test failed');
    const size = parseInt(res.headers.get('content-length') || '1000000', 10);
    const duration = performance.now() - start;
    const bandwidth = (size * 8) / (duration / 1000) / 1000; 
    return bandwidth;
  } catch (err) {
    console.warn('Bandwidth estimation error:', err.message);
   
    return lastBandwidth || 3000; 
  }
}

function selectQualityForBandwidth(bandwidth) {
  if (!metadata || !metadata.qualities) return '720p';
  
  const qualities = metadata.qualities.map(q => q.name);
  
 
  if (bandwidth > 8000 && qualities.includes('1080p')) return '1080p';
  if (bandwidth > 4000 && qualities.includes('720p')) return '720p';
  if (bandwidth > 2000 && qualities.includes('480p')) return '480p';
  if (qualities.includes('360p')) return '360p';
  
  return qualities[qualities.length - 1] || '720p';
}

function switchQualityAtCurrentTime() {
  const time = video.currentTime;
  const segIdx = Math.floor(time / segmentDuration);
  playSegmentAt(segIdx, time % segmentDuration);
}


function updateBufferBar(loaded, total) {
  const percent = total ? Math.round((loaded / total) * 100) : 0;
  bufferProgress.style.width = percent + '%';
  bufferStatus.textContent = percent + '%';
}

function prebufferSegments(startIdx) {
  
  const nextIdx = startIdx + 1;
  if (nextIdx < segments.length && bufferMap[nextIdx] !== 'loaded' && bufferMap[nextIdx] !== 'loading') {
    bufferMap[nextIdx] = 'loading';
    fetchSegment(nextIdx, getCurrentQuality(), 2).then((blob) => {
      if (blob) {
        updateSegmentStatus(nextIdx, 'buffered');
      } else {
        updateSegmentStatus(nextIdx, 'missing');
      }
    }).catch(() => {
      updateSegmentStatus(nextIdx, 'missing');
    });
  }
}

function getCurrentQuality() {
  return manualQuality || currentQuality || '720p';
}


async function playSegmentAt(idx, offset = 0) {
  try {
    if (idx < 0 || idx >= segments.length) return;
    highlightSegment(idx);
    currentSegmentSpan.textContent = idx + 1;
    updateSegmentStatus(idx, 'loading');
    
    const blob = await fetchSegment(idx, getCurrentQuality(), 1); // Only 1 retry to detect missing faster
    if (!blob) {
      // Segment is missing - mark it and show error
      updateSegmentStatus(idx, 'missing');
      showError(`⚠️ Segment ${idx + 1} is missing in ${getCurrentQuality()} quality!`);
      
      
      setTimeout(() => {
        const nextIdx = idx + 1;
        if (nextIdx < segments.length) {
          alertDiv.innerHTML = '<div class="error-alert"><i class="fa-solid fa-forward"></i> Skipping to next segment...</div>';
          setTimeout(() => playSegmentAt(nextIdx), 1000);
        } else {
          alertDiv.innerHTML = '<div class="error-alert"><i class="fa-solid fa-circle-exclamation"></i> No more segments available</div>';
        }
      }, 2000);
      return;
    }
    
    updateSegmentStatus(idx, 'loaded');
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.currentTime = offset;
    video.play();
    prebufferSegments(idx);
    updateBufferBar(idx + 1, segments.length);
    alertDiv.textContent = '';
  } catch (err) {
    updateSegmentStatus(idx, 'missing');
    showError(`❌ Segment ${idx + 1} failed to load: ${err.message}`);
  }
}

function highlightSegment(idx) {
  Array.from(segmentListDiv.children).forEach((el, i) => {
    if (i === idx) el.classList.add('active');
    else el.classList.remove('active');
  });
}

async function fetchSegment(idx, quality, retries = 1) {
  let lastError = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = getSegmentUrl(currentVideo, quality, idx);
      
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'default' 
      });
      
      clearTimeout(timeoutId);
      
      if (res.status === 404) {
        console.error(`❌ Segment ${idx} not found (404) in quality ${quality}`);
        return null; 
      }
      
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.blob();
    } catch (err) {
      lastError = err;
      
     
      if (err.name === 'AbortError' || err.message.includes('404')) {
        console.error(`Segment ${idx} is missing or timed out in quality ${quality}`);
        return null;
      }
      
      console.warn(`Fetch error for segment ${idx} (attempt ${attempt + 1}/${retries}):`, err.message);
      
      
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
  }
  
  console.error(`❌ Failed to fetch segment ${idx} in quality ${quality} after ${retries} attempts:`, lastError);
  return null;
}

function getSegmentUrl(videoId, quality, idx) {
  
  const segmentFilename = `seg_${String(idx).padStart(3, '0')}.mp4`;
  return `${MEDIA_PATH}/${videoId}/${quality}/${segmentFilename}`;
}

function setupVideoEvents() {
  video.addEventListener('ended', () => {
    const idx = Math.floor((video.currentTime - 0.1) / segmentDuration);
    const nextIdx = Math.min(idx + 1, segments.length - 1);
    if (nextIdx < segments.length && nextIdx !== idx) {
      playSegmentAt(nextIdx);
    }
  });
  
  video.addEventListener('timeupdate', () => {
    const idx = Math.floor(video.currentTime / segmentDuration);
    if (idx >= 0 && idx < segments.length) {
      highlightSegment(idx);
      updateBufferBar(idx + 1, segments.length);
      currentSegmentSpan.textContent = (idx + 1) + ' / ' + segments.length;
    }
  });
  
  video.addEventListener('error', (e) => {
    console.error('Video error:', e);
    showError('Error loading segment. Trying next...');
  });
}


function showError(msg) {
  alertDiv.innerHTML = `<div class="error-alert"><i class="fa-solid fa-circle-exclamation"></i> ${msg}</div>`;
  setTimeout(() => {
    alertDiv.innerHTML = '';
  }, 5000);
}


function getVideoIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v') || params.get('video'); // support both 'v' and 'video' param
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}


main();
