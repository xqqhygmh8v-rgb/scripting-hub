import {
  Button,
  Navigation,
  NavigationSplitView,
  Toolbar,
  ToolbarItem,
  ToolbarSpacer,
  Script,
} from "scripting";
import { View as ListView } from "./list";
import { View as SettingView } from "./setting";
import { t } from "../../components/i18n";

export function View({ titleMenu, onExit }: { titleMenu?: any; onExit?: () => void } = {}) {
  const dismiss = Navigation.useDismiss();
  // v1.1.0：標題固定置中顯示 Gist，不再帶帳號（帳號改成首頁的摺疊區塊）。
  // 這裡跟首頁 List 都設一樣的標題跟置中，兩邊一致。
  return (
    <NavigationSplitView
      sidebar={
        <ListView
          titleMenu={titleMenu}
          navigationTitle={"Gist"}
          navigationBarTitleDisplayMode={"inline"}
          toolbar={
            <Toolbar>
              <ToolbarSpacer placement={"topBarLeading"} />
              <ToolbarItem placement={"topBarLeading"}>
                <Button
                  title={t("退出", "退出", "Close")}
                  systemImage={"xmark"}
                  action={() => {
                    if (onExit) return onExit();
                    dismiss();
                    Script.exit();
                  }}
                />
              </ToolbarItem>
            </Toolbar>
          }
        />
      }>
      <></>
    </NavigationSplitView>
  );
}
