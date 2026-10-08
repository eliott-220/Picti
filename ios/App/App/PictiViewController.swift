import Capacitor
import UIKit

/// Contrôleur de la coque : enregistre les plugins propres à PICTI (dans l'app, pas sur npm).
class PictiViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GlassButtonsPlugin())
    }
}
