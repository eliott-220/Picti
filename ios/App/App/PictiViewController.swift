import Capacitor
import UIKit

/// Contrôleur de la coque : enregistre les plugins propres à PICTI (dans l'app, pas sur npm).
class PictiViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GlassButtonsPlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        // Retour en glissant le doigt depuis le bord gauche, comme dans les apps iOS : l'écran
        // précédent apparaît dessous (historique de la page, `#/…` compris ; `src/router.ts`
        // remet sa profondeur d'accord au `popstate`).
        webView?.allowsBackForwardNavigationGestures = true
    }
}
