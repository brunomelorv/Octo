import { create } from 'zustand'

export interface PersonalizacaoConfig {
  system_name: string
  logo_base64: string
  primary_color: string
}

interface ConfigState {
  config: PersonalizacaoConfig
  setConfig: (config: PersonalizacaoConfig) => void
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: {
    system_name: 'Portal do Frank',
    logo_base64: '',
    primary_color: '',
  },
  setConfig: (config) => {
    set({ config })
    // Apply primary color if provided
    if (config.primary_color) {
      document.documentElement.style.setProperty('--accent', config.primary_color)
      // Basic shade generation for hover state (darker)
      document.documentElement.style.setProperty('--accent-hover', adjustColor(config.primary_color, -20))
    } else {
      document.documentElement.style.removeProperty('--accent')
      document.documentElement.style.removeProperty('--accent-hover')
    }
  },
}))

// Helper to adjust hex color brightness
function adjustColor(color: string, amount: number) {
  return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}
