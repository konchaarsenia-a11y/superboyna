import Foundation
import ActivityKit

/// Shared by App + Widget Extension (must stay in sync).
struct ManagerDayAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var day: String
        var clients: Int
        var tasks: Int
        var subtitle: String
    }

    var title: String
}
