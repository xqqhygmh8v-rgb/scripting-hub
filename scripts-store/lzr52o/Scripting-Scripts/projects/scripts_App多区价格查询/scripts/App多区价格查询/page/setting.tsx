import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Section,
  Spacer,
  Text,
  useObservable,
} from "scripting";
import { itunes } from "../class/itunes";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={"设置"}
        toolbar={{
          cancellationAction: [
            <Button
              title={"关闭"}
              systemImage={"xmark"}
              action={() => {
                dismiss();
              }}
            />,
          ],
          confirmationAction: [
            <Button
              title={"保存"}
              systemImage={"checkmark"}
              action={() => {
                itunes.save();
                dismiss();
              }}
            />,
          ],
        }}
      />
    </NavigationStack>
  );
}

function StackView() {
  return (
    <List>
      <Section title={"地区"}>
        <CountriesView />
      </Section>
    </List>
  );
}

function CountriesView() {
  const list = useObservable(itunes.countries);

  function onAdd(region: string, enabled: boolean) {
    itunes.countries = [...list.value, { region: region, enabled: enabled }];
    list.setValue(itunes.countries);
  }

  function onDelete(index: number) {
    itunes.countries = list.value.filter((_, idx) => idx !== index);
    list.setValue(itunes.countries);
  }

  function onEdit(index: number, region: string, enabled: boolean) {
    itunes.countries = [...list.value];
    itunes.countries[index] = { region: region, enabled: enabled };
    list.setValue(itunes.countries);
  }

  return (
    <>
      {list.value.map((i, idx) => (
        <CountryItem
          idx={idx}
          region={i.region}
          enabled={i.enabled}
          trailingSwipeActions={{
            actions: [
              <Button title={"删除"} role={"destructive"} action={() => onDelete(idx)} />,
              <Button
                title={"编辑"}
                action={async () => {
                  const region = await Dialog.prompt({
                    title: "编辑",
                    message: "请输入国家代码",
                    defaultValue: i.region,
                  });
                  if (region) onEdit(idx, region.toUpperCase(), i.enabled);
                }}
              />,
            ],
          }}
        />
      ))}
      <Button
        title={"添加"}
        systemImage={"plus.circle.fill"}
        symbolRenderingMode={"multicolor"}
        action={async () => {
          try {
            const region = await Dialog.prompt({ title: "添加", message: "请输入国家代码" });
            if (region) onAdd(region.toUpperCase(), true);
          } catch (e) {
            Dialog.alert({
              title: "错误",
              message: String(e),
            });
          }
        }}
      />
    </>
  );
}

function CountryItem({ idx, region, enabled }: { idx: number; region: string; enabled: boolean }) {
  const v = useObservable<boolean>(enabled);
  return (
    <Button
      buttonStyle={"plain"}
      action={() => {
        itunes.countries[idx].enabled = !v.value;
        v.setValue(!v.value);
      }}>
      <HStack contentShape={"rect"} monospaced={true}>
        <Text>{region}</Text>
        <Spacer />
        {v.value ? (
          <Image foregroundStyle={"accentColor"} fontWeight={"medium"} systemName={"checkmark"} />
        ) : null}
      </HStack>
    </Button>
  );
}
