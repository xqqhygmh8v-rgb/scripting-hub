import { Button, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { View as Circle } from "./widget/circular";
import { View as Small } from "./widget/small";

(async () => {
  if (!api.accountId || !api.token) throw new Error("请填写Account ID和令牌");
  const { pages, workers } = await api.getUsage();

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Circle all={api.all} pages={pages} workers={workers} />
        </Button>,
      );
      break;
    case "systemSmall":
      Widget.present(
        <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
          <Small
            all={api.all}
            pages={pages}
            workers={workers}
            // widgetBackground={{
            //   gradient: true,
            //   color: "systemBackground",
            //   opacity: 0.5,
            // }}
          />
        </Button>,
      );
      break;
    default:
      throw new Error("未适配的 Widget 尺寸");
  }
})().catch(async (e) => {
  const { Text } = await import("scripting");
  Widget.present(<Text>{String(e)}</Text>);
});
