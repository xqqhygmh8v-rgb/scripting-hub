import { Navigation, Script } from "scripting";
import { View } from "./page/index";

(async () => {
  await Navigation.present({
    element: <View />,
    modalPresentationStyle: "fullScreen",
  });
})().finally(Script.exit);
