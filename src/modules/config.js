// Configuration et constantes
const QUALITY_VARIANTS = [
  { name: "144p",  width: 256,  height: 144,  bitrate: "200k",  audioBitrate: "64k"  },
  { name: "240p",  width: 426,  height: 240,  bitrate: "400k",  audioBitrate: "64k"  },
  { name: "360p",  width: 640,  height: 360,  bitrate: "800k",  audioBitrate: "96k"  },
  { name: "480p",  width: 854,  height: 480,  bitrate: "1400k", audioBitrate: "128k" },
  { name: "720p",  width: 1280, height: 720,  bitrate: "2800k", audioBitrate: "192k" },
  { name: "1080p", width: 1920, height: 1080, bitrate: "5000k", audioBitrate: "256k" },
];

const DEFAULT_SEGMENT_DURATION = 10;
const MIN_SEGMENT_DURATION = 5;
const MAX_SEGMENT_DURATION = 60;
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

module.exports = {
  QUALITY_VARIANTS,
  DEFAULT_SEGMENT_DURATION,
  MIN_SEGMENT_DURATION,
  MAX_SEGMENT_DURATION,
  MAX_FILE_SIZE
};
