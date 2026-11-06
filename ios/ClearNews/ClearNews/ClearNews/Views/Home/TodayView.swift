import SwiftUI

/// The Today screen (#425, iOS 2.1): the hourly brief as numbered compact rows,
/// then a finish line. The server picks and orders the stories; every headline
/// shown is the publisher's own. Matches the web's TodayView.tsx.
struct TodayView: View {
    let articles: [Article]
    let briefAt: Date
    var onOpen: (ReaderTarget) -> Void
    var onRefresh: () async -> Void

    /// The server builds a new brief every hour (worker/src/ai/brief.ts).
    static let editionInterval: TimeInterval = 60 * 60
    /// A readable column on iPad, as the web's max-w-3xl.
    private static let maxWidth: CGFloat = 700

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.bottom, 12)
                Divider()
                // By position: the brief is ordered. The id resets a row (its open outlet list)
                // when another story moves into its place.
                ForEach(Array(articles.enumerated()), id: \.offset) { index, article in
                    TodayRow(number: index + 1, article: article, onOpen: onOpen)
                        .id(article.url)
                    Divider()
                }
                caughtUp
            }
            .frame(maxWidth: Self.maxWidth)
            .frame(maxWidth: .infinity)
            .padding(.horizontal)
            .padding(.top, 8)
        }
        .refreshable {
            await onRefresh()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Today")
                    .font(.title2.bold())
                Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            // Redrawn every minute, so "updated" stays true while the app sits open.
            TimelineView(.everyMinute) { _ in
                HStack(spacing: 8) {
                    Chip(text: articles.count == 1 ? "1 story" : "\(articles.count) stories", prominent: true)
                    Chip(text: "updated \(RelativeTimeText.format(briefAt))", prominent: false)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var caughtUp: some View {
        let next = briefAt.addingTimeInterval(Self.editionInterval)
        return TimelineView(.everyMinute) { context in
            VStack(spacing: 4) {
                Text("You're all caught up.")
                    .font(.headline)
                    // green-700 / green-400: the system green is too light to read on white.
                    .foregroundStyle(Color(light: 0x15803D, dark: 0x4ADE80))
                Text(next > context.date
                    ? "The next edition is due around \(next.formatted(date: .omitted, time: .shortened))."
                    : "The next edition is due shortly.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
            .accessibilityElement(children: .combine)
        }
    }
}

/// One story in Today: number, headline, source and time, marks, outlets, photo.
private struct TodayRow: View {
    let number: Int
    let article: Article
    var onOpen: (ReaderTarget) -> Void
    @ScaledMetric(relativeTo: .headline) private var numberWidth: CGFloat = 22

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.headline.monospacedDigit())
                .foregroundStyle(.tertiary)
                .frame(minWidth: numberWidth, alignment: .leading)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(article.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(3)
                    HStack(spacing: 8) {
                        Text(article.sourceName)
                            .fontWeight(.medium)
                        if let publishedAt = article.publishedAt {
                            Text(RelativeTimeText.format(publishedAt))
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    BalanceMarks(article: article)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture { open() }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Opens reader view")

                CoverageList(article: article, onOpen: onOpen)
            }

            if let imageUrl = article.imageUrl, let url = URL(string: imageUrl) {
                Thumb(url: url)
                    .onTapGesture { open() }
            }
        }
        .padding(.vertical, 12)
    }

    private func open() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onOpen(ReaderTarget(article))
    }
}

/// A rounded label in Today's header.
private struct Chip: View {
    let text: String
    let prominent: Bool

    var body: some View {
        Text(text)
            .font(.caption.weight(prominent ? .semibold : .regular))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(prominent ? Color(light: 0xDBEAFE, dark: 0x1E3A8A) : Color(.systemGray5))
            // blue-800 on blue-100, blue-200 on blue-900, as the web's chip.
            .foregroundStyle(prominent ? Color(light: 0x1E40AF, dark: 0xBFDBFE) : Color.secondary)
            .clipShape(Capsule())
    }
}
