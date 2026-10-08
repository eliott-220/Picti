import Capacitor
import CoreLocation
import UIKit

/// Position lue directement par iOS (CoreLocation) au lieu de passer par la page web
/// (`navigator.geolocation`, réglée par WebKit) : précision « navigation », activité piéton,
/// vrai instant de mesure, vitesse et cap GPS avec leurs précisions, et « Position exacte »
/// connue et redemandée par l'app. Le JS (`src/sensors/positionSource.ts`) reçoit les relevés
/// par l'événement `location` et les passe au même filtre que dans le navigateur.
@objc(PositionPlugin)
public class PositionPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "PositionPlugin"
    public let jsName = "Position"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFullAccuracy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    /// Clé de `NSLocationTemporaryUsageDescriptionDictionary` (Info.plist) : texte de la demande
    /// de position exacte temporaire.
    static let purposeKey = "geocadrage"

    private var manager: CLLocationManager?
    /// Le JS veut des relevés (entre `start` et `stop`), même si l'app passe en arrière-plan.
    private var running = false
    /// Début du suivi : un relevé mesuré avant est un relevé en cache (`maximumAge: 0` du web).
    private var startedAt = Date.distantPast
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        // En arrière-plan, plus de relevés (batterie) ; au retour, on repart de relevés frais.
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, self.running else { return }
            self.manager?.stopUpdatingLocation()
        })
        observers.append(center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, self.running, let manager = self.manager else { return }
            self.startedAt = Date()
            // Refusée entre-temps : `locationManagerDidChangeAuthorization` le dira au JS.
            if PositionPlugin.isAuthorized(manager) { manager.startUpdatingLocation() }
        })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let manager = self.locationManager()
            self.running = true
            self.startedAt = Date()
            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
                manager.startUpdatingLocation()
            case .denied, .restricted:
                // Rien à suivre : le JS l'apprend par l'état renvoyé (et l'erreur).
                self.notifyDenied(manager.authorizationStatus)
            default:
                manager.startUpdatingLocation()
            }
            call.resolve(self.statusObject(manager))
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = false
            self.manager?.stopUpdatingLocation()
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.statusObject(self.locationManager()))
        }
    }

    /// « Position exacte » désactivée : iOS la propose le temps de l'usage de l'app (une fois par
    /// lancement au plus, c'est le système qui décide d'afficher la demande).
    @objc func requestFullAccuracy(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let manager = self.locationManager()
            guard PositionPlugin.isAuthorized(manager), manager.accuracyAuthorization == .reducedAccuracy else {
                call.resolve(self.statusObject(manager))
                return
            }
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: PositionPlugin.purposeKey) { _ in
                DispatchQueue.main.async {
                    call.resolve(self.statusObject(manager))
                }
            }
        }
    }

    /// Réglages de l'app (Position, Position exacte).
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    // MARK: - CoreLocation

    private func locationManager() -> CLLocationManager {
        if let manager { return manager }
        let manager = CLLocationManager()
        manager.delegate = self
        // Le meilleur qu'iOS sait faire (capteurs supplémentaires compris) : la caméra tourne de
        // toute façon pendant qu'on géocadre.
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        // À pied : pas de recalage sur les routes (réservé à `.automotiveNavigation`).
        manager.activityType = .fitness
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        self.manager = manager
        return manager
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations {
            // Précision négative : relevé invalide. Mesuré avant le démarrage : relevé en cache.
            guard location.horizontalAccuracy >= 0,
                  location.timestamp >= startedAt.addingTimeInterval(-1) else { continue }
            notifyListeners("location", data: PositionPlugin.payload(location))
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let error = error as? CLError else { return }
        switch error.code {
        case .denied:
            notifyDenied(manager.authorizationStatus)
        case .locationUnknown:
            // Passager : iOS continue de chercher.
            break
        default:
            notifyListeners("error", data: ["code": "unavailable", "message": "Position indisponible"])
        }
    }

    /// Autorisation ou « Position exacte » changée (demande, réglages) : le JS reçoit l'état.
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        notifyListeners("status", data: statusObject(manager))
        if running, PositionPlugin.isAuthorized(manager) { manager.startUpdatingLocation() }
    }

    static func isAuthorized(_ manager: CLLocationManager) -> Bool {
        manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways
    }

    private func notifyDenied(_ status: CLAuthorizationStatus) {
        notifyListeners("error", data: [
            "code": status == .restricted ? "restricted" : "denied",
            "message": "Accès à la position refusé"
        ])
    }

    private func statusObject(_ manager: CLLocationManager) -> JSObject {
        let authorization: String
        switch manager.authorizationStatus {
        case .notDetermined: authorization = "notDetermined"
        case .restricted: authorization = "restricted"
        case .denied: authorization = "denied"
        case .authorizedAlways: authorization = "always"
        case .authorizedWhenInUse: authorization = "whenInUse"
        @unknown default: authorization = "notDetermined"
        }
        return ["authorization": authorization, "precise": manager.accuracyAuthorization == .fullAccuracy]
    }

    /// Relevé envoyé au JS ; une valeur inconnue (négative pour CoreLocation) devient `null`.
    static func payload(_ location: CLLocation) -> JSObject {
        func known(_ value: Double, accuracy: Double? = nil) -> JSValue {
            if value.isFinite, value >= 0, accuracy.map({ $0 >= 0 }) ?? true { return value }
            return NSNull()
        }
        // Altitude seulement si iOS en donne la précision (sinon, elle n'est pas mesurée).
        let altitude: JSValue = location.verticalAccuracy > 0 ? location.altitude as JSValue : NSNull()
        var data: JSObject = [
            "lat": location.coordinate.latitude,
            "lon": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "altitude": altitude,
            "altitudeAccuracy": known(location.verticalAccuracy),
            "speed": known(location.speed, accuracy: location.speedAccuracy),
            "speedAccuracy": known(location.speedAccuracy),
            "course": known(location.course, accuracy: location.courseAccuracy),
            "courseAccuracy": known(location.courseAccuracy),
            "timestamp": location.timestamp.timeIntervalSince1970 * 1000,
            "simulated": false
        ]
        if #available(iOS 15.0, *), let source = location.sourceInformation {
            data["simulated"] = source.isSimulatedBySoftware
        }
        return data
    }
}
