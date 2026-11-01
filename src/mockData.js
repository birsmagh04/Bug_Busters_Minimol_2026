export const initialMockNodes = [
  {
    id: 'node-local-01',
    name: 'Local Host Node',
    role: 'Primary Origin',
    ip: '127.0.0.1:9001',
    location: 'Edge Cluster #1 (Local)',
    storageProvided: '128 GB',
    storageUsed: '34.2 GB',
    shardsStored: 142,
    status: 'Online',
    latency: '1ms',
    reliability: '99.9%'
  },
  {
    id: 'node-edge-02',
    name: 'Peer Node Alpha',
    role: 'Storage Shard Worker',
    ip: '192.168.1.104:9002',
    location: 'Subnet LAN A',
    storageProvided: '256 GB',
    storageUsed: '88.1 GB',
    shardsStored: 320,
    status: 'Online',
    latency: '4ms',
    reliability: '99.4%'
  },
  {
    id: 'node-edge-03',
    name: 'Peer Node Beta',
    role: 'Storage Shard Worker',
    ip: '192.168.1.118:9002',
    location: 'Subnet LAN B',
    storageProvided: '512 GB',
    storageUsed: '142.6 GB',
    shardsStored: 512,
    status: 'Online',
    latency: '8ms',
    reliability: '98.8%'
  },
  {
    id: 'node-edge-04',
    name: 'Gateway Node Gamma',
    role: 'Replica Sync & Router',
    ip: '10.0.4.15:9004',
    location: 'Edge Gateway DMZ',
    storageProvided: '256 GB',
    storageUsed: '51.4 GB',
    shardsStored: 218,
    status: 'Online',
    latency: '14ms',
    reliability: '99.7%'
  },
  {
    id: 'node-edge-05',
    name: 'Mobile Edge Shard #5',
    role: 'Storage Shard Worker',
    ip: '10.0.4.22:9005',
    location: 'Edge WiFi Sub-Station',
    storageProvided: '64 GB',
    storageUsed: '19.8 GB',
    shardsStored: 76,
    status: 'Busy',
    latency: '24ms',
    reliability: '97.2%'
  }
];

export const mockGalleryItems = [
  {
    id: 'img-shard-01',
    name: 'distributed_mesh_architecture.png',
    size: '4.8 MB',
    type: 'image/png',
    originalDimensions: '3840 x 2160',
    shards: 4,
    replicationFactor: 2,
    targetNodes: ['node-local-01', 'node-edge-02', 'node-edge-03', 'node-edge-04'],
    status: 'Synchronized & Replicated',
    timestamp: '10 mins ago',
    hash: '0x8f3c7a9...e12d'
  },
  {
    id: 'img-shard-02',
    name: 'hackathon_edge_satellite_map.jpg',
    size: '8.2 MB',
    type: 'image/jpeg',
    originalDimensions: '4096 x 2730',
    shards: 6,
    replicationFactor: 2,
    targetNodes: ['node-local-01', 'node-edge-02', 'node-edge-04', 'node-edge-05'],
    status: 'Synchronized & Replicated',
    timestamp: '42 mins ago',
    hash: '0x3e18fb2...90ab'
  },
  {
    id: 'img-shard-03',
    name: 'cybersecurity_node_topology.png',
    size: '3.1 MB',
    type: 'image/png',
    originalDimensions: '2560 x 1440',
    shards: 3,
    replicationFactor: 2,
    targetNodes: ['node-edge-02', 'node-edge-03'],
    status: 'Synchronized & Replicated',
    timestamp: '2 hours ago',
    hash: '0xca7120a...55c3'
  }
];

