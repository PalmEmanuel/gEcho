import AppKit
import CoreGraphics
import Foundation

struct Rect: Codable {
    let x: Int; let y: Int; let width: Int; let height: Int
}
struct WindowInfo: Codable {
    let bounds: Rect; let displayIndex: Int
}

func findVSCodeWindow() -> CGRect? {
    guard let windows = CGWindowListCopyWindowInfo(
        [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID
    ) as? [[String: Any]] else { return nil }
    for window in windows {
        guard let owner = window[kCGWindowOwnerName as String] as? String,
              owner == "Code" else { continue }
        guard (window[kCGWindowAlpha as String] as? Double ?? 0) > 0 else { continue }
        guard let dict = window[kCGWindowBounds as String] as? [String: Any],
              let r = CGRect(dictionaryRepresentation: dict as CFDictionary) else { continue }
        guard r.width >= 200, r.height >= 200 else { continue }
        return r
    }
    return nil
}

func getDisplayIndex(for center: CGPoint) -> Int {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    for (i, id) in ids.enumerated() {
        if CGDisplayBounds(id).contains(center) { return i }
    }
    return 0
}

let r = findVSCodeWindow()
let bounds = r ?? CGRect(x: 0, y: 0, width: 1920, height: 1080)
let idx = r.map { getDisplayIndex(for: CGPoint(x: $0.midX, y: $0.midY)) } ?? 0
let info = WindowInfo(bounds: Rect(x: Int(bounds.origin.x), y: Int(bounds.origin.y), width: Int(bounds.width), height: Int(bounds.height)), displayIndex: idx)
if let data = try? JSONEncoder().encode(info), let str = String(data: data, encoding: .utf8) {
    print(str)
} else {
    print("{\"bounds\":{\"x\":0,\"y\":0,\"width\":1920,\"height\":1080},\"displayIndex\":0}")
}
