import { Widget, Text } from "scripting"
import { summarize } from "./util/ai"
import { loadRss } from "./util/rss"

import { View as CommonView } from "./widget/common"
import { View as RectangularView } from "./widget/rectangular";

// import { View as SystemSmallView } from "./widget/small";
// import { View as SystemMediumView } from "./widget/medium";
// import { View as SystemLargeView } from "./widget/large";

(async () => {
  if (!Widget.parameter) throw new Error("请输入RSS订阅链接")

  const url = Widget.parameter
  const { title, items } = await loadRss(url)

  switch (Widget.family) {
    case "systemSmall": {
      const content = await summarize(items, 30, false)
      Widget.present(<CommonView title={title} content={content} />)
      break
    }
    case "systemMedium": {
      const content = await summarize(items, 100, false)
      Widget.present(<CommonView title={title} content={content} />)
      break
    }
    case "systemLarge": {
      const content = await summarize(items, 300, false)
      Widget.present(<CommonView title={title} content={content} />)
      break
    }
    case "accessoryRectangular": {
      const content = await summarize(items, 20, false)
      Widget.present(<RectangularView title={title} content={content} />)
      break
    }
    default:
      throw new Error("未适配的尺寸")
  }
})().catch((e) => {
  Widget.present(<Text>{String(e)}</Text>)
})
