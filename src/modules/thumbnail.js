const { spawn } = require("child_process");

/**
 * Génère une miniature à partir d'une vidéo
 * @param {string} inputPath - Chemin de la vidéo source
 * @param {string} outPath - Chemin de sortie pour la miniature
 * @returns {Promise<void>}
 */
function generateThumbnail(inputPath, outPath) {
  return new Promise((resolve) => {
    const args = [
      "-y", "-ss", "1", 
      "-i", inputPath, 
      "-frames:v", "1", 
      "-vf", "scale=480:-2", 
      "-q:v", "2", 
      outPath
    ];
    const p = spawn("ffmpeg", args);
    p.on("close", () => resolve());
  });
}

/**
 * Génère une miniature pour un segment spécifique
 * @param {string} inputPath - Chemin de la vidéo source
 * @param {string} outPath - Chemin de sortie pour la miniature
 * @param {number} timestamp - Timestamp du segment (en secondes)
 * @returns {Promise<void>}
 */
function generateSegmentThumbnail(inputPath, outPath, timestamp) {
  return new Promise((resolve) => {
    const args = [
      "-y", "-ss", timestamp.toString(), 
      "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=160:-2",
      "-q:v", "3",
      outPath
    ];
    const p = spawn("ffmpeg", args);
    p.on("close", () => resolve());
    p.on("error", () => resolve()); // Ne pas échouer si la génération échoue
  });
}

module.exports = { 
  generateThumbnail, 
  generateSegmentThumbnail 
};
