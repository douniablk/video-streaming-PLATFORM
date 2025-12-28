// ...existing code...
// script.js - manager page (upload + playlist)
(function init() {
  const ready = () => {
    // Elements
    const playlistEl = document.getElementById("playlist");
    const refreshBtn = document.getElementById("refreshBtn");
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("videoInput");
    const progressBar = document.getElementById("progressBar");
    const progressFill = document.getElementById("progressFill");
    const uploadStatus = document.getElementById("uploadStatus");
    const videoCount = document.getElementById("videoCount");
    const totalDuration = document.getElementById("totalDuration");

    if (!playlistEl || !dropZone || !fileInput) {
      console.error("Required elements not found in DOM.");
      return;
    }

    let videos = [];
    let playerSelectVideoId = null;
    const playerSelectModal = document.getElementById("playerSelectModal");
    const choosePlayer1Btn = document.getElementById("choosePlayer1");
    const choosePlayer2Btn = document.getElementById("choosePlayer2");
    const chooseCancelBtn = document.getElementById("chooseCancel");
    const chooseCloseHint = document.getElementById("chooseClose");

    // Segment duration slider handler
    const segmentDurationSlider = document.getElementById("segmentDuration");
    const segmentDurationDisplay = document.getElementById("segmentDurationDisplay");
    const dropZoneHint = document.getElementById("dropZoneHint");
    if (segmentDurationSlider && segmentDurationDisplay) {
      segmentDurationSlider.addEventListener("input", (e) => {
        const duration = e.target.value;
        segmentDurationDisplay.textContent = duration + "s";
        if (dropZoneHint) {
          dropZoneHint.textContent = `Processed to HLS (${duration}s segments) with adaptive quality`;
        }
      });
      // Set initial hint
      if (dropZoneHint) {
        dropZoneHint.textContent = `Processed to HLS (${segmentDurationSlider.value}s segments) with adaptive quality`;
      }
    }

    // Prevent browser from opening files when dropped outside the drop zone
    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
      window.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
      document.body.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });

    // ----------------- Playlist load -----------------
    async function loadPlaylist() {
      try {
        const res = await fetch("/videos");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        videos = data.videos || [];
        if (videoCount) videoCount.textContent = `${data.count} video${data.count !== 1 ? 's' : ''}`;
        if (totalDuration) totalDuration.textContent = formatTime(data.totalDuration || 0);
        renderPlaylist();
      } catch (e) {
        console.error("Failed to load playlist:", e);
        playlistEl.innerHTML = `<div style="padding:16px;color:#e53e3e;text-align:center;">Failed to load videos</div>`;
      }
    }

    function renderPlaylist() {
      if (!videos.length) {
        playlistEl.innerHTML = `<div style="padding:16px;color:#718096;text-align:center;">No videos yet. Upload one to start.</div>`;
        return;
      }

      playlistEl.innerHTML = videos.map((v) => {
        const qualitiesCount = v.qualities?.length || 0;
        const segChips = v.totalSegments > 0
          ? `<span style="font-size:12px;color:#667eea;"><i class="fa-solid fa-layer-group"></i> ${v.totalSegments} segments</span>`
          : "";
        return `
          <div class="item" data-id="${v.id}">
            <div class="thumb">
              <img src="${v.thumbnail}" alt="${escapeHtml(v.title)}" onerror="this.style.display='none'">
              <div class="duration">${formatTime(v.duration)}</div>
            </div>
            <div class="meta">
              <div class="title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
              <div class="sub">
                ${v.originalWidth || '?'}x${v.originalHeight || '?'} · ${qualitiesCount} qualitie${qualitiesCount===1?'':'s'}${segChips ? ' · ' + segChips : ''}
              </div>
            </div>
            <div class="actions">
              <button class="btn btn-primary play-btn" data-id="${v.id}" title="Open player">
                <i class="fa-solid fa-external-link-alt"></i>
              </button>
              <button class="btn btn-danger delete-btn" data-id="${v.id}" title="Delete video">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      }).join("");

      // Row click -> open player selection (unless action button)
      [...playlistEl.querySelectorAll(".item")].forEach(item => {
        item.addEventListener("click", (e) => {
          if (e.target.closest(".delete-btn") || e.target.closest(".play-btn")) return;
          const videoId = item.dataset.id;
          showPlayerSelect(videoId);
        });
      });

      // Play button -> open selection instead of directly opening player 1
      [...playlistEl.querySelectorAll(".play-btn")].forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const videoId = btn.dataset.id;
          showPlayerSelect(videoId);
        });
      });

      // Delete button
      [...playlistEl.querySelectorAll(".delete-btn")].forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm("Delete this video?")) return;
          await deleteVideo(btn.dataset.id);
        });
      });
    }

    async function deleteVideo(videoId) {
      try {
        const res = await fetch(`/video/${encodeURIComponent(videoId)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        await loadPlaylist();
      } catch (e) {
        console.error("Delete error:", e);
        alert("Failed to delete video.");
      }
    }

    // ----------------- Upload handlers -----------------
    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", e => {
      const f = e.target.files[0];
      if (f) uploadFile(f);
    });

    ["dragenter","dragover"].forEach(ev => {
      dropZone.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = "#667eea";
        dropZone.style.boxShadow = "0 8px 24px rgba(102,126,234,0.15)";
      });
    });

    ["dragleave","dragend","drop"].forEach(ev => {
      dropZone.addEventListener(ev, e => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = "";
        dropZone.style.boxShadow = "";
      });
    });

    dropZone.addEventListener("drop", e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) uploadFile(f);
    });

    async function uploadFile(file) {
      progressBar.classList.add("active");
      progressFill.style.width = "0%";
      uploadStatus.textContent = `Uploading: ${file.name}`;

      try {
        const { videoId } = await xhrUpload("/upload", file);
        uploadStatus.textContent = "Processing… generating HLS variants";

        // Poll processing status
        await pollProcessing(videoId, (pct, msg) => {
          progressFill.style.width = `${pct}%`;
          uploadStatus.textContent = msg;
        });

        progressFill.style.width = "100%";
        uploadStatus.textContent = "Done.";
        await loadPlaylist();
      } catch (err) {
        console.error(err);
        uploadStatus.textContent = "Upload failed.";
        alert("Upload failed.");
      } finally {
        setTimeout(() => {
          progressBar.classList.remove("active");
          progressFill.style.width = "0%";
          uploadStatus.textContent = "";
        }, 1200);
        fileInput.value = "";
      }
    }

    // Low-level XHR to get upload progress
    function xhrUpload(url, file) {
      return new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append("video", file);
        
        // Add segment duration from slider
        const segmentDuration = document.getElementById("segmentDuration")?.value || "10";
        fd.append("segmentDuration", segmentDuration);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.max(5, Math.min(90, Math.round((e.loaded / e.total) * 90)));
            progressFill.style.width = pct + "%";
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              if (!json || !json.videoId) return reject(new Error("Invalid server response"));
              resolve(json);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(fd);
      });
    }

    // Poll /status/:id until done
    async function pollProcessing(videoId, onUpdate) {
      let pct = 90; // continue after upload
      const step = () => { pct = Math.min(98, pct + Math.random() * 2); };
      while (true) {
        await wait(1500);
        step();
        onUpdate?.(Math.round(pct), "Processing…");
        const res = await fetch(`/status/${encodeURIComponent(videoId)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === "done") {
          onUpdate?.(100, "Finalizing…");
          break;
        } else if (data.status === "not_found") {
          throw new Error("Processing failed");
        }
      }
    }

    // ----------------- Helpers -----------------
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    function formatTime(sec) {
      sec = Math.max(0, Math.floor(sec || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
              : `${m}:${String(s).padStart(2,"0")}`;
    }

    function escapeHtml(s) {
      return (s||"").replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    // ----------------- Init -----------------
    refreshBtn?.addEventListener("click", loadPlaylist);
    loadPlaylist();
    setInterval(loadPlaylist, 30000);

    // ---- Player selection modal logic ----
    function showPlayerSelect(videoId){
      playerSelectVideoId = videoId;
      if (playerSelectModal){
        playerSelectModal.style.display = 'flex';
        setTimeout(()=>{playerSelectModal.querySelector('.player-select-box')?.focus?.();},0);
      }
    }
    function hidePlayerSelect(){
      if (playerSelectModal){
        playerSelectModal.style.display = 'none';
      }
      playerSelectVideoId = null;
    }
    choosePlayer1Btn?.addEventListener('click', ()=>{
      if (!playerSelectVideoId) return;
      window.open(`/player.html?v=${encodeURIComponent(playerSelectVideoId)}`, '_blank');
      hidePlayerSelect();
    });
    choosePlayer2Btn?.addEventListener('click', ()=>{
      if (!playerSelectVideoId) return;
      window.open(`/player2.html?v=${encodeURIComponent(playerSelectVideoId)}`, '_blank');
      hidePlayerSelect();
    });
    chooseCancelBtn?.addEventListener('click', hidePlayerSelect);
    playerSelectModal?.addEventListener('click', (e)=>{
      if (e.target === playerSelectModal) hidePlayerSelect();
    });
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && playerSelectModal?.style.display === 'flex') hidePlayerSelect();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }
})();