import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  Section,
  Spacer,
  Text,
  useEffect,
  useObservable,
} from "scripting";
import { View as SettingView } from "./setting";
import { regions } from "../class/region";
import { openurl } from "../util/url";
import { toFlag } from "../util/flag";

export function View() {
  const dismiss = Navigation.useDismiss();
  const countries = useObservable(regions.countries);
  const query = useObservable("");
  const presented = useObservable(false);

  useEffect(() => {
    if (presented.value === false) countries.setValue([...regions.countries]);
  }, [presented.value]);

  return (
    <List
      searchable={{
        value: query,
        presented: presented,
      }}
      onSubmit={{
        triggers: "search",
        action: () => {
          countries.setValue(
            countries.value.filter((i) =>
              i.region.toLowerCase().includes(query.value.toLowerCase()),
            ),
          );
        },
      }}
      toolbar={{
        cancellationAction: [<Button title={"关闭"} systemImage={"xmark"} action={dismiss} />],
        topBarTrailing: [
          <Button
            title={"设置"}
            systemImage={"gear"}
            action={async () => {
              const r = await Navigation.present({ element: <SettingView /> });
              if (r) countries.setValue([...r]);
            }}
          />,
        ],
      }}>
      <Section title={"地区"}>
        {countries.value
          .filter((i) => i.enabled)
          .map((i) => (
            <Button
              key={i.region}
              buttonStyle={"plain"}
              action={() => Safari.openURL(openurl(i.id.toLowerCase()))}>
              <HStack monospaced={true} contentShape={"rect"}>
                <Text>{toFlag(i.region)}</Text>
                <Text fontWeight={"semibold"}>{i.region}</Text>
                <Spacer />
                <Image
                  systemName={"chevron.forward"}
                  imageScale={"small"}
                  foregroundStyle={"secondaryLabel"}
                  fontWeight={"medium"}
                />
              </HStack>
            </Button>
          ))}
      </Section>
    </List>
  );
}
