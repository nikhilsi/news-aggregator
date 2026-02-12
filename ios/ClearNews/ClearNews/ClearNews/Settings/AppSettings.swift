import SwiftUI

@Observable
final class AppSettings {
    var appearance: String {
        didSet { UserDefaults.standard.set(appearance, forKey: "appearance") }
    }

    var readerFontScale: Double {
        didSet { UserDefaults.standard.set(readerFontScale, forKey: "readerFontScale") }
    }

    var colorScheme: ColorScheme? {
        switch appearance {
        case "light": return .light
        case "dark": return .dark
        default: return nil // system
        }
    }

    init() {
        self.appearance = UserDefaults.standard.string(forKey: "appearance") ?? "system"
        let saved = UserDefaults.standard.double(forKey: "readerFontScale")
        self.readerFontScale = saved > 0 ? saved : 1.0
    }
}
