import {
  List,
  Navigation,
  NavigationStack,
  Button,
  TextField,
  Section,
  useObservable,
  useEffect,
} from "scripting";
import { gist } from "../class/gist";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <StackView
        navigationTitle={"设置"}
        toolbar={{
          cancellationAction: [<Button title={"取消"} systemImage={"xmark"} action={dismiss} />],
          confirmationAction: [
            <Button
              title="保存"
              systemImage={"checkmark"}
              action={() => {
                gist.save();
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
      <GistView />
    </List>
  );
}

function GistView() {
  function TokenView() {
    const value = useObservable(gist.token);
    useEffect(() => {
      gist.token = value.value;
    }, [value.value]);
    return <TextField title="Token" value={value} />;
  }
  return (
    <Section title="Gist">
      <TokenView />
    </Section>
  );
}
