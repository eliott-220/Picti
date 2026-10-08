// Coque native Capacitor (iOS + Android) : le web construit (`dist/`) est embarqué dans l'app.
// Voir « App native (Capacitor) » dans README.md.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.picti',
  appName: 'PICTI',
  webDir: 'dist',
  backgroundColor: '#ffffff',
  plugins: {
    // Android : textes de la barre d'état en blanc (fond caméra sombre, en-têtes rouges),
    // comme le « black-translucent » de la version web. iOS : `UIStatusBarStyle` de l'Info.plist.
    SystemBars: { style: 'DARK', initialViewportFitValueHint: 'cover' },
  },
  // Test seulement : charge le site en ligne au lieu du web embarqué (Apple refuse
  // souvent une app qui n'est qu'un site dans une coque, règle 4.2).
  // server: { url: 'https://picti.vercel.app' },
}

export default config
