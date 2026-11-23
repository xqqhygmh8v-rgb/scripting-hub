import { Navigation, Script } from "scripting";
import { View } from "./page";

(async () => {
  await Navigation.present({
    element: <View />,
    modalPresentationStyle: "fullScreen",
  });
})()
  .catch(async (e) => {
    await new Promise((resolve) => {
      console.present().then(resolve);
      console.error(e);
    });
  })
  .finally(Script.exit);
