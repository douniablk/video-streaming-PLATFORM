// server.js - Point d'entrée principal (structure modulaire)
const express = require("express");
const path = require("path");
const os = require("os");

// Import des routes
const videosRouter = require("./src/routes/videos");
const uploadRouter = require("./src/routes/upload");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Middleware de parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "media")));

// Routes
app.use("/", videosRouter);
app.use("/", uploadRouter);

// Page d'accueil
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Démarrage du serveur
let localIP = "localhost";
const ifaces = os.networkInterfaces();
for (const n of Object.keys(ifaces)) {
  for (const net of ifaces[n]) {
    if (net.family === "IPv4" && !net.internal) { 
      localIP = net.address; 
      break; 
    }
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎥 VIDEO STREAMING SERVER              ║
╠═══════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}        ║
║  Network: http://${localIP}:${PORT}       ║
╚═══════════════════════════════════════════╝
  `);
});
