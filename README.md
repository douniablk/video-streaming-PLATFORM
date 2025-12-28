# 📺 STREAMING VIDÉO PLATFORM

---

## 🎬 SERVEUR (server_modular.js)

### 1. Qu'est-ce que le serveur fait ?

Ton serveur est un **serveur de streaming vidéo** qui :
- ✅ Reçoit des vidéos uploadées
- ✅ Les **découpe en petits morceaux** (segments) de différentes qualités (360p, 480p, 720p, 1080p)
- ✅ Stocke ces segments dans des dossiers organisés
- ✅ Envoie ces segments au player à la demande
- ✅ Fournit les métadonnées (durée, résolution, qualités disponibles, etc.)

**C'est comme Netflix :** tu upload une vidéo, le serveur la prépare, et le player la regarde en demandant les morceaux progressivement.

---

### 2. Endpoints principaux

| Endpoint | Méthode | Que fait-il ? | Exemple |
|----------|---------|---|---|
| `/upload` | POST | Reçoit une vidéo et lance sa conversion | Upload `film.mp4` → génère segments |
| `/videos` | GET | Liste toutes les vidéos disponibles | Répond : `[{id, title, duration, ...}]` |
| `/segments/:id/:quality` | GET | Récupère la liste des segments d'une qualité | `/segments/abc123/720p` → liste des 100 segments |
| `/segments/:id` | GET | Redirige vers la meilleure qualité | `/segments/abc123` → redirige vers `/segments/abc123/1080p` |
| `/metadata/:id` | GET | Récupère les infos de la vidéo | Répond : durée, résolution, qualités, etc. |
| `/video/:id` | DELETE | Supprime une vidéo | Efface le dossier complet |
| `/media/:videoId/:quality/seg_000.mp4` | GET | **Serve le segment réel** | Envoie le fichier binaire du segment |

---

### 3. Requête HTTP : Qu'est-ce que le player demande ?

Quand le player veut regarder une vidéo, il fait ces requêtes dans cet ordre :

#### Étape 1 : Récupère la liste des vidéos
```http
GET /videos HTTP/1.1
Host: localhost:3000

Réponse :
{
  "videos": [
    {
      "id": "f1400c3b-e0ee-4e62-9a3e-57f162821e4e",
      "title": "My Video",
      "duration": 120,
      "qualities": [
        { "name": "360p", "totalSegments": 30 },
        { "name": "720p", "totalSegments": 30 }
      ],
      "segmentDuration": 4
    }
  ]
}
```

#### Étape 2 : Récupère les métadonnées
```http
GET /metadata/f1400c3b-e0ee-4e62-9a3e-57f162821e4e HTTP/1.1

Réponse :
{
  "title": "My Video",
  "duration": 120,
  "qualities": [
    { "name": "360p", "width": 640, "height": 360 },
    { "name": "720p", "width": 1280, "height": 720 }
  ],
  "segmentDuration": 4
}
```

#### Étape 3 : Récupère la liste des segments
```http
GET /segments/f1400c3b-e0ee-4e62-9a3e-57f162821e4e/720p HTTP/1.1

Réponse :
{
  "videoId": "f1400c3b-e0ee-4e62-9a3e-57f162821e4e",
  "quality": "720p",
  "totalSegments": 30,
  "segmentDuration": 4,
  "segments": [
    { "index": 0, "duration": 4, "size": 450000 },
    { "index": 1, "duration": 4, "size": 420000 },
    ...
  ]
}
```

#### Étape 4 : Télécharge les segments un par un
```http
GET /media/f1400c3b-e0ee-4e62-9a3e-57f162821e4e/720p/seg_000.mp4 HTTP/1.1

Réponse : [DONNÉES BINAIRES DU SEGMENT - ~400-500 KB]
```

---

### 4. Réponse HTTP : Qu'est-ce que le serveur répond ?

Le serveur envoie deux types de réponses :

#### A) **Réponse JSON** (métadonnées)
```javascript
{
  "videoId": "abc123",
  "quality": "720p",
  "totalSegments": 100,
  "segmentDuration": 4,
  "segments": [...]
}
```
✅ Petit fichier
✅ Contient les infos
❌ Pas la vidéo elle-même

