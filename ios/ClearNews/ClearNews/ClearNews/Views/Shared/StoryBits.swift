import SwiftUI

// Small pieces for Today's rows (#425), matching the web's StoryBits.tsx:
// the Fox News and NPR News marks on US politics stories, the list of other
// outlets that covered a story, a thumbnail, and the colours they share.

extension Color {
    /// One colour for light mode and one for dark, as the web's Tailwind pairs.
    init(light: UInt32, dark: UInt32) {
        func rgb(_ v: UInt32) -> UIColor {
            UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        }
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? rgb(dark) : rgb(light) })
    }

    /// Links and the coverage label (blue-700 / blue-400): readable on white, unlike the system blue.
    static let storyLink = Color(light: 0x1D4ED8, dark: 0x60A5FA)
}

/// On stories mainly about US politics: whether Fox News and NPR News covered it.
/// General keeps one right-leaning and one left-leaning outlet for this.
struct BalanceMarks: View {
    let article: Article

    private struct Outlet {
        let name: String
        let short: String
        let color: Color
    }

    private static let outlets = [
        Outlet(name: "Fox News", short: "Fox", color: .red),
        Outlet(name: "NPR News", short: "NPR", color: .blue),
    ]

    var body: some View {
        if article.isUSPolitics {
            let covered = Set([article.sourceName] + (article.coverage ?? []).map(\.sourceName))
            HStack(spacing: 10) {
                ForEach(Self.outlets, id: \.name) { outlet in
                    let yes = covered.contains(outlet.name)
                    HStack(spacing: 4) {
                        Circle()
                            .strokeBorder(yes ? outlet.color : Color.secondary, lineWidth: yes ? 0 : 1)
                            .background(Circle().fill(yes ? outlet.color : Color.clear))
                            .frame(width: 7, height: 7)
                        Text(yes ? outlet.short : "\(outlet.short): not yet")
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(yes ? "Covered by \(outlet.name)" : "Not covered by \(outlet.name) yet")
                }
            }
        }
    }
}

/// "Covered by N outlets": opens to each other outlet's own headline, each readable in the reader.
struct CoverageList: View {
    let article: Article
    var onOpen: (ReaderTarget) -> Void
    @State private var expanded = false

    var body: some View {
        let others = article.coverage ?? []
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Button {
                    withAnimation(.snappy) { expanded.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        // Keeps its width before the outlet names do; wraps at the largest text sizes.
                        Text("Covered by \(others.count + 1) outlets")
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.storyLink)
                            .layoutPriority(1)
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.storyLink)
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                        if !expanded {
                            Text(others.map(\.sourceName).joined(separator: ", "))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .font(.caption)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Covered by \(others.count + 1) outlets")
                .accessibilityValue(expanded ? "Expanded" : "Collapsed")
                .accessibilityHint(expanded ? "Hides the other outlets" : "Shows each outlet's headline")

                if expanded {
                    VStack(alignment: .leading, spacing: 10) {
                        // By position: one story can list the same URL under two outlets.
                        ForEach(Array(others.enumerated()), id: \.offset) { _, other in
                            Button {
                                onOpen(ReaderTarget(other))
                            } label: {
                                Text(Self.line(other))
                                    .font(.subheadline)
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens reader view")
                        }
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    /// "BBC World · Headline", the outlet in semibold.
    private static func line(_ other: Coverage) -> AttributedString {
        var source = AttributedString(other.sourceName)
        source.font = .subheadline.weight(.semibold)
        var dot = AttributedString(" · ")
        dot.foregroundColor = .secondary
        return source + dot + AttributedString(other.title)
    }
}

/// A small square photo; nothing if it fails to load.
struct Thumb: View {
    let url: URL
    var size: CGFloat = 64

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size, height: size)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            case .failure:
                EmptyView()
            default:
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(.systemGray5))
                    .frame(width: size, height: size)
            }
        }
        .accessibilityHidden(true)
    }
}
