import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            List {
                // Appearance
                Section {
                    Picker("Theme", selection: $settings.appearance) {
                        Text("System").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                } header: {
                    Text("Appearance")
                }

                // Reader font size
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Font Size")
                        Picker("Font Size", selection: $settings.readerFontScale) {
                            Text("S").tag(0.85)
                            Text("M").tag(1.0)
                            Text("L").tag(1.15)
                            Text("XL").tag(1.3)
                        }
                        .pickerStyle(.segmented)
                    }
                } header: {
                    Text("Reader")
                }

                // About
                Section {
                    NavigationLink {
                        AboutView()
                    } label: {
                        HStack {
                            Image(systemName: "info.circle")
                                .foregroundStyle(.secondary)
                            Text("About ClearNews")
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
