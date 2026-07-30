// Personnalisation : chaque application a son logo, modifiable depuis
// la page Administration. Les logos sont stockés dans app_settings
// (URL publique Supabase Storage, ou data-URL en mode démo).
//  - desk     : Planet'Desk (portail, écran de connexion, favicon)
//  - projects : Planet'Projects (pilotage)
//  - stock    : Planet'Stock (stockage & picking)
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { insert, list, remove, update } from '../lib/data'
import { supabase } from '../lib/supabase'

export type AppKey = 'desk' | 'projects' | 'dash' | 'stock' | 'claim'

export const APP_INFO: Record<AppKey, { name: string; settingKey: string; defaultLogo: string }> = {
  desk: { name: "Planet'Desk", settingKey: 'logo_url', defaultLogo: '/logo.png' },
  projects: { name: "Planet'Projects", settingKey: 'logo_projects_url', defaultLogo: '/logo-projects.svg' },
  dash: { name: "Planet'Dash", settingKey: 'logo_dash_url', defaultLogo: '/logo-dash.svg' },
  stock: { name: "Planet'Stock", settingKey: 'logo_stock_url', defaultLogo: '/logo-stock.svg' },
  claim: { name: "Planet'Claim", settingKey: 'logo_claim_url', defaultLogo: '/logo-claim.svg' },
}

export const DEFAULT_LOGO = APP_INFO.desk.defaultLogo

type Logos = Record<AppKey, string>

interface BrandingState {
  logos: Logos
  /** Logo Planet'Desk (compatibilité avec l'existant) */
  logoUrl: string
  setLogo: (app: AppKey, file: File) => Promise<void>
  resetLogo: (app: AppKey) => Promise<void>
}

const DEFAULT_LOGOS: Logos = {
  desk: APP_INFO.desk.defaultLogo,
  projects: APP_INFO.projects.defaultLogo,
  dash: APP_INFO.dash.defaultLogo,
  stock: APP_INFO.stock.defaultLogo,
  claim: APP_INFO.claim.defaultLogo,
}

const BrandingContext = createContext<BrandingState>({
  logos: DEFAULT_LOGOS,
  logoUrl: DEFAULT_LOGO,
  setLogo: async () => {},
  resetLogo: async () => {},
})

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logos, setLogos] = useState<Logos>(DEFAULT_LOGOS)

  useEffect(() => {
    list('app_settings')
      .then((rows) => {
        setLogos((prev) => {
          const next = { ...prev }
          for (const app of Object.keys(APP_INFO) as AppKey[]) {
            const row = rows.find((r) => r.key === APP_INFO[app].settingKey)
            if (row?.value) next[app] = row.value
          }
          return next
        })
      })
      .catch(() => {
        // Table absente (migration non exécutée) : logos par défaut.
      })
  }, [])

  // Le favicon suit le logo du Desk.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (link) link.href = logos.desk
  }, [logos.desk])

  async function saveValue(app: AppKey, value: string) {
    const key = APP_INFO[app].settingKey
    const rows = await list('app_settings', { key })
    if (rows[0]) await update('app_settings', rows[0].id, { value, updated_at: new Date().toISOString() })
    else await insert('app_settings', { key, value, updated_at: new Date().toISOString() })
    setLogos((prev) => ({ ...prev, [app]: value }))
  }

  async function setLogo(app: AppKey, file: File) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Choisissez un fichier image (PNG, JPG, SVG ou WebP).')
    }
    if (supabase) {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `logo-${app}-${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('branding')
        .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from('branding').getPublicUrl(path)
      await saveValue(app, data.publicUrl)
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
      await saveValue(app, dataUrl)
    }
  }

  async function resetLogo(app: AppKey) {
    const rows = await list('app_settings', { key: APP_INFO[app].settingKey })
    if (rows[0]) await remove('app_settings', rows[0].id)
    setLogos((prev) => ({ ...prev, [app]: APP_INFO[app].defaultLogo }))
  }

  return (
    <BrandingContext.Provider value={{ logos, logoUrl: logos.desk, setLogo, resetLogo }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  return useContext(BrandingContext)
}
