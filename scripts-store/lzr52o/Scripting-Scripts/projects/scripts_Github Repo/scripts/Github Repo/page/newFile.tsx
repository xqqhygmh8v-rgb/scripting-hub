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
  Text,
} from "scripting";
import { repo, textToBase64 } from "../class/repo";
import { t } from "../class/i18n";

export function View({
  owner,
  repo: repoName,
  branch,
  dirPath,
}: {
  owner: string;
  repo: string;
  branch: string;
  dirPath: string;
}) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <List
        navigationTitle={t("新增檔案", "新增文件", "New file")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={dismiss} />],
        }}
      >
        <Section title={t("內容", "内容", "Content")}>
          {/* 照 Gist 新增頁的寫法：Editor 在 List 裡若不給高度，空內容時會塌成一條黑條，
              所以跟 Gist 一樣給 frame 高度 400。 */}
          <MyEditor listRowInsets={0} frame={{ height: 400 }} owner={owner} repo={repoName} branch={branch} dirPath={dirPath} />
        </Section>
        <Section>
          <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("儲存時會先問檔名；若該路徑已有同名檔案，GitHub 會回 422，請改用資料夾裡的「上傳覆蓋」。", "保存时会先问文件名；若该路径已有同名文件，GitHub 会回 422，请改用文件夹里的「上传覆盖」。", "You will be asked for a file name when saving. If a file with the same path already exists, GitHub returns 422 — use “Replace by upload” in the folder instead.")}
          </Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

function MyEditor({
  owner,
  repo: repoName,
  branch,
  dirPath,
}: {
  owner: string;
  repo: string;
  branch: string;
  dirPath: string;
}) {
  const controller = useMemo(() => {
    return new EditorController({ content: "", ext: "txt" });
  }, []);

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  return (
    <Editor
      controller={controller}
      scriptName={t("編輯器", "编辑器", "Editor")}
      toolbar={{
        confirmationAction: [<SaveButton owner={owner} repo={repoName} branch={branch} dirPath={dirPath} controller={controller} />],
      }}
    />
  );
}

function SaveButton({
  owner,
  repo: repoName,
  branch,
  dirPath,
  controller,
}: {
  owner: string;
  repo: string;
  branch: string;
  dirPath: string;
  controller: EditorController;
}) {
  const dismiss = Navigation.useDismiss();
  const isload = useObservable<boolean>(false);
  return (
    <Button
      action={async () => {
        try {
          if (!controller.content) throw new Error(t("內容不能為空", "内容不能为空", "Content cannot be empty"));
          const name = await Dialog.prompt({ title: t("請輸入檔名", "请输入文件名", "Enter a file name"), defaultValue: "new-file.txt" });
          if (name === null || name === undefined || name === "") return;
          const path = dirPath ? `${dirPath}/${name}` : name;
          const msg = await Dialog.prompt({
            title: t("提交訊息", "提交信息", "Commit message"),
            defaultValue: t(`新增 ${path}（Scripting）`, `新增 ${path}（Scripting）`, `Add ${path} (Scripting)`),
          });
          if (msg === null || msg === undefined) return;
          isload.setValue(true);
          await repo.putFile({
            owner,
            repo: repoName,
            path,
            branch,
            message: msg || t(`新增 ${path}（Scripting）`, `新增 ${path}（Scripting）`, `Add ${path} (Scripting)`),
            base64: textToBase64(controller.content),
          });
          dismiss(true);
        } catch (e: any) {
          await Dialog.alert({ title: t("儲存失敗", "保存失败", "Save failed"), message: String(e?.message || e) });
        }
        isload.setValue(false);
      }}
    >
      {isload.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}
