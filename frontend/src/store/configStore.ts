import { create } from 'zustand'

export interface PersonalizacaoConfig {
  system_name: string
  logo_base64: string
  favicon_base64?: string
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
    favicon_base64: '',
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
    
    // Update Document Title
    if (config.system_name) {
      document.title = config.system_name
    }
    
    // Update Favicon
    if (config.favicon_base64) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.getElementsByTagName('head')[0].appendChild(link)
      }
      link.href = config.favicon_base64
    }
  },
}))

// Helper to adjust hex color brightness
function adjustColor(color: string, amount: number) {
  return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}
