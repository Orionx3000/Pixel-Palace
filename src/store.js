import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Core Data
  assets: [], // { id, name, dataURL, folder }
  options: {
    tileSize: 16,
    gridW: 40,
    gridH: 30,
    accent: '#10b981',
    showGrid: true,
    exportFmt: 'json'
  },
  
  // Level Data
  tilemap: {
    grid: [],
    tiles: [],
    tileSize: 16,
  },
  collisions: [],
  markers: [],
  
  // App Navigation State
  activeTab: 'hub',

  // Actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  addAsset: (asset) => set((state) => ({
    assets: [{
      id: Date.now() + '_' + Math.random().toString(36).slice(2,7),
      folder: 'Main',
      ...asset
    }, ...state.assets]
  })),

  deleteAsset: (id) => set((state) => ({
    assets: state.assets.filter(a => a.id !== id)
  })),

  updateAsset: (id, updates) => set((state) => ({
    assets: state.assets.map(a => a.id === id ? { ...a, ...updates } : a)
  })),

  setOptions: (updates) => set((state) => ({
    options: { ...state.options, ...updates }
  })),
  
  setTilemap: (data) => set({ tilemap: data }),
  setCollisions: (data) => set({ collisions: data }),
  setMarkers: (data) => set({ markers: data }),
}));