#### B) **Réponse binaire** (segments vidéo)
```javascript
GET /media/abc123/720p/seg_000.mp4

// Le serveur envoie :
[FILE BINAIRE] → ~400-500 KB
```
✅ Gros fichier
✅ C'est la vraie vidéo
✅ Le player peut la jouer directement

---

### 5. Range Requests : C'est quoi ? Pourquoi ?

#### C'est quoi ?
Un **range request** permet de **télécharger seulement une partie d'un fichier**, pas le fichier entier.

#### Pourquoi ?
1. **Tu accélères le tuto vidéo** → besoin que d'un petit bout
2. **Mauvais réseau** → tu peux reprendre au bon endroit
3. **Optimisation bande passante** → ne télécharge que ce que tu regardes

#### Exemple :
```http
// Normal
GET /media/abc123/720p/seg_000.mp4
← Envoie 500 KB

// Avec Range Request
GET /media/abc123/720p/seg_000.mp4
Range: bytes=0-99999
← Envoie seulement 100 KB (le début)
```

#### Dans ton code :
Express sert les fichiers statiques avec `/media`, et les navigateurs modernes supportent les range requests automatiquement. Si un segment fait 500 KB et le player demande `bytes=0-249999`, le serveur répond avec seulement les 250 premiers KB.

---

---

## 🎥 PLAYER 2 (player2.js)

### 1. Qu'est-ce que player2 fait ?

C'est un **lecteur vidéo intelligent** qui :
- 📊 **Télécharge segment par segment** (pas la vidéo entière)
- 📈 **Adapte la qualité à ta connexion** (ABR)
- 🔄 **Essaie à nouveau si un segment échoue** (Retry logic)
- 📦 **Pré-charge les segments suivants** (Prebuffering)
- 📺 **Affiche des infos en temps réel** (Qualité, bande passante, buffer)

**C'est comme YouTube :** il regarde ta vitesse Internet et baisse la qualité si ça lag.

---

### 2. Cycle de vie du player2

```
┌─────────────────────────────────────────────────────────────┐
│                      INITIALIZATION                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    main() [Ligne 40]
                              ↓
        ┌───────────────────────────────────────────┐
        ↓                                           ↓
  loadMetadata()                            loadSegments()
  Récupère infos                            Récupère liste
                                                    ↓
                            ┌──────────────────────┴───────────────────┐
                            ↓                                          ↓
                    loadThumbnails()                        renderSegmentList()
                    Charge les images                       Affiche les segments
                                                                      ↓
                                            ┌──────────────────────────┴───────┐
                                            ↓                                  ↓
                                    setupQualitySelector()              setupVideoEvents()
                                    Boutons qualité                     Écoute la vidéo
                                                                              ↓
                                                                       ┌──────┴────────┐
                                                                       ↓               ↓
                                                                    'ended'      'timeupdate'
                                                                    'error'
                                                                              ↓
                                                                    startABR() [Toutes les 5s]
                                                                    Mesure bande passante
                                                                    Change qualité si besoin
                                                                              ↓
                                                                  ┌─────────────────────┐
                                                                  │   playSegmentAt()   │
                                                                  │ Lance un segment    │
                                                                  └─────────────────────┘
                                                                              ↓
                                                                  ┌─────────────────────┐
                                                                  │ fetchSegment()      │
                                                                  │ Télécharge le seg   │
                                                                  │ (3 tentatives)      │
                                                                  └─────────────────────┘
                                                                              ↓
                                                                  ┌─────────────────────┐
                                                                  │  Video joue         │
                                                                  │ prebufferSegments() │
                                                                  │ pré-charge suivant  │
                                                                  └─────────────────────┘
```

#### Les étapes clés :
1. **main()** → Lance tout (ligne 40)
2. **loadMetadata()** → Récupère infos de la vidéo
3. **loadSegments()** → Récupère la liste des segments
4. **renderSegmentList()** → Affiche les segments dans la sidebar
5. **setupQualitySelector()** → Crée les boutons qualité
6. **setupVideoEvents()** → Écoute les événements (play, pause, fin)
7. **startABR()** → Boucle qui mesure la bande passante toutes les 5s
8. **playSegmentAt()** → Lance un segment
9. **fetchSegment()** → Télécharge le segment (avec retry)

---

### 3. Buffer : Qu'est-ce que c'est ? Comment ça marche ?

#### Définition simple
Le **buffer** = les segments qu'on a déjà téléchargés et prêts à jouer.

