import Capacitor
import UIKit
import WebKit

/// Contrôleur de la coque : enregistre les plugins propres à PICTI (dans l'app, pas sur npm).
class PictiViewController: CAPBridgeViewController {
    private var urlObservation: NSKeyValueObservation?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GlassButtonsPlugin())
        bridge?.registerPluginInstance(PositionPlugin())
        bridge?.registerPluginInstance(ArTrackingPlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        // Retour en glissant le doigt depuis le bord gauche, comme dans les apps iOS : l'écran
        // précédent apparaît dessous (historique de la page, `#/…` compris ; `src/router.ts`
        // remet sa profondeur d'accord au `popstate`). Sauf sur l'accueil : il n'y a rien avant
        // lui (on y revient toujours en remplaçant l'entrée), et glisser de droite à gauche y
        // ouvre le profil (`useSwipeOpen`) au lieu de rouvrir le dernier écran quitté.
        urlObservation = webView?.observe(\.url, options: [.initial, .new]) { webView, _ in
            webView.allowsBackForwardNavigationGestures = !Self.isHome(webView.url)
        }
    }

    /// Accueil (viseur) de la page : adresse sans ancre, ou `#/` (`parseHash` de `src/router.ts`).
    static func isHome(_ url: URL?) -> Bool {
        guard let url else { return true }
        let fragment = url.fragment ?? ""
        return fragment.isEmpty || fragment == "/"
    }
}
