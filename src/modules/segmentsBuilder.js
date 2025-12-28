const fs = require("fs");
const path = require("path");

/**
 * Parse un fichier .m3u8 et construit les métadonnées des segments
 * @param {string} playlistPath - Chemin du fichier .m3u8
 * @param {string} qualityDir - Dossier de la qualité
 * @returns {{segments: Array, segmentDuration: number}}
 */
function buildSegmentsFromM3U8(playlistPath, qualityDir) {
  const content = fs.readFileSync(playlistPath, "utf-8");
  const lines = content.split(/\r?\n/);

  const segments = [];
  let currentDur = null;
  let start = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const durStr = line.substring("#EXTINF:".length).split(",")[0];
      currentDur = parseFloat(durStr);
      if (!isFinite(currentDur)) currentDur = 10;
    } else if (line && !line.startsWith("#")) {
      const filename = line;
      const filePath = path.join(qualityDir, filename);
      const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

      segments.push({
        index: segments.length + 1,
        filename,
        url: `/media/${path.basename(path.dirname(qualityDir))}/${path.basename(qualityDir)}/${filename}`,
        size,
        startTime: +start.toFixed(3),
        endTime: +(start + (currentDur ?? 10)).toFixed(3),
        duration: +(currentDur ?? 10).toFixed(3),
        thumbnail: null,
        mp4Url: null
      });
      start += currentDur ?? 10;
      currentDur = null;
    }
  }

  // Calcul de la durée moyenne des segments
  const durs = segments.map(s => s.duration);
  let segmentDuration = 10;
  if (durs.length > 1) {
    const core = durs.slice(0, durs.length - 1);
    segmentDuration = +(core.reduce((a,b)=>a+b,0) / core.length).toFixed(3);
  } else if (durs.length === 1) {
    segmentDuration = durs[0];
  }

  return { segments, segmentDuration };
}

module.exports = { buildSegmentsFromM3U8 };
