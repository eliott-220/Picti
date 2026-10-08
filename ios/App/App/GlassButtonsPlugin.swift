import Capacitor
import UIKit

/// Vrais boutons Liquid Glass (iOS 26) posés au-dessus de la WebView, à la place des boutons
/// ronds, des pastilles et des sélecteurs web. Le JS (`src/glassButtons.ts`) envoie la liste
/// complète, cadres en points ; chaque appui renvoie l'événement `tap` avec l'identifiant
/// (et, pour un sélecteur segmenté, le choix touché).
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
    private var controls: [String: GlassControl] = [:]

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
        let wanted = Dictionary(specs.map { ($0.id, $0.kind) }, uniquingKeysWith: { first, _ in first })
        for (id, control) in controls where wanted[id] != control.kind {
            control.removeFromSuperview()
            controls[id] = nil
        }
        guard !specs.isEmpty, let container = container() else { return }
        UIView.performWithoutAnimation {
            for spec in specs {
                let control = controls[spec.id] ?? makeControl(spec, in: container)
                control.update(spec)
            }
        }
    }

    @available(iOS 26.0, *)
    private func makeControl(_ spec: GlassButtonSpec, in container: UIView) -> GlassControl {
        let onTap: (String, Int?) -> Void = { [weak self] id, index in
            var data: [String: Any] = ["id": id]
            if let index { data["index"] = index }
            self?.notifyListeners("tap", data: data)
        }
        let control: GlassControl = spec.kind == .segmented
            ? GlassSegmented(id: spec.id, onTap: onTap)
            : GlassButton(id: spec.id, onTap: onTap)
        container.addSubview(control)
        controls[spec.id] = control
        return control
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

/// Un bouton, une pastille ou un sélecteur tel que décrit par le JS.
struct GlassButtonSpec {
    enum Kind: String {
        case button
        case segmented
    }

    let id: String
    let kind: Kind
    /// Symbole SF d'un bouton rond, nil pour une pastille à texte.
    let symbol: String?
    /// Texte d'une pastille.
    let title: String?
    /// Choix d'un sélecteur segmenté et celui qui est sélectionné (−1 : aucun).
    let segments: [String]
    let selected: Int
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
        guard let id = object["id"] as? String else { return nil }
        func number(_ key: String) -> CGFloat { CGFloat((object[key] as? NSNumber)?.doubleValue ?? 0) }
        self.id = id
        kind = Kind(rawValue: object["kind"] as? String ?? "") ?? .button
        symbol = object["symbol"] as? String
        title = object["title"] as? String
        segments = (object["segments"] as? JSArray)?.compactMap { $0 as? String } ?? []
        selected = (object["selected"] as? NSNumber)?.intValue ?? -1
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
    /// Rouge PICTI (`--red`).
    static let picti = UIColor(red: 0xEB / 255, green: 0x0C / 255, blue: 0x0C / 255, alpha: 1)

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

/// Vue native qui remplace un bouton web.
protocol GlassControlUpdating {
    var kind: GlassButtonSpec.Kind { get }
    func update(_ spec: GlassButtonSpec)
}

typealias GlassControl = UIView & GlassControlUpdating

/// Bouton rond (icône) ou pastille (texte) en verre.
@available(iOS 26.0, *)
final class GlassButton: UIButton, GlassControlUpdating {
    let kind = GlassButtonSpec.Kind.button
    private let badgeLabel = UILabel()
    private var shown: (symbol: String?, title: String?, active: Bool, color: UIColor?)?
    private var rotation: CGFloat = 0

    init(id: String, onTap: @escaping (String, Int?) -> Void) {
        super.init(frame: .zero)
        addAction(UIAction { _ in onTap(id, nil) }, for: .primaryActionTriggered)
        badgeLabel.backgroundColor = .picti
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
        if shown?.symbol != spec.symbol || shown?.title != spec.title || shown?.active != spec.active
            || shown?.color != spec.color {
            // Verre standard : ses icônes passent du noir au blanc selon ce qui est derrière (caméra
            // claire ou sombre) ; le verre clair gardait des icônes noires, invisibles sur un fond sombre.
            // Teinté en rouge PICTI quand le bouton est actif (selfie, pastille sélectionnée).
            var config: UIButton.Configuration = spec.active ? .prominentGlass() : .glass()
            config.cornerStyle = .capsule
            if spec.active {
                config.baseBackgroundColor = .picti
                config.baseForegroundColor = .white
            }
            if let symbol = spec.symbol {
                let image = UIImage(
                    systemName: symbol,
                    withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .semibold)
                )
                // Le verre impose la couleur de ses icônes : une couleur voulue est fixée dans l'image.
                config.image = !spec.active && spec.color != nil
                    ? image?.withTintColor(spec.color!, renderingMode: .alwaysOriginal)
                    : image
            }
            if let title = spec.title {
                var text = AttributedString(title)
                text.font = .systemFont(ofSize: 15, weight: spec.active ? .semibold : .regular)
                config.attributedTitle = text
                config.titleLineBreakMode = .byClipping
                config.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4)
            }
            configuration = config
            shown = (spec.symbol, spec.title, spec.active, spec.color)
        }
        if frame != spec.frame { frame = spec.frame }
        if rotation != spec.rotation {
            rotation = spec.rotation
            setNeedsLayout()
        }
        accessibilityLabel = spec.label
        accessibilityTraits = spec.active && spec.title != nil ? [.button, .selected] : .button
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

/// Sélecteur segmenté iOS (« Monde / Amis ») dans une capsule en verre.
@available(iOS 26.0, *)
final class GlassSegmented: UIView, GlassControlUpdating {
    let kind = GlassButtonSpec.Kind.segmented
    private let glass = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
    private let control = UISegmentedControl()
    private var segments: [String] = []

    init(id: String, onTap: @escaping (String, Int?) -> Void) {
        super.init(frame: .zero)
        glass.cornerConfiguration = .capsule()
        addSubview(glass)
        glass.contentView.addSubview(control)
        control.selectedSegmentTintColor = .picti
        control.setTitleTextAttributes([.font: UIFont.systemFont(ofSize: 15)], for: .normal)
        control.setTitleTextAttributes(
            [.font: UIFont.systemFont(ofSize: 15, weight: .semibold), .foregroundColor: UIColor.white],
            for: .selected
        )
        control.addAction(UIAction { [weak control] _ in
            onTap(id, control?.selectedSegmentIndex ?? 0)
        }, for: .valueChanged)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non utilisé")
    }

    func update(_ spec: GlassButtonSpec) {
        if segments != spec.segments {
            control.removeAllSegments()
            for (index, title) in spec.segments.enumerated() {
                control.insertSegment(withTitle: title, at: index, animated: false)
            }
            segments = spec.segments
        }
        let selected = spec.selected >= 0 ? spec.selected : UISegmentedControl.noSegment
        if control.selectedSegmentIndex != selected { control.selectedSegmentIndex = selected }
        if frame != spec.frame {
            frame = spec.frame
            glass.frame = bounds
            control.frame = bounds.insetBy(dx: 4, dy: 4)
        }
        accessibilityLabel = spec.label
        alpha = spec.dim ? 0.55 : 1
        isHidden = !spec.visible
    }
}

/// Laisse passer à la page toutes les touches qui ne tombent pas sur un bouton.
final class PassthroughView: UIView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit === self ? nil : hit
    }
}
