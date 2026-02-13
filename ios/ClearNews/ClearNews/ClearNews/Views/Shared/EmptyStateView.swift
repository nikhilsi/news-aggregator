import SwiftUI

struct EmptyStateView: View {
    var icon: String = "newspaper"
    var message: String = "No articles found"
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 40

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: iconSize))
                .foregroundStyle(.secondary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
