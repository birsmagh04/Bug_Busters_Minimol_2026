const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const http = require('http');

let mainWindow = null;
const appStartTime = Date.now();

// Optional launch arguments let developers run isolated node profiles side by side.
function getLaunchOption(name) {
  const prefix = `--hivenet-${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

const nodeProfile = getLaunchOption('profile').toLowerCase().replace(/[^a-z0-9_-]/g, '');
const launchPort = Number(getLaunchOption('port'));
const launchNodeName = getLaunchOption('name').trim();

// Storage paths in user application data directory
// Safe fallback if app.getPath is called before app is ready or in edge conditions
function getUserDataPath() {
  try {
    if (app && typeof app.getPath === 'function') {
      if (nodeProfile && typeof app.setPath === 'function') {
        const profilePath = path.join(app.getPath('appData'), 'HiveNet', `profile-${nodeProfile}`);
        app.setPath('userData', profilePath);
        return profilePath;
      }
      return app.getPath('userData');
    }
  } catch (e) {
    // ignore
  }
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  return path.join(appData, 'HiveNet');
}

const userDataDir = getUserDataPath();
const edgeStorageDir = path.join(userDataDir, 'edge-storage-shards');
const nodeConfigPath = path.join(userDataDir, 'node-identity.json');
const peersConfigPath = path.join(userDataDir, 'peers.json');

// Ensure edge storage and user data directories exist
try {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  if (!fs.existsSync(edgeStorageDir)) {
    fs.mkdirSync(edgeStorageDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to initialize local edge directories:', err);
}

/**
 * Get primary local IPv4 address
 */
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Find external IPv4 address
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Get real disk storage capacity for the actual filesystem drive where HiveNet stores its data.
 * Checks edgeStorageDir, userDataDir, or current working directory.
 */
function getDiskCapacity() {
  try {
    let measuredPath = edgeStorageDir;
    if (!fs.existsSync(measuredPath)) {
      measuredPath = fs.existsSync(userDataDir) ? userDataDir : process.cwd();
    }

    const parsedPath = path.parse(path.resolve(measuredPath));
    const volumeRoot = parsedPath.root;

    let driveLabel = volumeRoot;
    if (process.platform === 'win32') {
      const letter = volumeRoot.replace(/[^A-Za-z]/g, '').toUpperCase();
      driveLabel = letter ? `Local Disk (${letter}:)` : volumeRoot;
    } else {
      driveLabel = `Root Volume (${volumeRoot})`;
    }

    if (typeof fs.statfsSync !== 'function') throw new Error('Filesystem telemetry is not supported');

    const formatGB = (bytes) => (bytes / (1024 ** 3)).toFixed(1);
    const readVolume = (root) => {
      const stats = fs.statfsSync(root);
      if (!stats || stats.blocks <= 0) return null;
      const rootLabel = path.parse(path.resolve(root)).root;
      const blockSize = BigInt(stats.bsize || stats.frsize || 4096);
      const totalBytes = Number(BigInt(stats.blocks) * blockSize);
      const freeBlocks = stats.bavail ?? stats.bfree;
      const freeBytes = Number(BigInt(freeBlocks) * blockSize);
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      return {
        volumeRoot: rootLabel,
        driveLabel: process.platform === 'win32'
          ? `Local Disk (${rootLabel.slice(0, 2).toUpperCase()})`
          : `Root Volume (${rootLabel})`,
        totalBytes,
        freeBytes,
        usedBytes,
        totalGB: `${formatGB(totalBytes)} GB`,
        freeGB: `${formatGB(freeBytes)} GB`,
        usedGB: `${formatGB(usedBytes)} GB`,
        percentUsed: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0
      };
    };

    let storageVolume = readVolume(measuredPath);
    if (!storageVolume && path.resolve(measuredPath) !== path.resolve(volumeRoot)) {
      storageVolume = readVolume(volumeRoot);
    }
    if (!storageVolume) throw new Error(`Could not read filesystem capacity for ${measuredPath}`);

    let volumes = [storageVolume];
    if (process.platform === 'win32') {
      volumes = [];
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const root = `${letter}:\\`;
        try {
          const volume = readVolume(root);
          if (volume) volumes.push(volume);
        } catch {
          // Unavailable letters and unmounted volumes are not local storage.
        }
      }
      if (!volumes.some(volume => volume.volumeRoot.toLowerCase() === volumeRoot.toLowerCase())) {
        volumes.push(storageVolume);
      }
    }

    const totalBytes = volumes.reduce((sum, volume) => sum + volume.totalBytes, 0);
    const freeBytes = volumes.reduce((sum, volume) => sum + volume.freeBytes, 0);
    const usedBytes = volumes.reduce((sum, volume) => sum + volume.usedBytes, 0);
    const volumeNames = volumes.map(volume => volume.volumeRoot.replace('\\', '').toUpperCase());

    return {
      totalBytes,
      freeBytes,
      usedBytes,
      totalGB: `${formatGB(totalBytes)} GB`,
      freeGB: `${formatGB(freeBytes)} GB`,
      usedGB: `${formatGB(usedBytes)} GB`,
      percentUsed: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
      driveLabel: process.platform === 'win32'
        ? `This Device (${volumeNames.join(', ')})`
        : driveLabel,
      volumeRoot: volumes.length === 1 ? volumeRoot : volumeNames.join(', '),
      measuredDirectory: measuredPath,
      volumes,
      storageVolume
    };
  } catch (err) {
    console.error('Error reading real disk capacity:', err);
  }

  return {
    totalBytes: 0,
    freeBytes: 0,
    usedBytes: 0,
    totalGB: 'Unavailable',
    freeGB: 'Unavailable',
    usedGB: 'Unavailable',
    percentUsed: 0,
    driveLabel: 'Local Disk (C:)',
    volumeRoot: 'C:\\',
    measuredDirectory: edgeStorageDir
  };
}

/**
 * Load or initialize persistent Node Identity
 */
function loadOrCreateNodeIdentity() {
  const defaultHostname = os.hostname() || 'HiveNet-Node';
  try {
    if (fs.existsSync(nodeConfigPath)) {
      const raw = fs.readFileSync(nodeConfigPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.nodeId) {
        let changed = false;
        if (launchPort >= 1024 && launchPort <= 65535 && data.port !== launchPort) {
          data.port = launchPort;
          changed = true;
        }
        if (launchNodeName && data.nodeName !== launchNodeName) {
          data.nodeName = launchNodeName;
          changed = true;
        }
        if (changed) fs.writeFileSync(nodeConfigPath, JSON.stringify(data, null, 2), 'utf8');
        return data;
      }
    }
  } catch (err) {
    console.error('Error reading node identity config:', err);
  }

  const randomHex = crypto.randomBytes(8).toString('hex');
  const nodeId = `hive-node-${randomHex}`;
  const defaultIdentity = {
    nodeId,
    nodeName: launchNodeName || defaultHostname,
    port: launchPort >= 1024 && launchPort <= 65535 ? launchPort : 9001,
    createdTimestamp: Date.now(),
    role: 'Full Edge Shard Node'
  };

  try {
    fs.writeFileSync(nodeConfigPath, JSON.stringify(defaultIdentity, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving initial node identity config:', err);
  }

  return defaultIdentity;
}

// In-memory active configuration
let currentNodeConfig = loadOrCreateNodeIdentity();

// -------------------------------------------------------------
// Persistent Connected Peers Store
// -------------------------------------------------------------
function loadPeers() {
  try {
    if (fs.existsSync(peersConfigPath)) {
      const raw = fs.readFileSync(peersConfigPath, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list;
      }
    }
  } catch (err) {
    console.error('Error reading saved peers list:', err);
  }
  return [];
}

function savePeers(peersList) {
  try {
    fs.writeFileSync(peersConfigPath, JSON.stringify(peersList, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving peers list:', err);
  }
}

let connectedPeers = loadPeers();

// -------------------------------------------------------------
// Lightweight HTTP Peer Client (Health, Telemetry, Latency)
// -------------------------------------------------------------
function fetchJsonFromPeer(ip, port, endpoint, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const options = {
      hostname: ip,
      port: Number(port),
      path: endpoint,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'HiveNet-Peer/1.0',
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        const latencyMs = Math.max(1, Date.now() - startTime);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            resolve({ data: parsed, latencyMs, statusCode: res.statusCode });
          } catch (e) {
            reject(new Error(`Invalid JSON response from ${ip}:${port}${endpoint}`));
          }
        } else {
          reject(new Error(`Peer responded with HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Connection to ${ip}:${port} timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      // Clear, human-readable network error messages
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`Connection refused at ${ip}:${port}. No HiveNet instance is listening on this port.`));
      } else if (err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH') {
        reject(new Error(`Host unreachable at ${ip}:${port}. Check IP address and network connectivity.`));
      } else if (err.code === 'ETIMEDOUT') {
        reject(new Error(`Connection timed out after ${timeoutMs}ms at ${ip}:${port}.`));
      } else {
        reject(new Error(err.message || `Failed to connect to ${ip}:${port}`));
      }
    });

    req.end();
  });
}

