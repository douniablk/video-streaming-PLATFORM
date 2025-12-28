const { spawn } = require("child_process");

/**
 * Extrait les informations vidéo (largeur, hauteur, durée) via ffprobe
 * @param {string} inputPath - Chemin du fichier vidéo
 * @returns {Promise<{width: number, height: number, duration: number}>}
 */
function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json",
      inputPath
    ];
    
    const p = spawn("ffprobe", args);
    let out = "", err = "";
    
    p.stdout.on("data", d => out += d.toString());
    p.stderr.on("data", d => err += d.toString());
    
    p.on("close", code => {
      if (code !== 0) {
        return reject(new Error("ffprobe failed: " + err));
      }
      
      try {
        const j = JSON.parse(out);
        const s = (j.streams && j.streams[0]) || {};
        const dur = j.format && j.format.duration ? parseFloat(j.format.duration) : 0;
        resolve({ 
          width: s.width || 0, 
          height: s.height || 0, 
          duration: dur || 0 
        });
      } catch (e) { 
        reject(e); 
      }
    });
  });
}

module.exports = { getVideoInfo };
