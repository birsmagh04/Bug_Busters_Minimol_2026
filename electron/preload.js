const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, secure native desktop APIs to the React renderer process
contextBridge.exposeInMainWorld('hiveNetDesktop', {
  // Node Identity & Local Settings
  getNodeIdentity: () => ipcRenderer.invoke('node:get-identity'),
  updateNodeSettings: (settings) => ipcRenderer.invoke('node:update-settings', settings),

  // Peer-to-Peer Operations
  getPeers: () => ipcRenderer.invoke('peers:get-list'),
  connectPeer: (peerInfo) => ipcRenderer.invoke('peers:connect', peerInfo),
  refreshPeers: () => ipcRenderer.invoke('peers:refresh'),
  removePeer: (peerId) => ipcRenderer.invoke('peers:remove', peerId),
  onPeersUpdated: (callback) => {
    const handler = (_, peers) => callback(peers);
    ipcRenderer.on('peers:updated', handler);
    return () => ipcRenderer.removeListener('peers:updated', handler);
  },

  // Verified file sharing through the local node process
  listSharedFiles: () => ipcRenderer.invoke('files:list-local'),
  storeFileLocally: (selectionToken) => ipcRenderer.invoke('files:store-local', { selectionToken }),
  shareSelectedFile: (selectionToken, peerNodeId) => ipcRenderer.invoke('files:share-selected', { selectionToken, peerNodeId }),
  saveSharedFileCopy: (fileId) => ipcRenderer.invoke('files:save-copy', fileId),

  // Native Filesystem dialogs
  selectFile: () => ipcRenderer.invoke('dialog:select-file'),
  selectEdgeDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  
  // Native Filesystem info and stats
  getSystemInfo: () => ipcRenderer.invoke('fs:get-system-info'),
  getLocalEdgeStats: () => ipcRenderer.invoke('fs:get-local-edge-stats'),
  openEdgeFolder: (folderPath) => ipcRenderer.invoke('fs:open-folder', folderPath),
  readSampleImage: (filePath) => ipcRenderer.invoke('fs:read-sample-image', filePath),
  
  // Native window controls
  windowAction: (action) => ipcRenderer.send('window:action', action),
  
  // App info
  isElectron: true,
  platform: process.platform,
  version: '1.0.0'
});