```
┌─────────────────────────────────────────────────────────┐
│  Segments: [0] [1] [2] [3] [4] [5] [6] [7] [8] [9]     │
│            └──────────────────┘ ↑                       │
│            Segments en mémoire  │                       │
│            (BUFFER)             Tu regardes ici        │
└─────────────────────────────────────────────────────────┘
```

#### Comment ça marche dans ton code ?

```javascript
// bufferMap = un objet qui trace l'état de chaque segment
bufferMap = {
  0: "loaded",    // ✅ Segment 0 téléchargé
  1: "buffered",  // ✅ Segment 1 en attente
  2: "loading",   // ⏳ Segment 2 en cours de téléchargement
  3: "missing",   // ❌ Segment 3 échoué
  4: "missing"    // ❌ Segment 4 pas encore téléchargé
}
```

#### updateBufferBar() [Ligne 222]
```javascript
updateBufferBar(loaded, total) {
  // Exemple : loaded=3, total=10
  // Affiche 30% dans la barre de progression
  const percent = (3 / 10) * 100 = 30%
  bufferProgress.style.width = "30%"
}
```

#### prebufferSegments() [Ligne 224]
```javascript
// Quand tu regardes le segment 5,
// on pré-charge le segment 6 en arrière-plan
prebufferSegments(5) {
  fetchSegment(6, quality)  // Lance le téléchargement du segment 6
}
```

---

### 4. Adaptive Bitrate (ABR) : Pourquoi changer la qualité ? Comment ?

#### Pourquoi ?
1. **Connexion rapide** (100 Mbps) → 1080p sans lag
2. **Connexion lente** (2 Mbps) → 360p pour pas freezer
3. **Connexion instable** → Baisse la qualité si ça lag

#### Comment ça fonctionne dans ton code ?

##### Étape 1 : Mesurer la bande passante [Ligne 287]
```javascript
async function estimateBandwidth() {
  const start = performance.now()
  
  // Télécharge un segment test (HEAD request = juste les infos)
  const size = 500000  // 500 KB
  const duration = 1000  // 1 seconde
  
  // Calcul : (bits) / (secondes) = bps → kbps
  const bandwidth = (500000 * 8) / (1000 / 1000) / 1000
                  = 4000 kbps = 4 Mbps
  
  return 4000
}
```

##### Étape 2 : Choisir la qualité [Ligne 310]
```javascript
selectQualityForBandwidth(4000) {
  // bande passante = 4000 kbps = 4 Mbps
  
  if (bandwidth > 8000)  // > 8 Mbps → 1080p
    return "1080p"
  
  if (bandwidth > 4000)  // > 4 Mbps → 720p
    return "720p"
  
  if (bandwidth > 2000)  // > 2 Mbps → 480p
    return "480p"
  
  // Sinon → 360p (la plus faible)
  return "360p"
}
```

##### Étape 3 : Boucle ABR [Ligne 312]
```javascript
startABR() {
  setInterval(() => {
    const bandwidth = await estimateBandwidth()
    const bestQuality = selectQualityForBandwidth(bandwidth)
    
    if (currentQuality !== bestQuality) {
      // Qualité a changé ! Re-télécharge le segment actuel
      switchQualityAtCurrentTime()
    }
  }, 5000)  // Toutes les 5 secondes
}
```

##### Résumé du flux ABR :
```
┌──────────────────┐
│ Mesure bande     │ → 4000 kbps
│ passante (HEAD)  │
└────────┬─────────┘
         ↓
┌──────────────────────────────┐
│ selectQualityForBandwidth()  │ → "720p"
└────────┬─────────────────────┘
         ↓
┌──────────────────────────────┐
│ Qualité != currentQuality ?  │ → OUI
└────────┬─────────────────────┘
         ↓
┌──────────────────────────────┐
│ switchQualityAtCurrentTime() │ → Re-télécharge
└──────────────────────────────┘
```

---

### 5. Retry Logic : Si un segment échoue, qu'est-ce qu'on fait ?

#### Qu'est-ce qui peut échouer ?
- 🌐 Serveur down
- 📡 Réseau coupé
- ⏱️ Timeout (trop lent)
- 💾 Segment corrompu

#### Stratégie : Essayer 3 fois [Ligne 337]

