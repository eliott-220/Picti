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
        // remet sa profondeur d'accord au `popstate` ; la page garde l'écran précédent monté, il
        // réapparaît tel quel). Sauf sur les cinq écrans de la barre du bas (0.23.1 : carte, amis,
        // viseur, mes photos, profil) : glisser y mène à l'écran voisin (`usePanes`), et sur la carte
        // le doigt la déplace — les gestes retour / avant de WebKit prendraient ces glissés.
        urlObservation = webView?.observe(\.url, options: [.initial, .new]) { webView, _ in
            webView.allowsBackForwardNavigationGestures = !Self.pageOwnsSwipes(webView.url)
        }
    }

    /// Écrans de la barre du bas : viseur (adresse sans ancre, ou `#/`), `#/carte`, `#/amis`,
    /// `#/photos`, `#/profil` (et les anciennes `#/profil/amis`, `#/notifications`) — `parseHash` de
    /// `src/router.ts`.
    static func pageOwnsSwipes(_ url: URL?) -> Bool {
        guard let url else { return true }
        let path = (url.fragment ?? "").split(separator: "?").first.map(String.init) ?? ""
        let head = path.split(separator: "/").first.map(String.init) ?? ""
        return ["", "carte", "amis", "photos", "profil", "notifications"].contains(head)
    }
}
