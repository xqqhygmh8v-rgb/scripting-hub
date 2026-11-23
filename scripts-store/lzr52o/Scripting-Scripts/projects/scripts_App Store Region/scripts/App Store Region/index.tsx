import { Navigation, NavigationStack, Script } from "scripting";
import { View } from "./page";

(async () => {
  await Navigation.present({
    element: (
      <NavigationStack>
        <View navigationTitle={Script.name} />
      </NavigationStack>
    ),
    // modalPresentationStyle: "overFullScreen",
  });
})()
  .catch(async (e) => {
    await Dialog.alert({
      title: "错误",
      message: String(e),
    });
  })
  .finally(Script.exit);
