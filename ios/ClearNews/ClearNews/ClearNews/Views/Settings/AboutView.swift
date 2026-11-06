import SwiftUI

struct AboutView: View {
    var body: some View {
        List {
            Section {
                HStack {
                    Text("Version")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("Build")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Text("A personal news aggregator that pulls from multiple sources into one clean, filterable interface. No clickbait, no ad overload, no political noise.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } header: {
                Text("About")
            }

            Section {
                Text("Articles come from publicly available RSS feeds. All content belongs to its respective publishers. Tap \"Original\" in the reader to visit the source.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Content Sources")
            }

            Section {
                Link(destination: URL(string: "https://getclearnews.com/privacy")!) {
                    HStack {
                        Text("Privacy Policy")
                        Spacer()
                        Image(systemName: "arrow.up.right.square")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Link(destination: URL(string: "https://getclearnews.com/support")!) {
                    HStack {
                        Text("Support")
                        Spacer()
                        Image(systemName: "arrow.up.right.square")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("Links")
            }
        }
        .navigationTitle("About ClearNews")
        .navigationBarTitleDisplayMode(.inline)
    }
}
