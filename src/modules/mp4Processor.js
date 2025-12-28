const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Crée un fichier MP4 complet pour une variante et le découpe en segments MP4
 * @param {string} inputPath - Chemin de la vidéo source
 * @param {string} outFolder - Dossier de sortie de la qualité
 * @param {Object} variant - Objet variant avec les paramètres de qualité
 * @param {string} videoId - ID de la vidéo
 * @param {number} segSeconds - Durée des segments en secondes
 * @returns {Promise<void>}
 */
function createMp4SegmentsForVariant(inputPath, outFolder, variant, videoId, segSeconds = 10) {
  return new Promise((resolve, reject) => {
    const fullMp4 = path.join(outFolder, "full.mp4");
    const mp4SegDir = path.join(outFolder, "mp4");
    fs.mkdirSync(mp4SegDir, { recursive: true });

    // 1) Encoder en MP4 (mêmes paramètres que HLS) avec faststart et keyframes alignés
    const args1 = [
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
      "-force_key_frames", `expr:gte(t,n_forced*${segSeconds})`,
      "-sc_threshold", "0",
      "-movflags", "+faststart",
      fullMp4
    ];

    console.log(`[${variant.name}] ▶️ Creating full MP4...`);
    const p1 = spawn("ffmpeg", args1);
    
    p1.on("close", (code) => {
      if (code !== 0) return reject(new Error("Failed to create full MP4"));

      // 2) Découper en segments de X secondes (.mp4) sans ré-encoder
      console.log(`[${variant.name}] ✂️ Splitting MP4 into ${segSeconds}s segments...`);
      const args2 = [
        "-y", "-i", fullMp4,
        "-c", "copy",
        "-map", "0",
        "-f", "segment",
        "-segment_time", String(segSeconds),
        "-reset_timestamps", "1",
        "-segment_format_options", "movflags=+faststart",
        path.join(mp4SegDir, "seg_%03d.mp4")
      ];
      
      const p2 = spawn("ffmpeg", args2);
      p2.on("close", (code2) => {
        if (code2 !== 0) return reject(new Error("Failed to split MP4 segments"));
        console.log(`[${variant.name}] ✅ MP4 segments ready`);
        resolve();
      });
      p2.on("error", reject);
    });
    
    p1.on("error", reject);
  });
}

module.exports = { createMp4SegmentsForVariant };
