const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getVideoInfo } = require("./videoInfo");
const { generateThumbnail, generateSegmentThumbnail } = require("./thumbnail");
const { QUALITY_VARIANTS } = require("./config");

/**
 * Traite une variante de qualité (encodage MP4 segments)
 * @param {string} inputPath - Chemin de la vidéo source
 * @param {string} outFolder - Dossier de sortie pour cette qualité
 * @param {Object} variant - Objet variant avec les paramètres
 * @param {string} videoId - ID de la vidéo
 * @param {number} segmentDuration - Durée des segments
 * @param {number} videoDuration - Durée totale de la vidéo
 * @returns {Promise<Object>} - Informations sur la qualité traitée
 */
function processVariant(inputPath, outFolder, variant, videoId, segmentDuration = 10, videoDuration = 0) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outFolder, { recursive: true });
    const thumbsDir = path.join(outFolder, "thumbs");
    fs.mkdirSync(thumbsDir, { recursive: true });

    const SEG_SECONDS = segmentDuration;
    const segPattern = path.join(outFolder, "seg_%03d.mp4");

    // Encoder directement en segments MP4
    const args = [
      "-y", "-i", inputPath,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "faster",
      "-profile:v", "main", "-level", "4.0",
      "-pix_fmt", "yuv420p",
      "-b:v", variant.bitrate,
      "-maxrate", variant.bitrate,
      "-bufsize", `${parseInt(variant.bitrate, 10) * 2}k`,
      "-c:a", "aac", "-b:a", variant.audioBitrate,
      "-ar", "48000", "-ac", "2",
      "-vf", `scale=${variant.width}:${variant.height}:flags=bicubic`,
      "-force_key_frames", `expr:gte(t,n_forced*${SEG_SECONDS})`,
      "-sc_threshold", "0",
      "-f", "segment",
      "-segment_time", String(SEG_SECONDS),
      "-reset_timestamps", "1",
      "-segment_format_options", "movflags=+faststart",
      segPattern
    ];

    console.log(`[${variant.name}] 🔄 Encoding MP4 segments (${SEG_SECONDS}s segments)...`);
    const ff = spawn("ffmpeg", args);

    ff.on("close", async (code) => {
      console.log(`[${variant.name}] ${code === 0 ? '✅' : '❌'} MP4 encoding done`);
      if (code !== 0) return reject(new Error(`ffmpeg failed: ${variant.name}`));

      // Construire la liste des segments
      const segmentFiles = fs.readdirSync(outFolder)
        .filter(f => f.startsWith('seg_') && f.endsWith('.mp4'))
        .sort();

      const segments = [];
      let currentTime = 0;

      // Générer les miniatures pour chaque segment
      console.log(`[${variant.name}] 🖼️ Generating ${segmentFiles.length} thumbnails...`);
      
      for (let idx = 0; idx < segmentFiles.length; idx++) {
        const segFile = segmentFiles[idx];
        const segPath = path.join(outFolder, segFile);
        const stats = fs.statSync(segPath);
        
        const thumbPath = path.join(thumbsDir, `seg_${String(idx).padStart(3, '0')}.jpg`);
        const thumbUrl = `/media/${videoId}/${variant.name}/thumbs/seg_${String(idx).padStart(3, '0')}.jpg`;
        
        try {
          await generateSegmentThumbnail(inputPath, thumbPath, currentTime);
        } catch (e) {
          console.warn(`[${variant.name}] ⚠️ Thumbnail ${idx} failed`);
        }

        segments.push({
          index: idx,
          filename: segFile,
          url: `/media/${videoId}/${variant.name}/${segFile}`,
          mp4Url: `/media/${videoId}/${variant.name}/${segFile}`,
          startTime: currentTime,
          duration: SEG_SECONDS,
          size: stats.size,
          thumbnail: fs.existsSync(thumbPath) ? thumbUrl : null
        });

        currentTime += SEG_SECONDS;
      }

      console.log(`[${variant.name}] ✅ Thumbnails generated`);

      const info = {
        name: variant.name,
        width: variant.width,
        height: variant.height,
        bitrate: variant.bitrate,
        audioBitrate: variant.audioBitrate,
        segmentDuration: SEG_SECONDS,
        totalSegments: segments.length
      };

      fs.writeFileSync(path.join(outFolder, "segments.json"), JSON.stringify({
        quality: variant.name,
        segmentDuration: SEG_SECONDS,
        totalSegments: segments.length,
        segments: segments
      }, null, 2));

      resolve(info);
    });

    ff.on("error", err => reject(err));
  });
}

/**
 * Traite une vidéo complète (toutes les qualités)
 * @param {string} inputPath - Chemin du fichier vidéo uploadé
 * @param {string} outDir - Dossier de sortie pour cette vidéo
 * @param {string} videoId - ID unique de la vidéo
 * @param {string} originalName - Nom original du fichier
 * @param {number} segmentDuration - Durée des segments
 * @returns {Promise<void>}
 */
async function processVideo(inputPath, outDir, videoId, originalName, segmentDuration = 10) {
  console.log("🎬 Processing:", inputPath);

  const info = await getVideoInfo(inputPath);
  const available = QUALITY_VARIANTS.filter(v => v.height <= info.height);
  if (available.length === 0) throw new Error("Video resolution too low");

  const metadata = {
    videoId,
    title: (originalName || "video").replace(/\.[^/.]+$/, ""),
    originalWidth: info.width,
    originalHeight: info.height,
    duration: info.duration,
    segmentDuration,
    processedAt: new Date().toISOString(),
    qualities: []
  };

  await generateThumbnail(inputPath, path.join(outDir, "thumbnail.jpg"));

  // Encoder chaque variante
  for (const variant of available) {
    const qInfo = await processVariant(inputPath, path.join(outDir, variant.name), variant, videoId, segmentDuration, info.duration);
    metadata.qualities.push(qInfo);
  }

  // Sauvegarder les métadonnées
  fs.writeFileSync(path.join(outDir, "metadata.json"), JSON.stringify(metadata, null, 2));

  // Nettoyer le fichier temporaire uploadé
  try {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    console.log("🧹 Cleanup done");
  } catch {}
}

module.exports = { 
  processVideo,
  processVariant
};
