// WLinker - 地图快照（供大号组件底部显示，参照 BMW MINI Linker）
import { Widget } from "scripting"
import { scriptKeyNamespace } from "./storage"
import { wgs84ToGcj02 } from "./formatters"

// 桌面大号组件使用的地图快照路径（App Group 共享目录，组件可读）
export function mapSnapshotPath(): string {
  return `${FileManager.appGroupDocumentsDirectory}/car-location-map-${scriptKeyNamespace()}.png`
}

// 用 MapKit 离屏渲染一张 Apple 原生地图（带车辆标注），保存为 PNG。
// 五菱返回 WGS-84 坐标，先转 GCJ-02 再渲染，保证在中国地图上位置准确。
export async function refreshMapSnapshot(
  latitude: number,
  longitude: number,
  size = { width: 620, height: 440 },
): Promise<boolean> {
  try {
    const offset = wgs84ToGcj02(latitude, longitude)
    const snap = await MapSnapshotter.take({
      region: {
        center: { latitude: offset.latitude, longitude: offset.longitude },
        span: { latitudeDelta: 0.0008, longitudeDelta: 0.0008 },
      },
      size,
      mapStyle: { style: "standard", showsTraffic: false },
      annotations: [
        {
          coordinate: { latitude: offset.latitude, longitude: offset.longitude },
          tintColor: "#166DFF",
          glyph: "car.fill",
          title: "车辆位置",
        },
      ],
    })
    const png = snap.image.toPNGData()
    if (!png) return false
    FileManager.writeAsDataSync(mapSnapshotPath(), png)
    Widget.reloadAll()
    return true
  } catch (error) {
    console.warn("map snapshot failed:", error instanceof Error ? error.message : String(error))
    return false
  }
}

// 组件读取地图快照
export async function loadMapImage(): Promise<UIImage | null> {
  try {
    return UIImage.fromFile(mapSnapshotPath())
  } catch {
    return null
  }
}
