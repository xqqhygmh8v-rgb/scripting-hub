import {
  Button,
  Label,
  List,
  Navigation,
  NavigationLink,
  NavigationSplitView,
  Script,
  Section,
} from "scripting";
import { View as SettingView } from "./setting";
import { View as StoreView } from "./store";
import { View as LocalView } from "./local";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationSplitView
      sidebar={
        <StackView
          navigationTitle={Script.name}
          navigationBarTitleDisplayMode={"inline"}
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

function StackView() {
  return (
    <List>
      <Section title={"文件来源"}>
        <NavigationLink
          key={"搜索"}
          destination={
            <StoreView navigationTitle={"搜索"} navigationBarTitleDisplayMode={"inline"} />
          }>
          <Label title={"搜索"} systemImage={"magnifyingglass"} />
        </NavigationLink>
        <NavigationLink
          key={"本地"}
          destination={
            <LocalView navigationTitle={"本地"} navigationBarTitleDisplayMode={"inline"} />
          }>
          <Label title={"本地"} systemImage={"folder"} />
        </NavigationLink>
      </Section>
    </List>
  );
}
