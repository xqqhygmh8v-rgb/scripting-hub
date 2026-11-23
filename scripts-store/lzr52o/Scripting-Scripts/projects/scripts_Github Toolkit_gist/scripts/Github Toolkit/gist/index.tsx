import { Navigation, Script } from "scripting";
import { t } from "../components/i18n";
import { View } from "./page";

(async () => {
  await Navigation.present({
    element: <View />,
    modalPresentationStyle: "overFullScreen",
  });
})()
  .catch(
    async (e) =>
      await Dialog.alert({
        title: t("錯誤", "错误", "Error"),
        message: String(e),
      }),
  )
  .finally(Script.exit);
