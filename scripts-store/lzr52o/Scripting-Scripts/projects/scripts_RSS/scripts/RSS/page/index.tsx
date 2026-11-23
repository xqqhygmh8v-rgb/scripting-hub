import { Button, Navigation, NavigationSplitView } from "scripting";
import { View as HomeView } from "./home";

export function View() {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationSplitView
      sidebar={
        <HomeView
          toolbar={{
            topBarLeading: [<Button title={"退出"} systemImage={"xmark"} action={dismiss} />],
          }}
        />
      }
      content={<></>}>
      <></>
    </NavigationSplitView>
  );
}
