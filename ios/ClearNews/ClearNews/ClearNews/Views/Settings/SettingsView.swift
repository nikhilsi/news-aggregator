import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings
    private var notifications = NotificationService.shared

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

                // The morning edition (#435): Today's top story once a day.
                Section {
                    Toggle("Morning edition", isOn: Binding(
                        get: { notifications.isOn },
                        set: { on in
                            if on {
                                Task { await notifications.turnOn() }
                            } else {
                                notifications.turnOff()
                            }
                        }
                    ))
                    if notifications.isOn {
                        DatePicker("Time", selection: Binding(
                            get: { NotificationService.date(for: notifications.morningMinutes) },
                            set: { notifications.morningMinutes = NotificationService.minutes(of: $0) }
                        ), displayedComponents: .hourAndMinute)
                    }
                    Toggle("Breaking news", isOn: Binding(
                        get: { notifications.isBreakingOn },
                        set: { on in
                            if on {
                                Task { await notifications.turnOnBreaking() }
                            } else {
                                notifications.turnOffBreaking()
                            }
                        }
                    ))
                    if notifications.permission == .denied {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Notifications are off for ClearNews in iOS Settings.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Button("Open iOS Settings") {
                                if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                                    UIApplication.shared.open(url)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Notifications")
                } footer: {
                    Text("Morning edition: Today's top story, once a day at the time you pick. Breaking news: when many outlets cover a big story at once; at most one a day, never between 10 PM and 7 AM.")
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
            .task { await notifications.refreshPermission() }
        }
    }
}
