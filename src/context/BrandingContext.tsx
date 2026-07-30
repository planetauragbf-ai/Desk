// Personnalisation de l'application : logo modifiable depuis la page
// Administration. Le logo est stocké dans app_settings (URL publique
// Supabase Storage, ou data-URL en mode démo) et s'applique partout.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { insert, list, remove, update } from '../lib/data'
import { supabase } from '../lib/supabase'

export const DEFAULT_LOGO = '/logo.png'
const SETTING_KEY = 'logo_url'

interface BrandingState {
  logoUrl: string
  setLogo: (file: File) => Promise<void>
  resetLogo: () => Promise<void>
}

const BrandingContext = createContext<BrandingState>({
  logoUrl: DEFAULT_LOGO,
  setLogo: async () => {},
  resetLogo: async () => {},
})

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO)

  useEffect(() => {
    list('app_settings', { key: SETTING_KEY })
      .then((rows) => {
        if (rows[0]?.value) setLogoUrl(rows[0].value)
      })
      .catch(() => {
        // Table absente (migration non exécutée) : logo par défaut.
      })
  }, [])

  // Le favicon suit le logo.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (link) link.href = logoUrl
  }, [logoUrl])

  async function saveValue(value: string) {
    const rows = await list('app_settings', { key: SETTING_KEY })
    if (rows[0]) await update('app_settings', rows[0].id, { value, updated_at: new Date().toISOString() })
    else await insert('app_settings', { key: SETTING_KEY, value, updated_at: new Date().toISOString() })
    setLogoUrl(value)
  }

  async function setLogo(file: File) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Choisissez un fichier image (PNG, JPG, SVG ou WebP).')
    }
    if (supabase) {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `logo-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('branding')
        .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('branding').getPublicUrl(path)
      await saveValue(data.publicUrl)
    } else {
      if (file.size > 1_500_000) {
        throw new Error('En mode démo, le logo doit faire moins de 1,5 Mo.')
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
        reader.readAsDataURL(file)
      })
      await saveValue(dataUrl)
    }
  }

  async function resetLogo() {
    const rows = await list('app_settings', { key: SETTING_KEY })
    if (rows[0]) await remove('app_settings', rows[0].id)
    setLogoUrl(DEFAULT_LOGO)
  }

  return (
    <BrandingContext.Provider value={{ logoUrl, setLogo, resetLogo }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
