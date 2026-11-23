import {
  Button,
  Image,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Section,
  Text,
  TextField,
  useEffect,
  useObservable,
} from "scripting";
import { api } from "../class/api";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={"设置"}
        toolbar={{
          cancellationAction: [<Button title={"关闭"} systemImage={"xmark"} action={dismiss} />],
          confirmationAction: [<SaveButton />],
        }}
      />
    </NavigationStack>
  );
}

function SaveButton() {
  const dismiss = Navigation.useDismiss();
  const load = useObservable<boolean>(false);
  return (
    <Button
      action={async () => {
        load.setValue(true);
        const status = await api.save();
        load.setValue(false);
        if (!status) {
          Dialog.alert({
            title: "错误",
            message: "获取 Account ID 失败",
          });
        } else {
          dismiss();
        }
      }}>
      {load.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}

function StackView() {
  return (
    <List>
      <Section
        header={<Text>{"信息"}</Text>}
        footer={
          <Text
            attributedString={
              "[获取 Token](https://dash.cloudflare.com/profile/api-tokens) 后开启权限：**帐户.帐户分析**"
            }
          />
        }>
        <IdSec />
        <TokenSec />
      </Section>
    </List>
  );
}

function IdSec() {
  const v = useObservable(api.accountId);
  useEffect(() => {
    api.accountId = v.value;
  }, [v.value]);
  return <TextField title={"Account ID"} value={v} />;
}

function TokenSec() {
  const v = useObservable(api.token);
  useEffect(() => {
    api.token = v.value;
  }, [v.value]);
  return <TextField title={"Token"} value={v} />;
}
