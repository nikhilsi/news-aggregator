import SwiftUI

/// Compact relative time: "just now", "5m ago", "2h ago", "3d ago", or "Feb 8" for older.
struct RelativeTimeText: View {
    let date: Date

    private static let shortDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()

    var body: some View {
        Text(formatRelativeTime(date))
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    private func formatRelativeTime(_ date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))

        if seconds < 60 { return "just now" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        if days < 7 { return "\(days)d ago" }

        // Older than a week — show short date
        return Self.shortDateFormatter.string(from: date)
    }
}