```javascript
async function fetchSegment(idx, quality, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Tentative 1
      const res = await fetch(url, { timeout: 10000 })
      return await res.blob()
    } catch (err) {
      // Échoué !
      console.warn(`Attempt ${attempt + 1}/3 failed`)
      
      if (attempt < retries - 1) {
        // Attendre avant de réessayer (exponential backoff)
        // Tentative 1 échouée → attendre 0.5s
        // Tentative 2 échouée → attendre 1s
        // Tentative 3 échouée → attendre 2s
        await sleep(Math.pow(2, attempt) * 500)
      }
    }
  }
  
  // 3 tentatives échouées → retourner null
  return null
}
```

#### Fallback Quality [Ligne 370]

Si le segment échoue en 720p, essayer en 360p (plus petit, plus rapide) :

```javascript
async function playSegmentAt(idx) {
  try {
    const blob = await fetchSegment(idx, "720p")
    
    if (!blob) {
      // 720p échoué → essayer 360p
      console.warn("Retrying segment with fallback quality")
      const fallbackBlob = await fetchSegment(idx, "360p", 2)
      
      if (fallbackBlob) {
        video.src = URL.createObjectURL(fallbackBlob)
        video.play()
        alertDiv.textContent = "Loaded 360p (network issues)"
        return
      }
    }
  } catch (err) {
    showError("Segment failed. Check your network.")
  }
}
```

#### Résumé du flux Retry :
```
┌──────────────────────────────┐
│ Télécharge segment 5 (720p)  │
└────────┬─────────────────────┘
         ↓ ÉCHOUE
┌──────────────────────────────┐
│ Tentative 2 (après 0.5s)     │
└────────┬─────────────────────┘
         ↓ ÉCHOUE
┌──────────────────────────────┐
│ Tentative 3 (après 1s)       │
└────────┬─────────────────────┘
         ↓ ÉCHOUE
┌──────────────────────────────┐
│ 3 tentatives 720p échouées   │
│ Essayer fallback (360p)      │
└────────┬─────────────────────┘
         ↓ SUCCÈS !
┌──────────────────────────────┐
│ Joue le segment en 360p      │
│ Affiche "network issues"     │
└──────────────────────────────┘
```

---

---

## 🔄 COMMUNICATION CLIENT-SERVEUR

### Flux complet : Player demande → Serveur répond

```
PLAYER                                          SERVEUR
  │                                                │
  ├──────────────────────────────────────────────→│
  │     GET /metadata/abc123                      │
  │                                                │
  │←────────────────────────────────────────────┤
  │    {duration, qualities, segmentDuration}     │
  │                                                │
  ├──────────────────────────────────────────────→│
  │   GET /segments/abc123/720p                   │
  │                                                │
  │←────────────────────────────────────────────┤
  │  {segments: [{index: 0, size: 450KB}, ...]}   │
  │                                                │
  ├──────────────────────────────────────────────→│
  │   GET /media/abc123/720p/seg_000.mp4          │
  │                                                │
  │←────────────────────────────────────────────┤
  │        [VIDÉO BINAIRE - 450 KB]               │
  │                                                │
  │ (Vidéo joue)                                  │
  │                                                │
  ├──────────────────────────────────────────────→│
  │   GET /media/abc123/720p/seg_001.mp4  (précharge)
  │                                                │
  │←────────────────────────────────────────────┤
  │        [VIDÉO BINAIRE - 420 KB]               │
  │                                                │
  │ (HEAD request pour mesurer bande passante)    │
  ├──────────────────────────────────────────────→│
  │   HEAD /media/abc123/720p/seg_002.mp4         │
  │                                                │
  │←────────────────────────────────────────────┤
  │   Content-Length: 440000                      │
  │                                                │
  │ (Si bande passante < 2 Mbps : switch à 480p) │
  │                                                │
  ├──────────────────────────────────────────────→│
  │   GET /media/abc123/480p/seg_002.mp4 (retry) │
  │                                                │
  │←────────────────────────────────────────────┤
  │        [VIDÉO BINAIRE - 300 KB]               │
  │                                                │
  └────────────────────────────────────────────────┘
```

---

---

## 📡 RÉSEAU

### 1. Latence : C'est quoi ? Impact ?

#### Définition
La **latence** = le **temps qu'un paquet prend pour aller du client au serveur** (en millisecondes).

```
PC → Routeur → FAI → Backbone Internet → Serveur
|──────────── 50 ms latence ────────────|
```

