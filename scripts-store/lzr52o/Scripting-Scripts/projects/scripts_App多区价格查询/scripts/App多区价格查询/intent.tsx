import { Navigation, Script, Intent, NavigationStack, Button } from "scripting";
import { View as DetailView } from "./page/detail";

(async () => {
  if (!Intent.urlsParameter) return;
  const url = String(Intent.urlsParameter);

  // 提取应用 ID
  const urlMap = url.split("/");
  const appid = urlMap[urlMap.length - 1].split("?")[0].replace("id", "") || "";

  await Navigation.present({
    element: <View appid={appid} />,
  });
})()
  .catch(
    async (e) =>
      await Dialog.alert({
        title: "错误",
        message: String(e),
      })
  )
  .finally(Script.exit);

function View({ appid }: { appid: string }) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <DetailView
        id={appid}
        navigationTitle={Script.name}
        toolbar={{
          topBarLeading: [<Button title="关闭" systemImage={"xmark"} action={dismiss} />],
        }}
      />
    </NavigationStack>
  );
}
