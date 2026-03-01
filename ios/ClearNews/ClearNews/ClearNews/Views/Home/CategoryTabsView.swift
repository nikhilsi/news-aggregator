import SwiftUI

struct CategoryTabsView: View {
    @Environment(CategoryService.self) private var categoryService
    @Binding var selectedCategory: String
    @ScaledMetric(relativeTo: .subheadline) private var hPadding: CGFloat = 14
    @ScaledMetric(relativeTo: .subheadline) private var vPadding: CGFloat = 8

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categoryService.categories) { category in
                    let isSelected = category.id == selectedCategory

                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        selectedCategory = category.id
                    } label: {
                        Text(category.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .padding(.horizontal, hPadding)
                            .padding(.vertical, vPadding)
                            .background(
                                isSelected
                                    ? Color.blue.opacity(0.15)
                                    : Color(.systemGray6)
                            )
                            .foregroundStyle(isSelected ? .blue : .secondary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
        }
    }
}