// -------------------------------------------------------------
// Real-time Peer Health Monitor
// -------------------------------------------------------------
async function checkPeerHealth(peer) {
  try {
    const healthResult = await fetchJsonFromPeer(peer.ip, peer.port, '/health', 4000);
    const healthData = healthResult.data;

    let telemetryData = null;
    try {
      const telResult = await fetchJsonFromPeer(peer.ip, peer.port, '/telemetry', 4000);
      telemetryData = telResult.data;
    } catch {
      // Keep previous telemetry if telemetry endpoint times out
    }

    return {
      ...peer,
      nodeId: healthData.nodeId || peer.nodeId,
      nodeName: healthData.nodeName || peer.nodeName,
      status: 'Online',
      latency: `${healthResult.latencyMs}ms`,
      latencyMs: healthResult.latencyMs,
      uptime: healthData.uptime !== undefined ? healthData.uptime : peer.uptime,
      availableStorage: telemetryData?.availableDiskSpace || peer.availableStorage || 'N/A',
      totalStorage: telemetryData?.totalDiskSpace || peer.totalStorage || 'N/A',
      usedStorage: telemetryData?.usedDiskSpace || peer.usedStorage || 'N/A',
      lastSeen: Date.now()
    };
  } catch (err) {
    return {
      ...peer,
      status: 'Offline',
      latency: 'Unreachable',
      latencyMs: null
    };
  }
}

