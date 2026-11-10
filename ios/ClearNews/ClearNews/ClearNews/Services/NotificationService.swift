import SwiftUI
import UIKit
import UserNotifications

/// The morning edition (#435): Today's count and top story, once a day, pushed
/// by the server at the time the reader picks, on the phone's own clock. And
/// breaking news (#487): one alert when many outlets cover a big story at once,
/// at most one a day, never between 10 PM and 7 AM on the phone's clock.
///
/// The app asks iOS for the push token every time it talks to the server and
/// never keeps a copy (Apple: never cache device tokens). It sends its whole
/// state: the token, the time zone, and the time, or null when the switch or
/// iOS permission is off. It sends on every change, and at most once a day
/// when the app comes to the front, so a lost or stale server row repairs
/// itself. Design: docs/435-notifications-design.md section 6.2.
@Observable
final class NotificationService {
    static let shared = NotificationService()

    /// 7:00, in minutes after midnight.
    static let defaultMinutes = 7 * 60

    /// The reader's choice in Settings.
    private(set) var morningOn: Bool {
        didSet { defaults.set(morningOn, forKey: Keys.on) }
    }

    /// The reader's choice for breaking news (#487).
    private(set) var breakingOn: Bool {
        didSet { defaults.set(breakingOn, forKey: Keys.breakingOn) }
    }

    /// When the morning edition arrives, in minutes after local midnight.
    var morningMinutes: Int {
        didSet {
            defaults.set(morningMinutes, forKey: Keys.minutes)
            if morningMinutes != oldValue && morningOn { sync() }
        }
    }

    /// The one-time line at the end of Today has been answered.
    private(set) var offerDone: Bool {
        didSet { defaults.set(offerDone, forKey: Keys.offerDone) }
    }

    /// iOS's notification permission for the app.
    private(set) var permission: UNAuthorizationStatus = .notDetermined

    /// A story from a tapped notification, for HomeView to open.
    var openTarget: ReaderTarget?

    /// The morning edition: on only when the reader wants it and iOS allows it.
    var isOn: Bool { morningOn && permission == .authorized }

    /// Breaking news: on only when the reader wants it and iOS allows it.
    var isBreakingOn: Bool { breakingOn && permission == .authorized }

    /// "7:00 AM" in the reader's own format.
    var timeLabel: String { Self.date(for: morningMinutes).formatted(date: .omitted, time: .shortened) }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let on = "morningOn"
        static let breakingOn = "breakingOn"
        static let minutes = "morningMinutes"
        static let offerDone = "morningOfferDone"
        /// Not the token: what was last sent (time zone and time, or "off") and when.
        static let sentState = "morningSentState"
        static let sentAt = "morningSentAt"
        /// The server may hold a row for this phone, so "off" still needs sending.
        static let serverHasRow = "morningServerHasRow"
    }

    private init() {
        morningOn = defaults.bool(forKey: Keys.on)
        breakingOn = defaults.bool(forKey: Keys.breakingOn)
        morningMinutes = defaults.object(forKey: Keys.minutes) as? Int ?? Self.defaultMinutes
        offerDone = defaults.bool(forKey: Keys.offerDone)
    }

    // MARK: - The reader's actions

    /// The switch, or "Turn on" in Today: ask iOS (only the first time shows a prompt), then sign up.
    func turnOn() async {
        offerDone = true
        morningOn = await askPermission()
        sync()
    }

    func turnOff() {
        morningOn = false
        sync()
    }

    func turnOnBreaking() async {
        breakingOn = await askPermission()
        sync()
    }

    func turnOffBreaking() {
        breakingOn = false
        sync()
    }

    private func askPermission() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        await refreshPermission()
        return granted
    }

    func dismissOffer() {
        offerDone = true
    }

    // MARK: - Keeping the server in step

    func refreshPermission() async {
        permission = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// The app came to the front: send the state if it changed (permission
    /// turned off in iOS Settings, a new time zone) or a day has passed.
    func syncIfDue() async {
        await refreshPermission()
        guard isOn || isBreakingOn || defaults.bool(forKey: Keys.serverHasRow) else { return }
        let sentAt = defaults.object(forKey: Keys.sentAt) as? Date ?? .distantPast
        if defaults.string(forKey: Keys.sentState) != stateKey || Date().timeIntervalSince(sentAt) > 24 * 60 * 60 {
            sync()
        }
    }

    /// Asks iOS for the token; the app delegate hands it to `send(token:)`.
    private func sync() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// From the app delegate, with the token iOS just gave.
    func send(token: Data) async {
        await refreshPermission()
        let on = isOn
        let breaking = isBreakingOn
        guard on || breaking || defaults.bool(forKey: Keys.serverHasRow) else { return }
        let state = stateKey
        let body = SignUpBody(
            token: token.map { String(format: "%02x", $0) }.joined(),
            tz: TimeZone.current.identifier,
            morning: on ? String(format: "%02d:%02d", morningMinutes / 60, morningMinutes % 60) : nil,
            breaking: breaking
        )
        do {
            try await APIClient.shared.post("/notifications", body: body)
            defaults.set(on || breaking, forKey: Keys.serverHasRow)
            defaults.set(state, forKey: Keys.sentState)
            defaults.set(Date(), forKey: Keys.sentAt)
        } catch {
            // Nothing recorded: the next time the app comes to the front tries again.
        }
    }

    private var stateKey: String {
        guard isOn || isBreakingOn else { return "off" }
        return "\(TimeZone.current.identifier) \(isOn ? String(morningMinutes) : "-") \(isBreakingOn)"
    }

    static func date(for minutes: Int) -> Date {
        Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: Date()) ?? Date()
    }

    static func minutes(of date: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 7) * 60 + (c.minute ?? 0)
    }
}

/// The body of POST /api/v1/notifications. "morning" is always sent: null turns it off.
private struct SignUpBody: Encodable {
    let platform = "ios"
    let token: String
    let tz: String
    let morning: String?
    let breaking: Bool

    enum CodingKeys: String, CodingKey { case platform, token, tz, morning, breaking }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(platform, forKey: .platform)
        try c.encode(token, forKey: .token)
        try c.encode(tz, forKey: .tz)
        if let morning { try c.encode(morning, forKey: .morning) } else { try c.encodeNil(forKey: .morning) }
        try c.encode(breaking, forKey: .breaking)
    }
}

/// Receives the push token from iOS, and opens the story when a notification is tapped.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { await NotificationService.shared.send(token: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No token (no network, or a build without push): the next sync tries again.
    }

    // UIKit asserts that these completion handlers run on the main thread. The async
    // forms of these methods finish on a background thread when marked nonisolated,
    // which crashed build 4 on tapping a notification (TestFlight crash, Nov 9, 2026).
    // So: the completion-handler forms, each answered on the main thread.

    /// A morning edition that arrives while the app is open still shows as a banner.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        DispatchQueue.main.async {
            completionHandler([.banner, .list, .sound])
        }
    }

    /// Tapped: open the story in the reader, with Today behind it.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let content = response.notification.request.content
        let url = content.userInfo["url"] as? String
        let title = content.userInfo["title"] as? String ?? content.body
        let source = content.userInfo["source"] as? String ?? ""
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if let url {
                    NotificationService.shared.openTarget = ReaderTarget(url: url, title: title, sourceName: source)
                }
            }
            completionHandler()
        }
    }
}
