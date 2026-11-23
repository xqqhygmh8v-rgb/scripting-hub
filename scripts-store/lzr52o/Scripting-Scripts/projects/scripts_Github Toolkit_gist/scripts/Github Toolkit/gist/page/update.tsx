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

  Rectangle,} from "scripting";
import { gist } from "../class/gist";
import { flushOrders } from "./fileOrder";
import { addLog, buildChanges } from "./activityLog";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { t } from "../../components/i18n";

export function View({
  url,
  gistId,
  files,
  gistName,
  accountToken,
  accountUsername,
}: {
  url: string;
  gistId: string;
  files: Record<string, any>;
  gistName: string;
  accountToken: string;
  accountUsername?: string;
}) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("新增檔案", "新增文件", "Add File")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={dismiss} />],
        }}>
        <Section title={t("內容", "内容", "Content")}>
          <MyEditor
            listRowInsets={0}
            frame={{ height: 400 }}
            url={url}
            gistId={gistId}
            files={files}
            gistName={gistName}
            accountToken={accountToken}
            accountUsername={accountUsername}
          />
        </Section>
      </List>
    </NavigationStack>
  );
}

function MyEditor({
  url,
  gistId,
  files,
  gistName,
  accountToken,
  accountUsername,
}: {
  url: string;
  gistId: string;
  files: Record<string, any>;
  gistName: string;
  accountToken: string;
  accountUsername?: string;
}) {
  const controller = useMemo(() => {
    return new EditorController({ content: "", ext: "txt" });
  }, []);

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  function SaveButton() {
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
            const updated = await gist.withToken(accountToken, () =>
              gist.updateContent(url, name, controller.content)
            );
            // 2.1.10：新增檔案＝跟空內容比對，活動記錄就看得到整份內容的變更。
            const { changes, truncated, approximate } = buildChanges([
              { filename: name, after: controller.content },
            ]);
            addLog({
              action: "新增檔案",
              gistName,
              fileName: name,
              contentUrl: updated.files?.[name]?.raw_url,
              accountUsername,
              changes,
              changesTruncated: truncated,
              changesApproximate: approximate,
            });
            await flushOrders();
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

  return (
    <Editor listRowBackground={<ThemeCardBackground />}
      controller={controller}
      scriptName={t("編輯器", "编辑器", "Editor")}
      toolbar={{
        confirmationAction: [<SaveButton />],
      }}
    />
  );
}
