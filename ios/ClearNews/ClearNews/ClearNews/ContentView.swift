import SwiftUI

struct ContentView: View {
    private enum Tab { case home, settings }
    @State private var tab = Tab.home
    private var notifications = NotificationService.shared

    var body: some View {
        TabView(selection: $tab) {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "newspaper")
                }
                .tag(Tab.home)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(Tab.settings)
        }
        // A tapped morning edition opens on Home, where the reader shows the story (#435).
        .onChange(of: notifications.openTarget) { _, target in
            if target != nil { tab = .home }
        }
    }
}
