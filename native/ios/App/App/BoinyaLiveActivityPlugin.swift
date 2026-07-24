import Foundation
import Capacitor
import ActivityKit

@objc(BoinyaLiveActivityPlugin)
public class BoinyaLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BoinyaLiveActivityPlugin"
    public let jsName = "BoinyaLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    private var currentActivityId: String?

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false, "reason": "unsupported"])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["ok": false, "reason": "disabled"])
            return
        }

        let state = contentState(from: call)
        let attrs = ManagerDayAttributes(title: "GBI")
        let content = ActivityContent(state: state, staleDate: nil)

        Task {
            for activity in Activity<ManagerDayAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            do {
                let activity = try Activity.request(
                    attributes: attrs,
                    content: content,
                    pushType: nil
                )
                self.currentActivityId = activity.id
                call.resolve(["ok": true, "id": activity.id])
            } catch {
                call.resolve(["ok": false, "reason": error.localizedDescription])
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false, "reason": "unsupported"])
            return
        }
        let state = contentState(from: call)
        let content = ActivityContent(state: state, staleDate: nil)

        Task {
            let activities = Activity<ManagerDayAttributes>.activities
            if activities.isEmpty {
                await MainActor.run { self.start(call) }
                return
            }
            for activity in activities {
                await activity.update(content)
                self.currentActivityId = activity.id
            }
            call.resolve(["ok": true, "id": self.currentActivityId ?? ""])
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["ok": false, "reason": "unsupported"])
            return
        }
        Task {
            for activity in Activity<ManagerDayAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.currentActivityId = nil
            call.resolve(["ok": true])
        }
    }

    private func contentState(from call: CAPPluginCall) -> ManagerDayAttributes.ContentState {
        let day = call.getString("day") ?? "День"
        let clients = call.getInt("clients") ?? Int(call.getDouble("clients") ?? 0)
        let tasks = call.getInt("tasks") ?? Int(call.getDouble("tasks") ?? 0)
        let subtitle = call.getString("subtitle") ?? ""
        return .init(day: day, clients: clients, tasks: tasks, subtitle: subtitle)
    }
}
