import {
  Button,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Script,
  Section,
  Text,
  useEffect,
  useObservable,
} from "scripting";
import { api } from "../class/api";
import { View as SettingView } from "./setting";
import { View as Legend } from "./comp/legend";
import { View as Progress } from "./comp/progress";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={Script.name}
        toolbar={{
          topBarLeading: [<Button title={"关闭"} systemImage={"xmark"} action={dismiss} />],
          topBarTrailing: [
            <Button
              title={"设置"}
              systemImage={"gear"}
              action={() => Navigation.present(<SettingView />)}
            />,
          ],
        }}
      />
    </NavigationStack>
  );
}

function StackView() {
  const data = useObservable<any>(null);

  async function init() {
    try {
      const r = await api.getUsage();
      if (r) data.setValue(r);
    } catch (e) {
      await Dialog.alert({ message: "获取数据失败，请检查账号信息" });
      await Navigation.present(<SettingView />);
      init();
    }
  }

  useEffect(() => {
    init();
  }, []);

  if (data.value === null) return <ProgressView />;

  const { pages, workers } = data.value;
  return (
    <List
      refreshable={async () => {
        await Promise.all([init(), new Promise((r: any) => setTimeout(r, 500))]);
      }}>
      <Section
        header={<Text>{"Workers & Pages"}</Text>}
        footer={<Legend all={api.all} pages={pages} workers={workers} />}>
        <Progress all={api.all} pages={pages} workers={workers} />
      </Section>
    </List>
  );
}
