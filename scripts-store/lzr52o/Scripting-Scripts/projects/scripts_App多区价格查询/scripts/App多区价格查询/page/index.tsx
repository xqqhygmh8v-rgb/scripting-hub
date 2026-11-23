import { Button, Navigation, NavigationSplitView } from "scripting";
import { View as SettingView } from "./setting";
import { View as SearchView } from "./search";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationSplitView
      sidebar={
        <SearchView
          navigationTitle={"价格查询"}
          // navigationBarTitleDisplayMode={"inline"}
          toolbar={{
            topBarLeading: [<Button title={"退出"} systemImage={"xmark"} action={dismiss} />],
            topBarTrailing: [
              <Button
                title="设置"
                systemImage={"gear"}
                action={() => Navigation.present(<SettingView />)}
              />,
            ],
          }}
        />
      }>
      <></>
    </NavigationSplitView>
  );
}