let healthPollingTimer = null;

function startHealthMonitoring() {
  if (healthPollingTimer) clearInterval(healthPollingTimer);

  healthPollingTimer = setInterval(async () => {
    if (!connectedPeers || connectedPeers.length === 0) return;

    let changed = false;
    const updatedPeers = [];

    for (const peer of connectedPeers) {
      const updated = await checkPeerHealth(peer);
      if (
        updated.status !== peer.status ||
        updated.latency !== peer.latency ||
        updated.availableStorage !== peer.availableStorage
      ) {
        changed = true;
      }
      updatedPeers.push(updated);
    }

    connectedPeers = updatedPeers;
    if (changed) {
      savePeers(connectedPeers);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('peers:updated', connectedPeers);
      }
    }
  }, 6000); // Poll every 6 seconds
}

// -------------------------------------------------------------
// Local HiveNet Node HTTP Server
// -------------------------------------------------------------
let nodeHttpServer = null;

function startNodeHttpServer(port) {
  if (nodeHttpServer) {
    try {
      nodeHttpServer.close();
    } catch (e) {
      console.error('Error closing old HTTP server:', e);
    }
  }

  nodeHttpServer = http.createServer((req, res) => {
    // Enable CORS for P2P interactions
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // GET /health
    if (req.method === 'GET' && pathname === '/health') {
      const uptimeSecs = Math.floor((Date.now() - appStartTime) / 1000);
      const healthPayload = {
        nodeId: currentNodeConfig.nodeId,
        nodeName: currentNodeConfig.nodeName,
        localIp: getLocalIpAddress(),
        port: currentNodeConfig.port,
        status: 'online',
        uptime: uptimeSecs
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthPayload));
      return;
    }

    // GET /telemetry
    if (req.method === 'GET' && pathname === '/telemetry') {
      const uptimeSecs = Math.floor((Date.now() - appStartTime) / 1000);
      const disk = getDiskCapacity();

      const telemetryPayload = {
        nodeId: currentNodeConfig.nodeId,
        nodeName: currentNodeConfig.nodeName,
        // Peers use the capacity on the actual HiveNet storage volume for routing.
        availableDiskSpace: disk.storageVolume?.freeGB || disk.freeGB,
        totalDiskSpace: disk.storageVolume?.totalGB || disk.totalGB,
        usedDiskSpace: disk.storageVolume?.usedGB || disk.usedGB,
        deviceAvailableDiskSpace: disk.freeGB,
        deviceTotalDiskSpace: disk.totalGB,
        deviceUsedDiskSpace: disk.usedGB,
        volumes: disk.volumes,
        driveLabel: disk.driveLabel,
        uptime: uptimeSecs,
        status: 'online'
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(telemetryPayload));
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found on HiveNet Node' }));
  });

  const serverPort = Number(port) || 9001;
  nodeHttpServer.listen(serverPort, '0.0.0.0', () => {
    console.log(`[HiveNet] Node HTTP Server actively listening on 0.0.0.0:${serverPort}`);
  });

  nodeHttpServer.on('error', (err) => {
    console.error(`[HiveNet] HTTP Server error on port ${serverPort}:`, err.message);
  });
}

