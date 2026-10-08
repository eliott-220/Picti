import ARKit
import Capacitor
import CoreLocation
import CoreImage
import QuartzCore
import SceneKit
import UIKit

/// Suivi visuel (ARKit) pour le viseur de l'app iOS : la caméra est affichée par iOS derrière la
/// page (transparente à cet endroit) et la pose de la caméra (position au centimètre, orientation)
/// est envoyée au JS à chaque image. Le JS (`src/sensors/arTracking.ts`) cale ce repère sur la Terre
/// avec le GPS et la boussole (`src/geo/arAlign.ts`) : les photos restent à leur place quand on
/// marche, au lieu de suivre les écarts du GPS.
///
/// Repère : `worldAlignment = .gravity` (y vers le haut, cap arbitraire : c'est le calage qui le
/// trouve). Poses en portrait (`viewMatrix(for: .portrait)`) : colonnes droite, haut, arrière.
@objc(ArTrackingPlugin)
public class ArTrackingPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "ArTrackingPlugin"
    public let jsName = "ArTracking"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geoTrackingAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendTrace", returnType: CAPPluginReturnPromise)
    ]

    private var arView: ARSCNView?
    private var running = false
    /// Numéro de la session : un nouveau repère à chaque démarrage (le JS repart de zéro).
    private var sessionId = 0
    private var lastTracking = ""
    private var lastCamera = ""
    /// Opacité et couleurs de la WebView avant qu'elle ne devienne transparente.
    private var savedBackground: (opaque: Bool, view: UIColor?, scroll: UIColor?)?
    private let imageContext = CIContext()
    private var lastCapture: URL?

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": ARWorldTrackingConfiguration.isSupported])
    }

    /// Démarre une nouvelle session (nouveau repère). Sans effet visible tant que `show` n'est pas appelé.
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard ARWorldTrackingConfiguration.isSupported else {
                call.reject("Suivi visuel indisponible sur cet appareil", "UNAVAILABLE")
                return
            }
            self.run()
            call.resolve(["session": self.sessionId])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = false
            self.arView?.session.pause()
            self.hideView()
            call.resolve()
        }
    }

    /// Affiche la caméra derrière la page, dans le cadre `x`, `y`, `width`, `height` (points de la page).
    @objc func show(_ call: CAPPluginCall) {
        let rect = CGRect(
            x: call.getDouble("x") ?? 0,
            y: call.getDouble("y") ?? 0,
            width: call.getDouble("width") ?? 0,
            height: call.getDouble("height") ?? 0
        )
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView, let container = webView.superview else {
                call.reject("Page indisponible")
                return
            }
            let view = self.view()
            if view.superview !== container {
                view.removeFromSuperview()
                container.insertSubview(view, belowSubview: webView)
            }
            let frame = rect.width > 0 && rect.height > 0 ? webView.convert(rect, to: container) : webView.frame
            if view.frame != frame { view.frame = frame }
            if self.savedBackground == nil {
                self.savedBackground = (webView.isOpaque, webView.backgroundColor, webView.scrollView.backgroundColor)
            }
            // Autour de la caméra (écran « Reproduire »), la page transparente laisse voir la fenêtre : noire.
            if container.backgroundColor == nil { container.backgroundColor = .black }
            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear
            view.isHidden = false
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.hideView()
            call.resolve()
        }
    }

    /// Photo : l'image de l'objectif à sa meilleure résolution (iOS 16+), enregistrée en JPEG dans un
    /// fichier temporaire, avec la pose et la focale de cette image.
    @objc func capture(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.running, let session = self.arView?.session else {
                call.reject("Suivi visuel arrêté", "NOT_RUNNING")
                return
            }
            let finish: (ARFrame?) -> Void = { frame in
                guard let frame else {
                    call.reject("Image indisponible", "NO_FRAME")
                    return
                }
                DispatchQueue.global(qos: .userInitiated).async {
                    self.encode(frame, call)
                }
            }
            if #available(iOS 16.0, *) {
                session.captureHighResolutionFrame { frame, _ in
                    // Pas d'image haute résolution (format vidéo qui ne le permet pas) : l'image courante.
                    DispatchQueue.main.async { finish(frame ?? session.currentFrame) }
                }
            } else {
                finish(session.currentFrame)
            }
        }
    }

    /// Localisation visuelle d'Apple (`ARGeoTrackingConfiguration`, au mètre près là où Apple a
    /// photographié les rues) : disponible ou non en chacun des points `points` ([{ lat, lon }]).
    @objc func geoTrackingAvailability(_ call: CAPPluginCall) {
        let points = (call.getArray("points") ?? []).compactMap { $0 as? JSObject }
        guard ARGeoTrackingConfiguration.isSupported else {
            call.resolve(["supported": false, "available": points.map { _ in false }])
            return
        }
        var results = [Bool](repeating: false, count: points.count)
        var errors = [String](repeating: "", count: points.count)
        let group = DispatchGroup()
        for (i, point) in points.enumerated() {
            guard let lat = point["lat"] as? Double, let lon = point["lon"] as? Double else { continue }
            group.enter()
            ARGeoTrackingConfiguration.checkAvailability(at: CLLocationCoordinate2D(latitude: lat, longitude: lon)) { available, error in
                DispatchQueue.main.async {
                    results[i] = available
                    errors[i] = error?.localizedDescription ?? ""
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) {
            call.resolve(["supported": true, "available": results, "errors": errors])
        }
    }

    /// Version de test : ajoute des lignes au journal `Documents/traces/<name>.jsonl` (trajets rejoués
    /// sur le Mac pour régler le calage ; récupérés par `devicectl device copy from`).
    @objc func appendTrace(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), name.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
              let text = call.getString("text") else {
            call.reject("Journal invalide")
            return
        }
        DispatchQueue.global(qos: .utility).async {
            do {
                let dir = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                    .appendingPathComponent("traces", isDirectory: true)
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                let url = dir.appendingPathComponent("\(name).jsonl")
                if !FileManager.default.fileExists(atPath: url.path) {
                    FileManager.default.createFile(atPath: url.path, contents: nil)
                }
                let handle = try FileHandle(forWritingTo: url)
                defer { try? handle.close() }
                handle.seekToEndOfFile()
                handle.write(Data(text.utf8))
                call.resolve()
            } catch {
                call.reject("Écriture impossible")
            }
        }
    }

    // MARK: - Session

    private func view() -> ARSCNView {
        if let arView { return arView }
        let view = ARSCNView(frame: .zero)
        view.scene = SCNScene()
        view.automaticallyUpdatesLighting = false
        view.rendersCameraGrain = false
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        view.backgroundColor = .black
        view.session.delegate = self
        view.isHidden = true
        arView = view
        return view
    }

    private func run() {
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        configuration.isAutoFocusEnabled = true
        if #available(iOS 16.0, *), let format = ARWorldTrackingConfiguration.recommendedVideoFormatForHighResolutionFrameCapturing {
            configuration.videoFormat = format
        }
        sessionId += 1
        lastTracking = ""
        lastCamera = ""
        running = true
        view().session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    private func hideView() {
        arView?.isHidden = true
        guard let webView = bridge?.webView, let saved = savedBackground else { return }
        webView.backgroundColor = saved.view
        webView.scrollView.backgroundColor = saved.scroll
        webView.isOpaque = saved.opaque
        savedBackground = nil
    }

    /// Instant d'une image (horloge de `CACurrentMediaTime`) en ms depuis 1970, comme `Date.now()`.
    private static func epochMs(_ timestamp: TimeInterval) -> Double {
        (Date().timeIntervalSince1970 - CACurrentMediaTime() + timestamp) * 1000
    }

    private static func vector(_ v: simd_float4) -> [Double] {
        [Double(v.x), Double(v.y), Double(v.z)]
    }

    private func poseObject(_ frame: ARFrame) -> JSObject {
        let m = simd_inverse(frame.camera.viewMatrix(for: .portrait))
        return [
            "s": sessionId,
            "t": ArTrackingPlugin.epochMs(frame.timestamp),
            "p": ArTrackingPlugin.vector(m.columns.3),
            "r": ArTrackingPlugin.vector(m.columns.0),
            "u": ArTrackingPlugin.vector(m.columns.1),
            "b": ArTrackingPlugin.vector(m.columns.2)
        ]
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard running else { return }
        // Image de l'objectif en portrait : largeur et hauteur échangées, même focale (px).
        let resolution = frame.camera.imageResolution
        let focal = Double(frame.camera.intrinsics[0][0])
        let camera = "\(Int(resolution.width))x\(Int(resolution.height))@\(Int(focal.rounded()))"
        if camera != lastCamera {
            lastCamera = camera
            notifyListeners("camera", data: ["s": sessionId, "width": Double(resolution.height), "height": Double(resolution.width), "focal": focal])
        }
        notifyListeners("pose", data: poseObject(frame))
    }

    public func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        var state = "normal"
        var reason: String?
        switch camera.trackingState {
        case .notAvailable:
            state = "notAvailable"
        case .limited(let limited):
            state = "limited"
            switch limited {
            case .initializing: reason = "initializing"
            case .excessiveMotion: reason = "excessiveMotion"
            case .insufficientFeatures: reason = "insufficientFeatures"
            case .relocalizing: reason = "relocalizing"
            @unknown default: reason = "unknown"
            }
        case .normal:
            break
        }
        let key = state + (reason ?? "")
        guard key != lastTracking else { return }
        lastTracking = key
        notifyListeners("tracking", data: ["s": sessionId, "state": state, "reason": reason ?? NSNull()])
    }

    public func sessionWasInterrupted(_ session: ARSession) {
        notifyListeners("tracking", data: ["s": sessionId, "state": "interrupted", "reason": NSNull()])
        lastTracking = "interrupted"
    }

    /// Après une interruption (app en arrière-plan, appel), on repart d'un repère neuf : le téléphone a
    /// pu bouger sans être suivi.
    public func sessionInterruptionEnded(_ session: ARSession) {
        guard running else { return }
        DispatchQueue.main.async {
            self.run()
            self.notifyListeners("session", data: ["s": self.sessionId])
        }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        notifyListeners("tracking", data: ["s": sessionId, "state": "failed", "reason": error.localizedDescription])
    }

    // MARK: - Photo

    private func encode(_ frame: ARFrame, _ call: CAPPluginCall) {
        let image = CIImage(cvPixelBuffer: frame.capturedImage).oriented(.right)
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let data = imageContext.jpegRepresentation(
                of: image,
                colorSpace: colorSpace,
                options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.92]
              ) else {
            call.reject("Encodage JPEG impossible", "ENCODE")
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("picti-\(UUID().uuidString).jpg")
        do {
            try data.write(to: url)
        } catch {
            call.reject("Enregistrement impossible", "WRITE")
            return
        }
        DispatchQueue.main.async {
            // Une seule photo en attente à la fois : la précédente a été lue par le JS.
            if let previous = self.lastCapture { try? FileManager.default.removeItem(at: previous) }
            self.lastCapture = url
            let resolution = frame.camera.imageResolution
            call.resolve([
                "path": url.path,
                "width": Double(resolution.height),
                "height": Double(resolution.width),
                "focal": Double(frame.camera.intrinsics[0][0]),
                "pose": self.poseObject(frame)
            ])
        }
    }
}
