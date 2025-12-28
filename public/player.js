// MP4 Segments player with segment navigation, quality switching and bandwidth display
const player = document.getElementById("player");
const qualitiesContainer = document.getElementById("qualities");
const qualityDisplay = document.getElementById("currentQuality");
const bandwidthDisplay = document.getElementById("bandwidth");
const segmentsList = document.getElementById("segmentsList");
const segmentInfo = document.getElementById("segmentInfo");
const videoTitle = document.getElementById("videoTitle");
const prevBtn = document.getElementById("prevSegmentBtn");
const nextBtn = document.getElementById("nextSegmentBtn");

let selectedQuality = "auto";
let currentQualityName = null;
let segments = [];
let segmentDuration = 10;
let lastHighlightedIndex = -1;
let currentSegmentIndex = 0;
let isPlaying = false;
let metadata = null;
let abrEnabled = true;
let abrInterval = null;
let manualQuality = null;

// Bandwidth monitoring
const bandwidthMonitor = {
  samples: [],
  maxSamples: 6,
  push(v) {
    this.samples.push(v);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  },
  avg() {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
};

const videoId = new URLSearchParams(location.search).get("v");
if (!videoId) {
  if (segmentsList) segmentsList.innerHTML = '<div class="error-message">No video ID (?v=...)</div>';
  if (qualitiesContainer) qualitiesContainer.innerHTML = '<div class="error-message" style="color:#e53e3e;padding:8px">Missing video</div>';
} else {
  loadVideo(videoId);
}

async function loadVideo(id) {
  try {
    const r = await fetch(`/metadata/${id}`);
    if (!r.ok) throw new Error("Video not found");
    metadata = await r.json();
    if (videoTitle) videoTitle.textContent = metadata.title || "Video";
    document.title = (metadata.title || "Video") + " - Player";
    qualitiesContainer.innerHTML = "";
    addQualityButton("auto", true);
    (metadata.qualities || []).forEach(q => addQualityButton(q.name));
    
    // Démarrer avec auto (meilleure qualité)
    const bestQuality = metadata.qualities && metadata.qualities.length 
      ? metadata.qualities[metadata.qualities.length - 1].name 
      : '360p';
    startStream(id, "auto", bestQuality);
  } catch (e) {
    if (segmentsList) segmentsList.innerHTML = `<div class="error-message">${e.message}</div>`;
  }
}

function addQualityButton(name, active = false) {
  const b = document.createElement("button");
  b.className = "chip" + (active ? " active" : "");
  b.dataset.quality = name;
  b.innerHTML = name === "auto"
    ? '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto'
    : `<i class="fa-solid fa-film"></i> ${name}`;
  b.onclick = () => {
    [...qualitiesContainer.querySelectorAll(".chip")].forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    if (name === "auto") {
      abrEnabled = true;
      manualQuality = null;
    } else {
      abrEnabled = false;
      manualQuality = name;
    }
    const quality = name === "auto" 
      ? (metadata.qualities && metadata.qualities.length ? metadata.qualities[metadata.qualities.length - 1].name : '360p')
      : name;
    switchQualityAtTime(quality);
  };
  qualitiesContainer.appendChild(b);
}

async function startStream(id, qualityMode, actualQuality) {
  selectedQuality = qualityMode;
  currentQualityName = actualQuality;
  bandwidthMonitor.samples = [];
  updateBandwidthBadge(null);
  if (segmentsList) segmentsList.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner"></i><div>Loading segments...</div></div>';
  lastHighlightedIndex = -1;
  currentSegmentIndex = 0;
  
  setQualityBadge(qualityMode === "auto" ? `Auto (${actualQuality})` : actualQuality);
  
  try {
    await fetchSegments(id, actualQuality);
    if (segments.length > 0) {
      loadSegment(0);
      startABR(id);
    }
  } catch (e) {
    if (segmentsList) segmentsList.innerHTML = `<div class="error-message">${e.message}</div>`;
  }
}

function switchQualityAtTime(quality) {
  const currentTime = player.currentTime;
  const currentSegIdx = currentSegmentIndex;
  const offsetInSegment = currentTime % segmentDuration;
  currentQualityName = quality;
  setQualityBadge(quality);
  
  // Re-fetch segments for new quality
  fetchSegments(videoId, quality).then(() => {
    // Load the same segment in new quality
    loadSegment(Math.min(currentSegIdx, segments.length - 1));
  }).catch(e => {
    console.error("Quality switch error:", e);
  });
}

function startABR(id) {
  if (abrInterval) clearInterval(abrInterval);
  if (!abrEnabled) return;
  
  abrInterval = setInterval(async () => {
    if (!abrEnabled || selectedQuality !== "auto") return;
    
    const bandwidth = bandwidthMonitor.avg();
    if (!bandwidth) return;
    
    // Select quality based on bandwidth
    let bestQuality = currentQualityName;
    if (bandwidth > 8000 && metadata.qualities.some(q => q.name === '1080p')) bestQuality = '1080p';
    else if (bandwidth > 4000 && metadata.qualities.some(q => q.name === '720p')) bestQuality = '720p';
    else if (bandwidth > 2000 && metadata.qualities.some(q => q.name === '480p')) bestQuality = '480p';
    else if (metadata.qualities.some(q => q.name === '360p')) bestQuality = '360p';
    
    if (bestQuality !== currentQualityName) {
      switchQualityAtTime(bestQuality);
    }
  }, 3000);
}

function setQualityBadge(text) {
  if (qualityDisplay) {
    qualityDisplay.style.animation = 'none';
    setTimeout(() => {
      qualityDisplay.innerHTML = `<i class="fa-solid fa-video"></i> ${text}`;
      qualityDisplay.style.animation = 'pulse 0.4s ease-out';
    }, 0);
  }
}

function updateBandwidthBadge(kbps) {
  if (!bandwidthDisplay) return;
  if (!kbps) {
    bandwidthDisplay.innerHTML = '<i class="fa-solid fa-signal"></i> — kbps';
    return;
  }
  const rounded = Math.round(kbps);
  const human = rounded >= 1000 ? (rounded / 1000).toFixed(2) + ' Mbps' : rounded + ' kbps';
  bandwidthDisplay.innerHTML = `<i class="fa-solid fa-signal"></i> ${human}`;
}

async function fetchSegments(id, quality) {
  const r = await fetch(`/segments/${id}/${quality}`);
  if (!r.ok) throw new Error("Segments not found");
  const data = await r.json();
  segments = data.segments || [];
  segmentDuration = data.segmentDuration || 10;
  if (segmentInfo) segmentInfo.textContent = `${quality} • ${segments.length} • ${segmentDuration}s`;
  renderSegments();
}

function loadSegment(index) {
  if (!segments.length || index < 0 || index >= segments.length) return;
  
  currentSegmentIndex = index;
  const segment = segments[index];
  const wasPlaying = !player.paused;
  
  // Remove all old event listeners to avoid multiple handlers
  player.removeEventListener("loadeddata", window._onLoadedData || (() => {}));
  player.removeEventListener("progress", window._onProgress || (() => {}));
  player.removeEventListener("ended", window._onEnded || (() => {}));
  
  // Measure bandwidth
  const startTime = performance.now();
  let bytesLoaded = 0;
  
  player.src = segment.mp4Url || segment.url;
  
  const onLoadedData = () => {
    if (wasPlaying || index === 0) {
      player.play().catch(() => {});
    }
    highlightSegment(index);
  };
  
  const onProgress = () => {
    if (player.buffered.length > 0) {
      const loaded = player.buffered.end(0) * (segment.size || 0) / (segment.duration || segmentDuration);
      if (loaded > bytesLoaded) {
        bytesLoaded = loaded;
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed > 0.1) {
          const kbps = (bytesLoaded * 8) / elapsed / 1000;
          if (isFinite(kbps) && kbps > 30 && kbps < 120000) {
            bandwidthMonitor.push(kbps);
            updateBandwidthBadge(bandwidthMonitor.avg());
          }
        }
      }
    }
  };
  
  const onEnded = () => {
    // Auto-advance to next segment with smooth transition
    if (currentSegmentIndex < segments.length - 1) {
      loadSegment(currentSegmentIndex + 1);
    }
  };
  
  // Store handlers globally so they can be removed
  window._onLoadedData = onLoadedData;
  window._onProgress = onProgress;
  window._onEnded = onEnded;
  
  player.addEventListener("loadeddata", onLoadedData, { once: true });
  player.addEventListener("progress", onProgress);
  player.addEventListener("ended", onEnded, { once: true });
}