#### Impact sur ton streaming
```
Latence  │ Impact
---------┼─────────────────────────────────────
< 50 ms  │ ✅ Instantané (LAN, même pays)
50-100 ms│ ✅ Bon (normal à l'international)
100-200ms│ ⚠️  Acceptable mais visible
> 200 ms │ ❌ lag noticeable (gaming impossible)
```

#### Exemple dans ton code
```javascript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 10000)
// Si aucune réponse après 10 secondes → abandon
// C'est une protection contre la latence extrême
```

---

### 2. Bande passante : Comment tu la mesures ?

#### Définition simple
La **bande passante** = **la vitesse à laquelle tu peux télécharger des données** (en Mbps).

```
Bande passante faible (1 Mbps)  : ▓░░░░░░░░░░ (lente)
Bande passante moyenne (10 Mbps) : ▓▓▓▓▓░░░░░░ (normal)
Bande passante haute (50 Mbps)  : ▓▓▓▓▓▓▓▓▓░░ (très rapide)
```

#### Comment ton code la mesure [Ligne 287-306]

```javascript
async function estimateBandwidth() {
  const start = performance.now()  // Note l'heure de départ
  
  // Télécharge un segment (HEAD request = seulement les headers)
  const res = await fetch(url, { method: 'HEAD', timeout: 2000 })
  const size = parseInt(res.headers.get('content-length'))  // 500 KB
  
  const duration = performance.now() - start  // Temps écoulé
  
  // Formule : (taille en bits) / (temps en secondes) = bps
  const bandwidth = (size * 8) / (duration / 1000) / 1000  // en kbps
  
  return bandwidth  // Exemple: 4000 kbps = 4 Mbps
}
```

#### Exemple concret
```
Segment téléchargé : 500 KB
Temps pris : 1 seconde

Bande passante = (500 KB * 8 bits) / 1 s
               = 4000 kbits / s
               = 4 Mbps
```

---

### 3. Comment décider la qualité basée sur la connexion ?

#### Algorithme ABR

| Bande passante | Qualité | Raison |
|---|---|---|
| > 8 Mbps | 1080p | Assez rapide pour de la très haute définition |
| > 4 Mbps | 720p | Bon pour la plupart des connexions |
| > 2 Mbps | 480p | Acceptable, mais image moins claire |
| < 2 Mbps | 360p | Très compressée, mais ne freeze pas |

#### Code dans player2.js [Ligne 310]

```javascript
selectQualityForBandwidth(bandwidth) {
  // bandwidth en kbps
  
  if (bandwidth > 8000) return "1080p"   // > 8 Mbps
  if (bandwidth > 4000) return "720p"    // > 4 Mbps
  if (bandwidth > 2000) return "480p"    // > 2 Mbps
  return "360p"                          // < 2 Mbps
}
```

#### Pourquoi ces seuils ?

```
Vidéo 720p = ~1-2 Mbps
Vidéo 360p = ~0.5-1 Mbps

Avec bande passante de 4 Mbps :
- 720p prend 1.5 Mbps → Reste 2.5 Mbps libre → PAS DE LAG ✅
- 1080p prend 3 Mbps → Reste 1 Mbps libre → PEUT LAG ❌

Avec bande passante de 2 Mbps :
- 480p prend 0.8 Mbps → Reste 1.2 Mbps libre → OK ✅
- 720p prend 1.5 Mbps → Reste 0.5 Mbps libre → LAG ⚠️
```

---

---

## 🎯 DÉTAIL DES FONCTIONS

### SERVEUR

#### `GET /videos` [videos.js, ligne 8]
```javascript
// Qu'est-ce qu'elle fait ?
Lit le dossier /media
Lit metadata.json de chaque vidéo
Calcule la taille totale
Retourne la liste

// Quand est-elle appelée ?
Quand le player veut voir toutes les vidéos disponibles

// Qu'est-ce qu'elle retourne ?
{
  videos: [
    {
      id: "abc123",
      title: "Ma vidéo",
      duration: 120,
      qualities: [{name: "720p", totalSegments: 30}, ...],
      thumbnail: "/media/abc123/thumbnail.jpg",
      size: 1000000,
      totalSegments: 30,
      segmentDuration: 4
    }
  ],
  totalDuration: 600,
  totalSize: 5000000,
  count: 5
}
```

