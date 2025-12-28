const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { processVideo } = require("../modules/videoProcessor");
const { MAX_FILE_SIZE, MIN_SEGMENT_DURATION, MAX_SEGMENT_DURATION, DEFAULT_SEGMENT_DURATION } = require("../modules/config");

const router = express.Router();

// Configuration de multer pour l'upload
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: MAX_FILE_SIZE }
});

/**
 * POST /upload - Upload et traitement d'une vidéo
 */
router.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No video file uploaded" });
    
    const inputPath = req.file.path;
    const originalName = req.file.originalname || "video.mp4";
    const videoId = uuidv4();
    const outDir = path.join(__dirname, "../../media", videoId);
    fs.mkdirSync(outDir, { recursive: true });

    // Extraire la durée des segments (par défaut 10, plage 5-60)
    let segmentDuration = parseInt(req.body.segmentDuration) || DEFAULT_SEGMENT_DURATION;
    segmentDuration = Math.max(MIN_SEGMENT_DURATION, Math.min(MAX_SEGMENT_DURATION, segmentDuration));
    
    console.log(`📤 Upload: ${originalName} (${(req.file.size / 1024 / 1024).toFixed(2)} MB), segment duration: ${segmentDuration}s`);
    console.log(`[DEBUG] req.body.segmentDuration: ${req.body.segmentDuration}, parsed: ${segmentDuration}`);

    // Lancer le traitement vidéo de manière asynchrone
    processVideo(inputPath, outDir, videoId, originalName, segmentDuration)
      .then(() => console.log(`✅ Processed ${videoId}`))
      .catch(err => {
        console.error("❌ Processing error:", err);
        try {
          fs.rmSync(outDir, { recursive: true, force: true });
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch {}
      });

    res.json({ 
      videoId, 
      statusUrl: `/status/${videoId}`, 
      message: "Upload successful, processing started" 
    });
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

/**
 * GET /status/:id - Vérifie le statut de traitement d'une vidéo
 */
router.get("/status/:id", (req, res) => {
  const id = req.params.id;
  const meta = path.join(__dirname, "../../media", id, "metadata.json");
  const dir = path.join(__dirname, "../../media", id);
  
  if (fs.existsSync(meta)) {
    const data = JSON.parse(fs.readFileSync(meta, "utf-8"));
    return res.json({ status: "done", metadata: data });
  }
  if (fs.existsSync(dir)) return res.json({ status: "processing" });
  return res.json({ status: "not_found" });
});

module.exports = router;
