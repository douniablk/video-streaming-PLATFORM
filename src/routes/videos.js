const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

/**
 * GET /videos - Liste toutes les vidéos disponibles
 */
router.get("/videos", (req, res) => {
  const mediaDir = path.join(__dirname, "../../media");
  if (!fs.existsSync(mediaDir)) {
    return res.json({ videos: [], totalDuration: 0, totalSize: 0, count: 0 });
  }

  const videos = [];
  let totalSize = 0;

  for (const folder of fs.readdirSync(mediaDir)) {
    const dir = path.join(mediaDir, folder);
    const metaPath = path.join(dir, "metadata.json");
    if (!fs.existsSync(metaPath)) continue;

    try {
      const m = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

      // Calculer la taille du dossier
      let folderSize = 0;
      const calcSize = (dirPath) => {
        for (const entry of fs.readdirSync(dirPath)) {
          const p = path.join(dirPath, entry);
          const st = fs.statSync(p);
          if (st.isDirectory()) calcSize(p);
          else folderSize += st.size;
        }
      };
      calcSize(dir);
      totalSize += folderSize;

      // totalSegments depuis la meilleure qualité
      let totalSegments = 0;
      if (Array.isArray(m.qualities) && m.qualities.length) {
        const best = m.qualities[m.qualities.length - 1];
        totalSegments = best.totalSegments || 0;
      }

      videos.push({
        id: folder,
        title: m.title,
        duration: m.duration,
        originalWidth: m.originalWidth,
        originalHeight: m.originalHeight,
        qualities: m.qualities,
        processedAt: m.processedAt,
        thumbnail: `/media/${folder}/thumbnail.jpg`,
        size: folderSize,
        totalSegments,
        segmentDuration: m.segmentDuration || 10
      });
    } catch (e) {
      console.warn("Bad metadata:", folder, e.message);
    }
  }

  videos.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));
  const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);

  res.json({ videos, totalDuration, totalSize, count: videos.length });
});

/**
 * GET /segments/:id/:quality - Récupère les segments d'une qualité spécifique
 */
router.get("/segments/:id/:quality", (req, res) => {
  const { id, quality } = req.params;
  const videoDir = path.join(__dirname, "../../media", id);
  if (!fs.existsSync(videoDir)) return res.status(404).json({ error: "Video not found" });

  const qualityDir = path.join(videoDir, quality);
  if (!fs.existsSync(qualityDir)) return res.status(404).json({ error: "Quality not found" });

  const segJsonPath = path.join(qualityDir, "segments.json");
  if (!fs.existsSync(segJsonPath)) {
    return res.status(404).json({ error: "Segments not found" });
  }

  const data = JSON.parse(fs.readFileSync(segJsonPath, "utf-8"));
  return res.json({
    videoId: id,
    quality,
    totalSegments: data.totalSegments || (data.segments?.length || 0),
    segmentDuration: data.segmentDuration || 10,
    segments: data.segments || []
  });
});

/**
 * GET /segments/:id - Récupère les segments de la meilleure qualité
 */
router.get("/segments/:id", (req, res) => {
  const { id } = req.params;
  const videoDir = path.join(__dirname, "../../media", id);
  if (!fs.existsSync(videoDir)) return res.status(404).json({ error: "Video not found" });

  const metaPath = path.join(videoDir, "metadata.json");
  if (!fs.existsSync(metaPath)) return res.status(404).json({ error: "Metadata not found" });

  const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  const best = metadata.qualities && metadata.qualities.length ? metadata.qualities[metadata.qualities.length - 1] : null;
  const quality = best?.name || metadata.qualities?.[0]?.name || "360p";
  return res.redirect(`/segments/${id}/${quality}`);
});

/**
 * GET /metadata/:id - Récupère les métadonnées d'une vidéo
 */
router.get("/metadata/:id", (req, res) => {
  const meta = path.join(__dirname, "../../media", req.params.id, "metadata.json");
  if (!fs.existsSync(meta)) return res.status(404).json({ error: "Metadata not found" });
  const data = JSON.parse(fs.readFileSync(meta, "utf-8"));
  res.json(data);
});

/**
 * DELETE /video/:id - Supprime une vidéo
 */
router.delete("/video/:id", (req, res) => {
  const dir = path.join(__dirname, "../../media", req.params.id);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "Video not found" });
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️ Deleted: ${req.params.id}`);
    res.json({ message: "Video deleted successfully" });
  } catch (e) {
    console.error("Delete error:", e);
    res.status(500).json({ error: "Failed to delete video" });
  }
});

module.exports = router;
