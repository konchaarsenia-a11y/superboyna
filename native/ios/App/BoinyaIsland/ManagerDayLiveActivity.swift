import ActivityKit
import WidgetKit
import SwiftUI

struct ManagerDayLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ManagerDayAttributes.self) { context in
            // Lock Screen / Banner (все iPhone iOS 16.1+)
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("GBI · Менеджер")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color(red: 1, green: 0.48, blue: 0))
                    Text(context.state.day)
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(context.state.subtitle)
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    metric(context.state.clients, label: "клиенты")
                    metric(context.state.tasks, label: "задачи")
                }
            }
            .padding(16)
            .activityBackgroundTint(Color(red: 0.04, green: 0.04, blue: 0.04))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("G")
                        .font(.title2.weight(.black))
                        .foregroundStyle(Color(red: 1, green: 0.48, blue: 0))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.tasks)")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                    Text("задачи")
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.6))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("\(context.state.day) · \(context.state.clients) кл.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.subtitle)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.75))
                }
            } compactLeading: {
                Text("G")
                    .font(.caption.weight(.black))
                    .foregroundStyle(Color(red: 1, green: 0.48, blue: 0))
            } compactTrailing: {
                Text("\(context.state.tasks)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
            } minimal: {
                Text("\(context.state.tasks)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color(red: 1, green: 0.48, blue: 0))
            }
        }
    }

    @ViewBuilder
    private func metric(_ value: Int, label: String) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text("\(value)")
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
        }
    }
}