function renderSegments() {
  if (!segmentsList) return;
  if (!segments.length) {
    segmentsList.innerHTML = '<div class="loading"><div>No segments</div></div>';
    return;
  }
  segmentsList.innerHTML = segments.map((seg, i) => {
    const dur = seg.duration ?? segmentDuration;
    const size = formatSize(seg.size || 0);
    const thumb = seg.thumbnail
      ? `<img src="${seg.thumbnail}" alt="Segment ${i+1}" onerror="this.style.display='none'">`
      : '';
    return `
      <div class="segment-item" data-index="${i}">
        <div class="segment-thumb">${thumb}</div>
        <div>
          <div class="segment-title">Segment ${i+1}</div>
          <div class="segment-meta"><span>${dur.toFixed(1)}s</span> <span class="segment-size">${size}</span></div>
        </div>
      </div>`;
  }).join("");
  segmentsList.querySelectorAll(".segment-item").forEach(el => {
    el.onclick = () => loadSegment(parseInt(el.dataset.index));
  });
}

function highlightSegment(i) {
  if (i === lastHighlightedIndex) return;
  lastHighlightedIndex = i;
  if (!segmentsList) return;
  segmentsList.querySelectorAll(".segment-item").forEach(el => el.classList.remove("active"));
  const el = segmentsList.querySelector(`.segment-item[data-index="${i}"]`);
  if (el) {
    el.classList.add("active");
    const rectList = segmentsList.getBoundingClientRect();
    const rectEl = el.getBoundingClientRect();
    // Smooth scroll with subtle behavior
    if (rectEl.top < rectList.top || rectEl.bottom > rectList.bottom) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
}

prevBtn?.addEventListener("click", () => {
  if (currentSegmentIndex > 0) {
    loadSegment(currentSegmentIndex - 1);
  }
});

nextBtn?.addEventListener("click", () => {
  if (currentSegmentIndex < segments.length - 1) {
    loadSegment(currentSegmentIndex + 1);
  }
});

document.addEventListener("keydown", e => {
  if (e.target.closest("input,textarea,button") || e.target.isContentEditable) return;
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    const num = parseInt(e.key, 10);
    if (num === 0 && segments.length >= 10) loadSegment(9);
    else if (num > 0 && num <= segments.length) loadSegment(num - 1);
    return;
  }
  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      if (e.ctrlKey && currentSegmentIndex > 0) loadSegment(currentSegmentIndex - 1);
      else player.currentTime = Math.max(0, player.currentTime - 5);
      break;
    case "ArrowRight":
      e.preventDefault();
      if (e.ctrlKey && currentSegmentIndex < segments.length - 1) loadSegment(currentSegmentIndex + 1);
      else player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 5);
      break;
    case " ":
      e.preventDefault();
      player.paused ? player.play().catch(()=>{}) : player.pause();
      break;
    case "f": case "F":
      e.preventDefault();
      if (!document.fullscreenElement) player.requestFullscreen?.();
      else document.exitFullscreen?.();
      break;
    case "m": case "M":
      e.preventDefault();
      player.muted = !player.muted;
      break;
  }
});

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  return (bytes/(1024*1024)).toFixed(2) + " MB";
}