// -------------------------------------------------------------
// Electron Window Creation & App Lifecycle
// -------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#090D14',
    title: 'HiveNet — Distributed Edge Cloud Storage',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = 'http://127.0.0.1:5173';
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devUrl).catch(() => {
      setTimeout(() => {
        mainWindow.loadURL(devUrl);
      }, 1000);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Start local Node HTTP Server on configured port
    startNodeHttpServer(currentNodeConfig.port);

    // Setup IPC Handlers
    setupIpcHandlers();

    // Start background peer health monitor
    startHealthMonitoring();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (healthPollingTimer) clearInterval(healthPollingTimer);
  if (nodeHttpServer) {
    try { nodeHttpServer.close(); } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  // Get complete real Node Identity & Live device status
  ipcMain.handle('node:get-identity', async () => {
    const ip = getLocalIpAddress();
    const disk = getDiskCapacity();
    const uptimeSecs = Math.floor((Date.now() - appStartTime) / 1000);

    return {
      nodeId: currentNodeConfig.nodeId,
      nodeName: currentNodeConfig.nodeName,
      port: currentNodeConfig.port,
      role: currentNodeConfig.role || 'Full Edge Shard Node',
      ip: ip,
      status: 'Online',
      startTime: appStartTime,
      uptimeSeconds: uptimeSecs,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      configPath: nodeConfigPath,
      disk: disk
    };
  });

  // Update Node Settings (Node Name & Port)
  ipcMain.handle('node:update-settings', async (_, newSettings) => {
    try {
      let portChanged = false;
      if (newSettings.nodeName && typeof newSettings.nodeName === 'string') {
        currentNodeConfig.nodeName = newSettings.nodeName.trim();
      }
      if (newSettings.port && !isNaN(Number(newSettings.port))) {
        const p = Number(newSettings.port);
        if (p >= 1024 && p <= 65535 && p !== currentNodeConfig.port) {
          currentNodeConfig.port = p;
          portChanged = true;
        }
      }

      fs.writeFileSync(nodeConfigPath, JSON.stringify(currentNodeConfig, null, 2), 'utf8');

      // If port changed, dynamically restart local HTTP listener
      if (portChanged) {
        startNodeHttpServer(currentNodeConfig.port);
      }

      return {
        success: true,
        nodeId: currentNodeConfig.nodeId,
        nodeName: currentNodeConfig.nodeName,
        port: currentNodeConfig.port,
        portChanged
      };
    } catch (err) {
      console.error('Failed to update node configuration:', err);
      return { success: false, error: err.message };
    }
  });

  // -------------------------------------------------------------
  // Real Peer-to-Peer IPC Handlers
  // -------------------------------------------------------------

  // Get current list of saved peers
  ipcMain.handle('peers:get-list', async () => {
    return connectedPeers;
  });

  // Connect to a new peer by IP and Port (Real HTTP check)
  ipcMain.handle('peers:connect', async (_, { ip, port }) => {
    try {
      const cleanIp = (ip || '').trim();
      const numPort = Number(port);

      if (!cleanIp) {
        return { success: false, error: 'Peer IP address is required' };
      }
      if (isNaN(numPort) || numPort < 1024 || numPort > 65535) {
        return { success: false, error: 'Invalid communication port (must be between 1024 and 65535)' };
      }

      // Check if user is attempting to connect to themselves
      const localIp = getLocalIpAddress();
      if ((cleanIp === '127.0.0.1' || cleanIp === 'localhost' || cleanIp === localIp) && numPort === currentNodeConfig.port) {
        return { success: false, error: 'Cannot connect to self (same IP and port as this local node)' };
      }

      // 1. Real HTTP request to peer's /health endpoint with 5-second timeout
      const healthRes = await fetchJsonFromPeer(cleanIp, numPort, '/health', 5000);
      const health = healthRes.data;

      if (!health || !health.nodeId) {
        return { success: false, error: 'Target responded, but does not identify as a valid HiveNet node (missing nodeId)' };
      }
      if (health.nodeId === currentNodeConfig.nodeId) {
        return { success: false, error: 'This address points to the current HiveNet node. Connect to a different node instead.' };
      }

      // 2. Real HTTP request to peer's /telemetry endpoint
      let telemetry = {};
      try {
        const telRes = await fetchJsonFromPeer(cleanIp, numPort, '/telemetry', 5000);
        telemetry = telRes.data || {};
      } catch (telErr) {
        console.warn('Telemetry fetch warning:', telErr.message);
      }

      // 3. Assemble verified real peer model
      const newPeer = {
        id: health.nodeId,
        nodeId: health.nodeId,
        nodeName: health.nodeName || `Node-${numPort}`,
        ip: cleanIp,
        port: numPort,
        role: 'Peer Edge Shard Node',
        status: 'Online',
        latency: `${healthRes.latencyMs}ms`,
        latencyMs: healthRes.latencyMs,
        uptime: health.uptime || 0,
        availableStorage: telemetry.availableDiskSpace || 'N/A',
        totalStorage: telemetry.totalDiskSpace || 'N/A',
        usedStorage: telemetry.usedDiskSpace || 'N/A',
        lastSeen: Date.now()
      };

      // 4. Update or append peer list
      const existingIdx = connectedPeers.findIndex(p => 
        p.nodeId === newPeer.nodeId || (p.ip === newPeer.ip && Number(p.port) === newPeer.port)
      );

      if (existingIdx >= 0) {
        connectedPeers[existingIdx] = { ...connectedPeers[existingIdx], ...newPeer };
      } else {
        connectedPeers.push(newPeer);
      }

      savePeers(connectedPeers);

      return {
        success: true,
        peer: newPeer,
        peers: connectedPeers
      };
    } catch (err) {
      console.error('Peer connection error:', err);
      // Return clear error without adding or saving the peer
      return {
        success: false,
        error: err.message || `Failed to connect to peer at ${ip}:${port}`
      };
    }
  });

  // Manually refresh all peers via real HTTP
  ipcMain.handle('peers:refresh', async () => {
    if (!connectedPeers || connectedPeers.length === 0) return connectedPeers;

    const refreshed = [];
    for (const peer of connectedPeers) {
      const updated = await checkPeerHealth(peer);
      refreshed.push(updated);
    }
    connectedPeers = refreshed;
    savePeers(connectedPeers);
    return connectedPeers;
  });

  // Remove a peer
  ipcMain.handle('peers:remove', async (_, peerId) => {
    connectedPeers = connectedPeers.filter(p => p.id !== peerId && p.nodeId !== peerId);
    savePeers(connectedPeers);
    return { success: true, peers: connectedPeers };
  });

  // Native File Picker Dialog
  ipcMain.handle('dialog:select-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select File to Distribute across HiveNet Edge',
      buttonLabel: 'Select for Edge Sharding',
      properties: ['openFile'],
      filters: [
        { name: 'Images & Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    try {
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        lastModified: stats.mtimeMs,
        extension: path.extname(filePath).toLowerCase(),
      };
    } catch (err) {
      console.error('Error reading selected file stats:', err);
      return {
        path: filePath,
        name: path.basename(filePath),
        size: 0,
        error: err.message
      };
    }
  });

  // Native Directory Picker Dialog
  ipcMain.handle('dialog:select-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Local Edge Storage Folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // Native Filesystem and System info
  ipcMain.handle('fs:get-system-info', async () => {
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1);
    const disk = getDiskCapacity();

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Standard CPU',
      totalMemory: `${totalMemGB} GB`,
      freeMemory: `${freeMemGB} GB`,
      disk: disk,
      edgeStoragePath: edgeStorageDir,
      appVersion: app.getVersion()
    };
  });

  // Local Edge Cache stats from native filesystem
  ipcMain.handle('fs:get-local-edge-stats', async () => {
    try {
      if (!fs.existsSync(edgeStorageDir)) {
        fs.mkdirSync(edgeStorageDir, { recursive: true });
      }

      const files = fs.readdirSync(edgeStorageDir);
      let totalBytes = 0;
      files.forEach(file => {
        try {
          const stats = fs.statSync(path.join(edgeStorageDir, file));
          totalBytes += stats.size;
        } catch {
          // ignore broken file ref
        }
      });

      return {
        path: edgeStorageDir,
        shardCount: files.length,
        usedBytes: totalBytes,
        usedFormatted: (totalBytes / (1024 * 1024)).toFixed(2) + ' MB',
        healthy: true
      };
    } catch (err) {
      return {
        path: edgeStorageDir,
        shardCount: 0,
        usedBytes: 0,
        usedFormatted: '0 MB',
        error: err.message
      };
    }
  });

  // Open native edge folder in File Explorer / Finder
  ipcMain.handle('fs:open-folder', async (_, folderPath) => {
    const targetPath = folderPath || edgeStorageDir;
    if (!fs.existsSync(targetPath)) {
      try {
        fs.mkdirSync(targetPath, { recursive: true });
      } catch (err) {
        console.error('Failed to create target folder before opening:', err);
      }
    }
    await shell.openPath(targetPath);
    return true;
  });

  // Window titlebar actions
  ipcMain.on('window:action', (_, action) => {
    if (!mainWindow) return;
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case 'close':
        mainWindow.close();
        break;
    }
  });
}