#### `GET /metadata/:id` [videos.js, ligne 121]
```javascript
// Qu'est-ce qu'elle fait ?
Ouvre metadata.json de la vidéo
Retourne son contenu

// Quand est-elle appelée ?
Player au démarrage pour connaître les qualités disponibles

// Qu'est-ce qu'elle retourne ?
{
  title: "Ma vidéo",
  duration: 120,
  qualities: [
    { name: "360p", width: 640, height: 360, totalSegments: 30 },
    { name: "720p", width: 1280, height: 720, totalSegments: 30 }
  ],
  segmentDuration: 4,
  originalWidth: 1920,
  originalHeight: 1080,
  processedAt: "2025-01-15T10:30:00Z"
}
```

#### `GET /segments/:id/:quality` [videos.js, ligne 89]
```javascript
// Qu'est-ce qu'elle fait ?
Ouvre segments.json pour une qualité spécifique
Retourne la liste des segments

// Quand est-elle appelée ?
Player après le choix de qualité

// Qu'est-ce qu'elle retourne ?
{
  videoId: "abc123",
  quality: "720p",
  totalSegments: 30,
  segmentDuration: 4,
  segments: [
    { index: 0, duration: 4, size: 450000 },
    { index: 1, duration: 4, size: 420000 },
    ...
  ]
}
```

#### `POST /upload` [upload.js, ligne 14]
```javascript
// Qu'est-ce qu'elle fait ?
Reçoit un fichier vidéo
Lance le traitement en background (conversion, segmentation)
Retourne un videoId tout de suite

// Quand est-elle appelée ?
Quand l'utilisateur upload une vidéo

// Qu'est-ce qu'elle retourne ?
{
  videoId: "f1400c3b-e0ee-4e62-9a3e-57f162821e4e",
  statusUrl: "/status/f1400c3b-e0ee-4e62-9a3e-57f162821e4e",
  message: "Upload successful, processing started"
}
```

#### `GET /status/:id` [upload.js, ligne 43]
```javascript
// Qu'est-ce qu'elle fait ?
Vérifie si metadata.json existe
Si oui : traitement terminé
Si non : traitement en cours

// Quand est-elle appelée ?
Player vérifie la progression de traitement

// Qu'est-ce qu'elle retourne ?
{
  status: "done",
  metadata: { title, duration, qualities, ... }
}
// OU
{
  status: "processing"
}
```

---

### PLAYER 2

#### `main()` [player2.js, ligne 40]
```javascript
// Qu'est-ce qu'elle fait ?
Lance l'initialisation du player

// Quand est-elle appelée ?
Automatiquement à la fin du fichier (ligne 458)

// Processus :
1. Récupère videoId depuis l'URL (?v=abc123)
2. loadMetadata() → Récupère les qualités
3. loadSegments() → Récupère la liste
4. renderSegmentList() → Affiche les segments
5. setupQualitySelector() → Crée les boutons
6. setupVideoEvents() → Écoute les événements
7. startABR() → Lance la boucle ABR
8. playSegmentAt(0) → Lance le premier segment
```

#### `loadMetadata(videoId)` [player2.js, ligne 49]
```javascript
// Qu'est-ce qu'elle fait ?
GET /metadata/:videoId
Sauvegarde les qualités disponibles

// Quand est-elle appelée ?
main() au démarrage

// Qu'est-ce qu'elle retourne ?
Rien (stocke dans variable globale `metadata`)

metadata = {
  title: "...",
  qualities: [{name: "360p"}, {name: "720p"}],
  segmentDuration: 4
}
```

#### `loadSegments(videoId)` [player2.js, ligne 59]
```javascript
// Qu'est-ce qu'elle fait ?
GET /segments/:videoId (meilleure qualité)
Récupère la liste de tous les segments
Initialise bufferMap

// Quand est-elle appelée ?
main() après loadMetadata()

// Qu'est-ce qu'elle retourne ?
Rien (stocke dans variable globale `segments`)

segments = [
  { index: 0, duration: 4, size: 450000 },
  { index: 1, duration: 4, size: 420000 },
  ...
]

bufferMap = {
  0: 'missing', 1: 'missing', 2: 'missing', ...
}
```

