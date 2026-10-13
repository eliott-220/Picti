import Capacitor
import UIKit

/// Vrais boutons Liquid Glass (iOS 26) à la place des boutons ronds, des pastilles, des
/// sélecteurs web et (0.23.0) de la barre flottante du bas (pilule, Menu, avatar, bouton rouge). Le JS (`src/glassButtons.ts`) envoie la liste complète, cadres en points.
/// Ils ne font que l'affichage : les touches passent au bouton web, transparent, en dessous
/// (défilement, appuis, VoiceOver). Un bouton situé dans une zone qui défile est posé dans la
/// vue de défilement d'iOS qui la porte (WebKit en crée une par zone `overflow` qui défile) : il
/// défile avec le texte, coupé et recouvert comme la page. Les autres sont sur un calque fixe.
@objc(GlassButtonsPlugin)
public class GlassButtonsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GlassButtonsPlugin"
    public let jsName = "GlassButtons"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private var overlay: UIView?
    private var controls: [String: GlassControl] = [:]
    /// Vue de défilement d'iOS de chaque zone qui défile (clé donnée par le JS).
    private var scrollViews: [Int: Weak<UIScrollView>] = [:]

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
        guard !specs.isEmpty, let overlay = container() else { return }
        UIView.performWithoutAnimation {
            for spec in specs {
                let control = controls[spec.id] ?? makeControl(spec)
                let scrollView = spec.scroller.flatMap(scrollView(for:))
                let target: UIView = scrollView ?? overlay
                if control.superview !== target {
                    // La pilule de la barre passe sous tout le reste (bouton rouge compris).
                    if spec.kind == .bar {
                        target.insertSubview(control, at: 0)
                    } else {
                        target.addSubview(control)
                    }
                } else if scrollView != nil, target.subviews.last !== control {
                    // Toujours au-dessus du contenu que WebKit a pu ajouter depuis.
                    target.bringSubviewToFront(control)
                }
                control.update(spec, embedded: scrollView != nil)
            }
        }
    }

    @available(iOS 26.0, *)
    private func makeControl(_ spec: GlassButtonSpec) -> GlassControl {
        let control: GlassControl
        switch spec.kind {
        case .segmented: control = GlassSegmented()
        case .bar: control = GlassBar()
        case .shutter: control = GlassShutter()
        case .button: control = GlassButton()
        }
        // Affichage seulement : les touches vont au bouton web en dessous, VoiceOver aussi.
        control.isUserInteractionEnabled = false
        control.accessibilityElementsHidden = true
        controls[spec.id] = control
        return control
    }

    /// Calque fixe au-dessus de la page, pour les boutons hors des zones qui défilent. Posé dans
    /// la vue de défilement principale de la WebView (la page entière, qui ne défile pas) et non
    /// sur la WebView : il glisse avec la page lors du retour par le bord gauche, et l'image de
    /// l'écran précédent qu'iOS affiche alors passe par-dessus.
    private func container() -> UIView? {
        guard let scrollView = bridge?.webView?.scrollView else { return nil }
        if let overlay, overlay.superview === scrollView {
            if scrollView.subviews.last !== overlay { scrollView.bringSubviewToFront(overlay) }
            return overlay
        }
        let view = overlay ?? UIView()
        view.frame = CGRect(origin: .zero, size: scrollView.bounds.size)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        scrollView.addSubview(view)
        overlay = view
        return view
    }

    /**
     Vue de défilement d'iOS d'une zone qui défile : retrouvée une fois par son cadre à l'écran
     parmi celles que WebKit a créées, puis gardée (tant qu'elle existe).
     */
    private func scrollView(for scroller: GlassButtonSpec.Scroller) -> UIScrollView? {
        if let known = scrollViews[scroller.key]?.value, known.window != nil { return known }
        guard let webView = bridge?.webView else { return nil }
        var best: UIScrollView?
        var bestGap = CGFloat.greatestFiniteMagnitude
        func visit(_ view: UIView) {
            for sub in view.subviews {
                if let candidate = sub as? UIScrollView, let parent = candidate.superview {
                    let frame = parent.convert(candidate.frame, to: webView)
                    let gap = abs(frame.minX - scroller.frame.minX) + abs(frame.minY - scroller.frame.minY)
                        + abs(frame.width - scroller.frame.width) + abs(frame.height - scroller.frame.height)
                    if gap < bestGap {
                        bestGap = gap
                        best = candidate
                    }
                }
                visit(sub)
            }
        }
        visit(webView.scrollView)
        guard let best, bestGap < 4 else { return nil }
        scrollViews[scroller.key] = Weak(best)
        return best
    }
}

