import Capacitor
import UIKit

/// Vrais boutons Liquid Glass (iOS 26) posés au-dessus de la WebView, à la place des boutons
/// ronds web du viseur. Le JS (`src/glassButtons.ts`) envoie la liste complète des boutons,
/// cadres en points ; chaque appui renvoie l'événement `tap` avec l'identifiant du bouton.
@objc(GlassButtonsPlugin)
public class GlassButtonsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GlassButtonsPlugin"
    public let jsName = "GlassButtons"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private var overlay: PassthroughView?
    private var buttons: [String: UIButton] = [:]

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 26.0, *) {
            call.resolve(["available": true])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let specs = (call.getArray("buttons") ?? []).compactMap { $0 as? JSObject }.compactMap(GlassButtonSpec.init)
        DispatchQueue.main.async {
            self.apply(specs)
            call.resolve()
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.apply([])
            call.resolve()
        }
    }

    private func apply(_ specs: [GlassButtonSpec]) {
        guard #available(iOS 26.0, *) else { return }
        let wanted = Set(specs.map(\.id))
        for (id, button) in buttons where !wanted.contains(id) {
            button.removeFromSuperview()
            buttons[id] = nil
        }
        guard !specs.isEmpty, let container = container() else { return }
        UIView.performWithoutAnimation {
            for spec in specs {
                let button = buttons[spec.id] as? GlassButton ?? makeButton(spec.id, in: container)
                button.update(spec)
            }
        }
    }

    @available(iOS 26.0, *)
    private func makeButton(_ id: String, in container: UIView) -> GlassButton {
        let button = GlassButton(id: id) { [weak self] id in
            self?.notifyListeners("tap", data: ["id": id])
        }
        container.addSubview(button)
        buttons[id] = button
        return button
    }

    /// Calque transparent au-dessus de la page : seuls les boutons reçoivent les touches.
    private func container() -> PassthroughView? {
        if let overlay { return overlay }
        guard let webView = bridge?.webView else { return nil }
        let view = PassthroughView(frame: webView.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = .clear
        webView.addSubview(view)
        overlay = view
        return view
    }
}

/// Un bouton tel que décrit par le JS.
struct GlassButtonSpec {
    let id: String
    let symbol: String
    let label: String
    let frame: CGRect
    let badge: String?
    let dim: Bool
    let active: Bool
    let disabled: Bool
    /// Rotation de l'icône en degrés (boussole de la carte).
    let rotation: CGFloat
    /// Couleur de l'icône (« #eb0c0c »), nil : couleur du verre.
    let color: UIColor?
    let visible: Bool

    init?(_ object: JSObject) {
        guard let id = object["id"] as? String, let symbol = object["symbol"] as? String else { return nil }
        func number(_ key: String) -> CGFloat { CGFloat((object[key] as? NSNumber)?.doubleValue ?? 0) }
        self.id = id
        self.symbol = symbol
        label = object["label"] as? String ?? ""
        frame = CGRect(x: number("x"), y: number("y"), width: number("width"), height: number("height"))
        badge = object["badge"] as? String
        dim = object["dim"] as? Bool ?? false
        active = object["active"] as? Bool ?? false
        disabled = object["disabled"] as? Bool ?? false
        rotation = number("rotation")
        color = (object["color"] as? String).flatMap(UIColor.init(hex:))
        visible = object["visible"] as? Bool ?? true
    }
}

extension UIColor {
    /// « #rrggbb ».
    convenience init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}

@available(iOS 26.0, *)
final class GlassButton: UIButton {
    private let badgeLabel = UILabel()
    private var shown: (symbol: String, active: Bool, color: UIColor?)?
    private var rotation: CGFloat = 0

    init(id: String, onTap: @escaping (String) -> Void) {
        super.init(frame: .zero)
        addAction(UIAction { _ in onTap(id) }, for: .primaryActionTriggered)
        badgeLabel.backgroundColor = UIColor(red: 0xEB / 255, green: 0x0C / 255, blue: 0x0C / 255, alpha: 1)
        badgeLabel.textColor = .white
        badgeLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        badgeLabel.textAlignment = .center
        badgeLabel.layer.cornerRadius = 11
        badgeLabel.clipsToBounds = true
        badgeLabel.isUserInteractionEnabled = false
        addSubview(badgeLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non utilisé")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        imageView?.transform = CGAffineTransform(rotationAngle: rotation * .pi / 180)
    }

    func update(_ spec: GlassButtonSpec) {
        if shown?.symbol != spec.symbol || shown?.active != spec.active || shown?.color != spec.color {
            // Verre standard : ses icônes passent du noir au blanc selon ce qui est derrière (caméra
            // claire ou sombre) ; le verre clair gardait des icônes noires, invisibles sur un fond sombre.
            // Teinté en rouge PICTI quand le bouton est actif (selfie).
            var config: UIButton.Configuration = spec.active ? .prominentGlass() : .glass()
            let image = UIImage(
                systemName: spec.symbol,
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .semibold)
            )
            config.cornerStyle = .capsule
            if spec.active {
                config.image = image
                config.baseBackgroundColor = badgeLabel.backgroundColor
                config.baseForegroundColor = .white
            } else if let color = spec.color {
                // Le verre impose la couleur de ses icônes : la couleur est fixée dans l'image.
                config.image = image?.withTintColor(color, renderingMode: .alwaysOriginal)
            } else {
                config.image = image
            }
            configuration = config
            shown = (spec.symbol, spec.active, spec.color)
        }
        if frame != spec.frame { frame = spec.frame }
        if rotation != spec.rotation {
            rotation = spec.rotation
            setNeedsLayout()
        }
        accessibilityLabel = spec.label
        isEnabled = !spec.disabled
        alpha = spec.dim || spec.disabled ? 0.55 : 1
        isHidden = !spec.visible

        badgeLabel.isHidden = spec.badge == nil
        if let badge = spec.badge {
            badgeLabel.text = badge
            let width = max(22, badgeLabel.intrinsicContentSize.width + 12)
            badgeLabel.frame = CGRect(x: bounds.width + 4 - width, y: -4, width: width, height: 22)
            bringSubviewToFront(badgeLabel)
        }
    }
}

/// Laisse passer à la page toutes les touches qui ne tombent pas sur un bouton.
final class PassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}