#### `renderSegmentList()` [player2.js, ligne 77]
```javascript
// Qu'est-ce qu'elle fait ?
Affiche les segments dans la sidebar avec:
- Image miniature
- Numéro du segment
- Durée
- Taille
- Statut (loaded, buffered, loading, missing)

// Quand est-elle appelée ?
1. main() au démarrage
2. updateSegmentStatus() quand l'état change

// Qu'est-ce qu'elle crée visuel ?
[Segment 1]
[████████ thumbnail]
Segment 1
4.0s 450 KB
loaded
```

#### `setupQualitySelector()` [player2.js, ligne 120]
```javascript
// Qu'est-ce qu'elle fait ?
Crée les boutons "Auto", "720p", "480p", "360p"
Ajoute des événements click sur chaque bouton

// Quand est-elle appelée ?
main() après loadMetadata()

// Comportement :
- Clic "Auto" → abrEnabled = true (auto-qualité)
- Clic "720p" → abrEnabled = false, manualQuality = "720p"
- Clic sur qualité → switchQualityAtCurrentTime()
```

#### `startABR()` [player2.js, ligne 280]
```javascript
// Qu'est-ce qu'elle fait ?
Boucle infinité qui tous les 5 secondes :
1. Mesure la bande passante
2. Sélectionne la meilleure qualité
3. Si elle change → re-télécharge le segment actuel

// Quand est-elle appelée ?
main() au démarrage

// Fréquence :
Toutes les 5000 ms (5 secondes)

// Exemple :
Minute 0 : bande passante 8 Mbps → 1080p
Minute 5 : bande passante 2 Mbps → 360p (qualité baisse)
Minute 10 : bande passante 6 Mbps → 720p (qualité monte)
```

#### `estimateBandwidth()` [player2.js, ligne 287]
```javascript
// Qu'est-ce qu'elle fait ?
Envoie un HEAD request (sans télécharger le contenu)
Mesure le temps
Calcule bande passante = taille / temps

// Quand est-elle appelée ?
startABR() toutes les 5 secondes

// Formule :
bandwidth (kbps) = (size * 8 bits) / (duration / 1000) / 1000

// Exemple :
size = 500000 bytes
duration = 1000 ms = 1 s
bandwidth = (500000 * 8) / 1 / 1000 = 4000 kbps = 4 Mbps
```

#### `selectQualityForBandwidth(bandwidth)` [player2.js, ligne 310]
```javascript
// Qu'est-ce qu'elle fait ?
Retourne la meilleure qualité pour une bande passante

// Quand est-elle appelée ?
estimateBandwidth() dans startABR()

// Qu'est-ce qu'elle retourne ?
"1080p" si bandwidth > 8000
"720p"  si bandwidth > 4000
"480p"  si bandwidth > 2000
"360p"  sinon
```

#### `switchQualityAtCurrentTime()` [player2.js, ligne 325]
```javascript
// Qu'est-ce qu'elle fait ?
Trouve le numéro du segment actuel
Relance playSegmentAt() avec la nouvelle qualité

// Quand est-elle appelée ?
startABR() si la qualité change
setupQualitySelector() si utilisateur clique sur une qualité

// Exemple :
Tu regardes à 25 secondes (segment 6, avec segmentDuration=4)
Qualité change de 720p → 480p
→ playSegmentAt(6) relancé
```

#### `prebufferSegments(startIdx)` [player2.js, ligne 237]
```javascript
// Qu'est-ce qu'elle fait ?
Lance le téléchargement du segment SUIVANT en arrière-plan
Evite les freezes si tu regardes rapidement

// Quand est-elle appelée ?
playSegmentAt() après que la vidéo commence à jouer

// Exemple :
Tu regardes segment 5
prebufferSegments(5) → Lance le téléchargement du segment 6
Quand segment 5 finit, segment 6 est déjà là !
```

#### `playSegmentAt(idx, offset=0)` [player2.js, ligne 347]
```javascript
// Qu'est-ce qu'elle fait ?
1. Highlight le segment dans la sidebar
2. fetchSegment(idx, quality) → Télécharge
3. Crée un Blob URL
4. video.src = URL → La vidéo joue
5. prebufferSegments() → Pré-charge suivant
6. updateBufferBar() → Affiche progression

// Quand est-elle appelée ?
1. main() playSegmentAt(0) pour démarrer
2. setupVideoEvents() 'ended' pour le segment suivant
3. renderSegmentList() onclick → Utilisateur clique sur segment
4. switchQualityAtCurrentTime() → Qualité change

// Qu'est-ce qu'elle retourne ?
Rien (modifie video.src)

// Exemple :
playSegmentAt(5, 2)
→ Télécharge segment 5 en qualité 720p
→ video.src = blob URL
→ video.currentTime = 2 (commencer à 2 secondes)
→ video.play()
```

