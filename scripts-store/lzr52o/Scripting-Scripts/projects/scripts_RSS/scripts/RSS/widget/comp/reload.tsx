import { Button, Image } from "scripting";
import { ReloadAppIntent } from "../../app_intents";

export function ReloadButton() {
  return (
    <Button
      intent={ReloadAppIntent(undefined)}
      frame={{ height: 1 }}
      buttonStyle={"plain"}>
      <Image systemName="arrow.clockwise" foregroundStyle={"accentColor"} />
    </Button>
  );
}
