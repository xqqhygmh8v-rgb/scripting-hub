import {
  Button,
  HStack,
  Image,
  Label,
  List,
  Navigation,
  NavigationStack,
  Section,
  Spacer,
  Text,
  TextField,
  useEffect,
  useObservable,
} from "scripting";
import { github } from "../util/github";
import { app } from "../util/itunes";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={"设置"}
        toolbar={{
          topBarLeading: [
            <Button
              title={"关闭"}
              systemImage={"xmark"}
              action={() => {
                app.unSave();
                dismiss();
              }}
            />,
          ],
          topBarTrailing: [
            <Button
              title={"保存"}
              systemImage={"checkmark"}
              action={() => {
                app.save();
                github.save();
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
      <Section title={"App Store 地区"}>
        <CountriesView />
      </Section>
      <Section
        header={<Text>{"GitHub"}</Text>}
        footer={
          <Text
            attributedString={`[生成 Classic Token](https://github.com/settings/tokens/new) 并勾选 Repo 权限`}
          />
        }>
        <ItemView key={"TOKEN"} title={"Token"} field={"TOKEN"} />
        <ItemView key={"OWNER"} title={"所有者"} field={"OWNER"} />
        <ItemView key={"REPO"} title={"仓库"} field={"REPO"} />
        <ItemView key={"PATH"} title={"路径（默认根目录）"} field={"PATH"} />
      </Section>
    </List>
  );
}

function ItemView({ title, field }: { title: string; field: "TOKEN" | "OWNER" | "REPO" | "PATH" }) {
  const value = useObservable(github[field]);

  useEffect(() => {
    github[field] = value.value;
  }, [value.value]);

  return <TextField title={title} value={value} />;
}

function CountriesView() {
  const value = useObservable(app.countries);
  return (
    <>
      {value.value.map((c, idx) => (
        <CountryItem
          key={c}
          title={c}
          trailingSwipeActions={{
            actions: [
              <Button
                title={"删除"}
                role={"destructive"}
                action={() => {
                  app.enabledCountries.splice(app.enabledCountries.indexOf(c), 1);
                  app.countries.splice(idx, 1);
                  value.setValue([...app.countries]);
                }}
              />,
              <Button
                title={"编辑"}
                action={async () => {
                  const name = await Dialog.prompt({ title: "请输入国家代码", defaultValue: c });
                  if (!name) return;

                  app.countries[idx] = name.toUpperCase();
                  value.setValue([...app.countries]);
                }}
              />,
            ],
          }}
        />
      ))}
      <Button
        buttonStyle={"plain"}
        action={async () => {
          const name = await Dialog.prompt({ title: "请输入国家代码" });
          if (!name) return;

          app.countries.push(name.toUpperCase());
          app.countries.sort();

          // console.log(app.countries);

          value.setValue([...app.countries]);
        }}>
        <Label
          title={"添加"}
          systemImage={"plus.circle.fill"}
          symbolRenderingMode={"multicolor"}
          foregroundStyle={"accentColor"}
        />
      </Button>
    </>
  );
}

function CountryItem({ title }: { title: string }) {
  const value = useObservable<boolean>(app.enabledCountries.includes(title));
  return (
    <Button
      buttonStyle={"plain"}
      action={() => {
        if (value.value) {
          const index = app.enabledCountries.indexOf(title);
          if (index !== -1) {
            app.enabledCountries.splice(index, 1);
          }
        } else {
          if (!app.enabledCountries.includes(title)) {
            app.enabledCountries.push(title);
          }
        }
        value.setValue(!value.value);
      }}>
      <HStack contentShape={"rect"}>
        <Text>{title}</Text>
        <Spacer />
        {value.value ? (
          <Image foregroundStyle={"accentColor"} fontWeight={"medium"} systemName={"checkmark"} />
        ) : null}
      </HStack>
    </Button>
  );
}
