import { Widget, Text } from "scripting";

import { View as SystemSmallView } from "./widget/small";
import { View as SystemMediumView } from "./widget/medium";
import { View as SystemLargeView } from "./widget/large";

(async () => {
  switch (Widget.family) {
    case "systemSmall":
      Widget.present(<SystemSmallView />);
      break;
    case "systemMedium":
      Widget.present(<SystemMediumView />);
      break;
    case "systemLarge":
      Widget.present(<SystemLargeView />);
      break;
    default:
      throw new Error("Unsupported widget size");
  }
})().catch((e) => {
  Widget.present(<Text>{String(e)}</Text>);
});
