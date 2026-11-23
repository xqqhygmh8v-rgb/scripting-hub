import { ThemeCardBackground } from "../../components/themePalette";
import {
  Editor,
  ProgressView,
  Button,
  Image,
  useMemo,
  useEffect,
  useObservable,
  List,
  Section,
  Navigation,
  NavigationStack,
  Toggle,

  Rectangle,} from "scripting";
import { gist } from "../class/gist";
import { addLog, buildChanges } from "./activityLog";
import { flushOrders } from "./fileOrder";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { t } from "../../components/i18n";

let isPublic = false;

export function View({ accountToken }: { accountToken: string }) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("新增Gist", "新增Gist", "New Gist")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={dismiss} />],
        }}>
        <Section title={t("選項", "选项", "Options")}>
          <IsPublicView />
        </Section>

        <Section title={t("內容", "内容", "Content")}>
          <MyEditor listRowInsets={0} frame={{ height: 400 }} accountToken={accountToken} />
        </Section>
      </List>
    </NavigationStack>
  );
}

function IsPublicView() {
  const v = useObservable(isPublic);

  useEffect(() => {
    isPublic = v.value;
  }, [v.value]);

  return (
    <Toggle listRowBackground={<ThemeCardBackground />}
      title={t("公開", "公开", "Public")}
      value={v}
      systemImage={"link.circle.fill"}
      symbolRenderingMode={"hierarchical"}
    />
  );
}

function MyEditor({ accountToken }: { accountToken: string }) {
  const controller = useMemo(() => {
    return new EditorController({ content: "", ext: "txt" });
  }, []);

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  return (
    <Editor listRowBackground={<ThemeCardBackground />}
      controller={controller}
      scriptName={t("編輯器", "编辑器", "Editor")}
      toolbar={{
        confirmationAction: [<SaveButton controller={controller} accountToken={accountToken} />],
      }}
    />
  );
}

function SaveButton({ controller, accountToken }: { controller: EditorController; accountToken: string }) {
  const dismiss = Navigation.useDismiss();
  const isload = useObservable<boolean>(false);
  return (
    <Button
      action={async () => {
        try {
          if (!controller.content) throw t("內容不能為空", "内容不能为空", "Content cannot be empty");
          const name =
            (await Dialog.prompt({
              title: t("請輸入檔名", "请输入文件名", "Enter a filename"),
            })) || "gistfile1.txt";

          isload.setValue(true);
          const created = await gist.withToken(accountToken, () =>
            gist.create(name, controller.content, isPublic, "")
          );
          // 2.1.10：新建列表＝新增一個檔案的變更。
          const { changes, truncated, approximate } = buildChanges([
            { filename: name, after: controller.content },
          ]);
          addLog({
            action: "新增列表",
            gistName: `${created.owner.login}/${name}`,
            contentUrl: created.files[name]?.raw_url,
            accountUsername: created.owner.login,
            changes,
            changesTruncated: truncated,
            changesApproximate: approximate,
          });
          // 2.1.11：新增後也要同步活動記錄（其他操作都有，這裡之前漏了）。
          try {
            await flushOrders();
          } catch {}
          dismiss(true);
        } catch (e) {
          await Dialog.alert({
            title: t("錯誤", "错误", "Error"),
            message: String(e),
          });
        }
        isload.setValue(false);
      }}>
      {isload.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}