final class Weak<T: AnyObject> {
    weak var value: T?
    init(_ value: T) { self.value = value }
}

/// Un bouton, une pastille ou un sélecteur tel que décrit par le JS.
struct GlassButtonSpec {
    enum Kind: String {
        case button
        case segmented
        /// Pilule de la barre du bas, avec ses éléments (`items`).
        case bar
        /// Bouton rouge (symbole du mode, pastille ⚠).
        case shutter
    }

    /// Élément dessiné dans la pilule de la barre (Menu, avatar), cadre relatif à la pilule.
    struct BarItem: Equatable {
        let frame: CGRect
        let symbol: String?
        let initial: String?
        let badge: String?
        let active: Bool
    }

    /// Zone qui défile autour du bouton : sa clé et sa partie visible à l'écran.
    struct Scroller {
        let key: Int
        let frame: CGRect
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
    /// Cadre à l'écran (bouton fixe).
    let frame: CGRect
    /// Zone qui défile, et position du bouton dans son contenu.
    let scroller: Scroller?
    let contentOrigin: CGPoint
    let badge: String?
    let dim: Bool
    let active: Bool
    let disabled: Bool
    /// Rotation de l'icône en degrés (boussole de la carte).
    let rotation: CGFloat
    /// Couleur de l'icône (« #eb0c0c »), nil : couleur du verre.
    let color: UIColor?
    let visible: Bool
    let items: [BarItem]
    let warn: Bool

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
        if let zone = object["scroller"] as? JSObject, let key = (zone["key"] as? NSNumber)?.intValue {
            func value(_ name: String) -> CGFloat { CGFloat((zone[name] as? NSNumber)?.doubleValue ?? 0) }
            scroller = Scroller(
                key: key,
                frame: CGRect(x: value("x"), y: value("y"), width: value("width"), height: value("height"))
            )
        } else {
            scroller = nil
        }
        contentOrigin = CGPoint(x: number("cx"), y: number("cy"))
        badge = object["badge"] as? String
        dim = object["dim"] as? Bool ?? false
        active = object["active"] as? Bool ?? false
        disabled = object["disabled"] as? Bool ?? false
        rotation = number("rotation")
        color = (object["color"] as? String).flatMap(UIColor.init(hex:))
        visible = object["visible"] as? Bool ?? true
        items = (object["items"] as? JSArray)?.compactMap { $0 as? JSObject }.map { item in
            func value(_ name: String) -> CGFloat { CGFloat((item[name] as? NSNumber)?.doubleValue ?? 0) }
            return BarItem(
                frame: CGRect(x: value("x"), y: value("y"), width: value("width"), height: value("height")),
                symbol: item["symbol"] as? String,
                initial: item["initial"] as? String,
                badge: item["badge"] as? String,
                active: item["active"] as? Bool ?? false
            )
        } ?? []
        warn = object["warn"] as? Bool ?? false
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

/// Vue native qui affiche un bouton web.
protocol GlassControlUpdating {
    var kind: GlassButtonSpec.Kind { get }
    /// `embedded` : posé dans une vue de défilement (cadre dans son contenu, recouvert par la page).
    func update(_ spec: GlassButtonSpec, embedded: Bool)
}

extension GlassButtonSpec {
    /// Cadre dans la vue qui porte le bouton.
    func frame(embedded: Bool) -> CGRect {
        embedded ? CGRect(origin: contentOrigin, size: frame.size) : frame
    }

