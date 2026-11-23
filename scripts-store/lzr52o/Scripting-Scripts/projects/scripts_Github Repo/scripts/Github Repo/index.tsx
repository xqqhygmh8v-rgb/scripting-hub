import { Navigation, NavigationStack, Script } from "scripting";
import { View as RepoListView } from "./page/repoList";
import { t } from "./class/i18n";

// v1.7 關鍵改法：不再用 NavigationSplitView。分割畫面的詳細窗格換倉庫時
// 可能不會重新掛載瀏覽頁，導致載入停在舊狀態；改成 Github_Action /
// GitHubMonitor 那種 NavigationStack，點倉庫就是往堆疊推一個新的瀏覽頁，
// 每次都是全新掛載、載入一次，返回就是回到清單。
export function View() {
  return (
    <NavigationStack>
      <RepoListView />
    </NavigationStack>
  );
}

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
