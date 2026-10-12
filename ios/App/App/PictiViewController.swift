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
        // remet sa profondeur d'accord au `popstate`). Sauf sur le viseur et la carte (0.23.0) : la
        // page y a ses propres glissés (`usePanes`) — sur le viseur, vers la gauche le profil, vers la
        // droite la carte ; sur la carte, le doigt la déplace et le bord droit ramène au viseur —, que
        // les gestes retour / avant de WebKit prendraient sinon (et le viseur n'a rien avant lui).
        urlObservation = webView?.observe(\.url, options: [.initial, .new]) { webView, _ in
            webView.allowsBackForwardNavigationGestures = !Self.pageOwnsSwipes(webView.url)
        }
    }

    /// Viseur (adresse sans ancre, ou `#/`) ou carte (`#/carte`) : `parseHash` de `src/router.ts`.
    static func pageOwnsSwipes(_ url: URL?) -> Bool {
        guard let url else { return true }
        let path = (url.fragment ?? "").split(separator: "?").first.map(String.init) ?? ""
        return path.isEmpty || path == "/" || path == "/carte" || path == "/carte/"
    }
}
