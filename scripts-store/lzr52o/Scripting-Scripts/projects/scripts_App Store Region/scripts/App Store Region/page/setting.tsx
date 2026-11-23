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
import { regions } from "../class/region";
import { toFlag } from "../util/flag";

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
                regions.save();
                dismiss(regions.countries);
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
  const list = useObservable(regions.countries);

  function onAdd(id: string, region: string, enabled: boolean) {
    regions.countries = [...list.value, { id: id, region: region, enabled: enabled }];
    list.setValue(regions.countries);
  }

  function onDelete(index: number) {
    regions.countries = list.value.filter((_, idx) => idx !== index);
    list.setValue(regions.countries);
  }

  function onEdit(index: number, id: string, region: string, enabled: boolean) {
    regions.countries = [...list.value];
    regions.countries[index] = { id: id, region: region, enabled: enabled };
    list.setValue(regions.countries);
  }

  return (
    <>
      {list.value.map((i, idx) => (
        <CountryItem
          key={i.region}
          idx={idx}
          id={i.id}
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
                  if (!region) return;
                  const id = await Dialog.prompt({
                    title: "编辑",
                    message: "请输入ID",
                    defaultValue: i.id,
                    keyboardType: "numberPad",
                  });
                  if (!id) return;
                  onEdit(idx, id, region.toUpperCase(), i.enabled);
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
            if (!region) return;
            const id = await Dialog.prompt({
              title: "添加",
              message: "请输入ID",
              keyboardType: "numberPad",
            });
            if (!id) return;
            onAdd(id, region.toUpperCase(), true);
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

function CountryItem({
  idx,
  id,
  region,
  enabled,
}: {
  idx: number;
  id: string;
  region: string;
  enabled: boolean;
}) {
  const v = useObservable<boolean>(enabled);

  return (
    <Button
      buttonStyle={"plain"}
      action={() => {
        regions.countries[idx].enabled = !v.value;
        v.setValue(!v.value);
      }}>
      <HStack contentShape={"rect"} monospaced={true}>
        <Text>{toFlag(region)}</Text>
        <Text fontWeight={"semibold"}>{region}</Text>
        <Text foregroundStyle={"secondaryLabel"}>{id}</Text>
        <Spacer />
        {v.value ? (
          <Image foregroundStyle={"accentColor"} fontWeight={"medium"} systemName={"checkmark"} />
        ) : null}
      </HStack>
    </Button>
  );
}