    /// Un bouton fixe se cache quand le web est recouvert ; un bouton dans une zone qui défile est
    /// coupé et recouvert par la page elle-même.
    func hidden(embedded: Bool) -> Bool {
        embedded ? frame.isEmpty : !visible
    }
}

typealias GlassControl = UIView & GlassControlUpdating

/// Bouton rond (icône) ou pastille (texte) en verre.
@available(iOS 26.0, *)
final class GlassButton: UIButton, GlassControlUpdating {
    let kind = GlassButtonSpec.Kind.button
    private let badgeLabel = UILabel()
    private var shown: (symbol: String?, title: String?, active: Bool, color: UIColor?)?
    private var rotation: CGFloat = 0

    init() {
        super.init(frame: .zero)
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

    func update(_ spec: GlassButtonSpec, embedded: Bool) {
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
        let target = spec.frame(embedded: embedded)
        if frame != target { frame = target }
        if rotation != spec.rotation {
            rotation = spec.rotation
            setNeedsLayout()
        }
        isEnabled = !spec.disabled
        alpha = spec.dim || spec.disabled ? 0.55 : 1
        isHidden = spec.hidden(embedded: embedded)

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

    init() {
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
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non utilisé")
    }

    func update(_ spec: GlassButtonSpec, embedded: Bool) {
        if segments != spec.segments {
            control.removeAllSegments()
            for (index, title) in spec.segments.enumerated() {
                control.insertSegment(withTitle: title, at: index, animated: false)
            }
            segments = spec.segments
        }
        let selected = spec.selected >= 0 ? spec.selected : UISegmentedControl.noSegment
        if control.selectedSegmentIndex != selected { control.selectedSegmentIndex = selected }
        let target = spec.frame(embedded: embedded)
        if frame != target {
            frame = target
            glass.frame = bounds
            control.frame = bounds.insetBy(dx: 4, dy: 4)
        }
        alpha = spec.dim ? 0.55 : 1
        isHidden = spec.hidden(embedded: embedded)
    }
}

/// Pilule de la barre flottante du bas (0.23.0) : verre Liquid Glass en capsule ; Menu (symbole) et
/// avatar (initiale) sont dessinés dans son contenu, là où sont les boutons web (transparents, qu'on touche).
@available(iOS 26.0, *)
final class GlassBar: UIView, GlassControlUpdating {
    let kind = GlassButtonSpec.Kind.bar
    private let glass = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
    private var itemViews: [GlassBarItemView] = []

    init() {
        super.init(frame: .zero)
        glass.cornerConfiguration = .capsule()
        addSubview(glass)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non utilisé")
    }

    func update(_ spec: GlassButtonSpec, embedded: Bool) {
        let target = spec.frame(embedded: embedded)
        if frame != target {
            frame = target
            glass.frame = bounds
        }
        while itemViews.count < spec.items.count {
            let view = GlassBarItemView()
            glass.contentView.addSubview(view)
            itemViews.append(view)
        }
        while itemViews.count > spec.items.count {
            itemViews.removeLast().removeFromSuperview()
        }
        for (view, item) in zip(itemViews, spec.items) {
            view.update(item)
        }
        alpha = spec.dim ? 0.55 : 1
        isHidden = spec.hidden(embedded: embedded)
    }
}

/// Élément de la pilule : symbole (couleur du texte, adaptée par le verre au clair ou au sombre ; rouge
/// pour l'écran affiché) ou avatar (rond saumon, initiale blanche), pastille rouge.
final class GlassBarItemView: UIView {
    private let symbolView = UIImageView()
    private let avatar = UILabel()
    private let badgeLabel = UILabel()
    private var shown: GlassButtonSpec.BarItem?

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        symbolView.contentMode = .center
        symbolView.tintColor = .label
        addSubview(symbolView)
        avatar.textAlignment = .center
        avatar.textColor = .white
        avatar.font = .systemFont(ofSize: 17, weight: .semibold)
        avatar.backgroundColor = UIColor(red: 1, green: 0x84 / 255, blue: 0x84 / 255, alpha: 1)
        avatar.clipsToBounds = true
        addSubview(avatar)
        badgeLabel.backgroundColor = .picti
        badgeLabel.textColor = .white
        badgeLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        badgeLabel.textAlignment = .center
        badgeLabel.layer.cornerRadius = 11
        badgeLabel.clipsToBounds = true
        addSubview(badgeLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non utilisé")
    }

    func update(_ item: GlassButtonSpec.BarItem) {
        if frame != item.frame { frame = item.frame }
        // Mise en page à chaque fois (la pilule peut changer de taille) ; contenu seulement s'il change.
        symbolView.frame = bounds
        let side = min(bounds.width, bounds.height, 38)
        avatar.frame = CGRect(x: (bounds.width - side) / 2, y: (bounds.height - side) / 2, width: side, height: side)
        avatar.layer.cornerRadius = side / 2
        if shown != item {
            shown = item
            symbolView.isHidden = item.symbol == nil
            avatar.isHidden = item.symbol != nil
            symbolView.image = item.symbol.flatMap {
                UIImage(systemName: $0, withConfiguration: UIImage.SymbolConfiguration(pointSize: 21, weight: .semibold))
            }
            // Écran affiché (0.23.1) : pictogramme en plein (le JS envoie la variante `.fill`), en rouge.
            symbolView.tintColor = item.active ? .picti : .label
            avatar.text = item.initial ?? "?"
            avatar.layer.borderWidth = item.active ? 2.5 : 2
            avatar.layer.borderColor = (item.active ? UIColor.picti : UIColor.white).cgColor
            badgeLabel.text = item.badge
        }
        badgeLabel.isHidden = item.badge == nil
        if item.badge != nil {
            let width = max(22, badgeLabel.intrinsicContentSize.width + 12)
            badgeLabel.frame = CGRect(x: bounds.width - width + 2, y: 0, width: width, height: 22)
            bringSubviewToFront(badgeLabel)
        }
    }
}

/// Bouton rouge de la barre (0.23.0) : cercle rouge PICTI, symbole blanc du mode (Public, Amis, Privé),
/// lueur rouge ; sa taille suit celle du bouton web (grand sur le viseur, réduit ailleurs, grossi pendant
/// le choix du mode). Pastille orange ⚠ en « Reproduire » hors de la vue de l'originale.
@available(iOS 26.0, *)
final class GlassShutter: UIView, GlassControlUpdating {
    let kind = GlassButtonSpec.Kind.shutter
    private let circle = UIView()
    private let symbolView = UIImageView()
    private let warnView = UIImageView()
    private var shownSymbol: (name: String?, size: CGFloat)?

    init() {
        super.init(frame: .zero)
        circle.backgroundColor = .picti
        circle.layer.shadowColor = UIColor.picti.cgColor
        circle.layer.shadowOpacity = 0.45
        circle.layer.shadowOffset = CGSize(width: 0, height: 6)
        addSubview(circle)
        symbolView.tintColor = .white
        symbolView.contentMode = .center
        addSubview(symbolView)
        warnView.image = UIImage(systemName: "exclamationmark.triangle.fill")
        warnView.tintColor = .white
        warnView.backgroundColor = UIColor(red: 0xE8 / 255, green: 0x76 / 255, blue: 0, alpha: 1)
        warnView.contentMode = .center
        warnView.layer.borderColor = UIColor.white.cgColor
        warnView.layer.borderWidth = 2
        warnView.clipsToBounds = true
        addSubview(warnView)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) non utilisé")
    }

    func update(_ spec: GlassButtonSpec, embedded: Bool) {
        let target = spec.frame(embedded: embedded)
        if frame != target {
            frame = target
            circle.frame = bounds
            circle.layer.cornerRadius = bounds.width / 2
            circle.layer.shadowRadius = bounds.width * 0.16
            symbolView.frame = bounds
            let side = max(18, bounds.width * 0.34)
            warnView.frame = CGRect(x: bounds.width - side + 2, y: -2, width: side, height: side)
            warnView.layer.cornerRadius = side / 2
        }
        // Symbole à 40 % du diamètre, comme l'icône de 36 px dans le bouton web de 76 px.
        let size = (bounds.width * 0.4).rounded()
        if shownSymbol?.name != spec.symbol || shownSymbol?.size != size {
            symbolView.image = spec.symbol.flatMap {
                UIImage(systemName: $0, withConfiguration: UIImage.SymbolConfiguration(pointSize: size, weight: .semibold))
            }
            shownSymbol = (spec.symbol, size)
        }
        warnView.isHidden = !spec.warn
        alpha = spec.disabled ? 0.7 : 1
        isHidden = spec.hidden(embedded: embedded)
    }
}