#### `fetchSegment(idx, quality, retries=3)` [player2.js, ligne 337]
```javascript
// Qu'est-ce qu'elle fait ?
Essaie de télécharger un segment 3 fois
Avec exponential backoff (attendre 0.5s, 1s, 2s entre tentatives)

// Quand est-elle appelée ?
playSegmentAt() pour télécharger le segment réel

// Qu'est-ce qu'elle retourne ?
Blob (données binaires) si succès
null si 3 tentatives échouées

// Stratégie :
Tentative 1 → Échoue → attendre 0.5s
Tentative 2 → Échoue → attendre 1s
Tentative 3 → Échoue → attendre 2s
Retourner null

// Timeout :
10 secondes maximum par tentative
```

#### `setupVideoEvents()` [player2.js, ligne 424]
```javascript
// Qu'est-ce qu'elle fait ?
Ajoute des écouteurs d'événements au <video> :
- 'ended' → Segment terminé → Lancer le suivant
- 'timeupdate' → Temps mis à jour → Mettre à jour UI
- 'error' → Erreur vidéo → Afficher message

// Quand est-elle appelée ?
main() au démarrage

// Événements :
'ended' : video.ended = true
→ Calcule le prochain segment
→ playSegmentAt(nextIdx)

'timeupdate' : Toutes les ~100ms (naturel du navigateur)
→ Mets à jour la position (currentSegment)
→ Mets à jour la barre de buffer
→ Highlight le segment actuel

'error' : Erreur HTML5
→ showError("Error loading segment")
```

#### `getSegmentUrl(videoId, quality, idx)` [player2.js, ligne 418]
```javascript
// Qu'est-ce qu'elle fait ?
Construit l'URL d'un segment

// Quand est-elle appelée ?
fetchSegment() et estimateBandwidth()

// Qu'est-ce qu'elle retourne ?
"/media/{videoId}/{quality}/seg_000.mp4"

// Exemple :
getSegmentUrl("abc123", "720p", 5)
→ "/media/abc123/720p/seg_005.mp4"
```

#### `showError(msg)` [player2.js, ligne 443]
```javascript
// Qu'est-ce qu'elle fait ?
Affiche un message d'erreur dans la UI
Disparaît automatiquement après 5 secondes

// Quand est-elle appelée ?
playSegmentAt() si segment échoue
fetchSegment() si réseau est down

// Exemple :
showError("Segment 5 failed. Check your network.")
→ Affiche une banneau rouge
→ Après 5s : banneau disparaît
```

---

---

## 📊 SCHÉMA GLOBAL

```
┌─────────────────────────────────────────────────────────────┐
│                      UTILISATEUR                             │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ↓
        ┌────────────────────────────────────┐
        │      NAVIGATEUR (Browser)          │
        │  HTML5 Video + JavaScript          │
        └────────────────────────────────────┘
                         │
                         │ HTTP Requests
                         ↓
        ┌────────────────────────────────────┐
        │    NODE.JS EXPRESS SERVER          │
        │  - /videos → List metadata         │
        │  - /metadata/:id → Get quality     │
        │  - /segments/:id → Get segment list│
        │  - /media/:id/:q/seg_X.mp4 → File │
        │  - /upload → Process video         │
        └────────────────────────────────────┘
                         │
                         ↓
        ┌────────────────────────────────────┐
        │      FILE SYSTEM (Disque)          │
        │  /media/                           │
        │  ├── video-id-1/                   │
        │  │   ├── metadata.json             │
        │  │   ├── 360p/                     │
        │  │   │   ├── seg_000.mp4           │
        │  │   │   ├── seg_001.mp4           │
        │  │   │   └── ...                   │
        │  │   ├── 720p/                     │
        │  │   │   ├── seg_000.mp4           │
        │  │   │   ├── seg_001.mp4           │
        │  │   │   └── ...                   │
        │  │   └── thumbnail.jpg             │
        │  └── video-id-2/                   │
        │      └── ...                       │
        └────────────────────────────────────┘

