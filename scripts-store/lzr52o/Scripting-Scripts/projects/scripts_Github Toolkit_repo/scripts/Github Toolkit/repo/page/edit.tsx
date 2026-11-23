import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import { useThemePalette } from "../../components/themePalette";
import { Image, Navigation, Path, ProgressView, Rectangle, ScrollView, Spacer, VStack, useEffect, useObservable } from "scripting";
import { Button, Editor, useMemo } from "scripting";
import { editorExt, parseMoveTarget, repo, textToBase64 } from "../class/repo";
import { t } from "../class/i18n";
import { PAGE_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { formatCode, isFormattableExt } from "../../components/formatCode";
import { EditorSearchSheet, SearchButton } from "../../components/editorSearch";

export function View({
  owner,
  repo: repoName,
  branch,
  path,
  onSaved,
  onRenamed,
  readOnly,
  initialText,
  initialSha,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  onSaved?: () => void;
  onRenamed?: (newPath: string, newRepo?: string, newBranch?: string) => Promise<void>;
  // 2026-11-20：唯讀檢視（收藏裡其他使用者的倉庫）。沿用同一個編輯器
  // 顯示內容（有高亮、可搜尋），但控制器本身設成唯讀，工具列也不放
  // 魔法棒跟打勾，避免寫入別人的倉庫。
  readOnly?: boolean;
  // 2026-11-20：詳情頁已經把內容抓好了（可能走 git/blobs 拿到超過 1MB
  // 的檔案），直接帶進來就不必再重驗一次 contents API。
  initialText?: string;
  initialSha?: string;
}) {
  const file = useObservable<{ text: string; sha: string } | undefined>(
    initialText === undefined ? undefined : { text: initialText, sha: initialSha ?? "" },
  );
  const palette = useThemePalette();

  async function init() {
    // 已有現成內容就不重載（唯讀檢視就是這種情況）。
    if (initialText !== undefined) return;
    try {
      const r = await repo.getFileText(owner, repoName, path, branch);
      file.setValue({ text: r.text, sha: r.sha });
    } catch (e: any) {
      // 先解除載入狀態，頁面本身會顯示載入失敗，不在載入流程裡彈窗。
      file.setValue(null as any);
    }
  }

  useEffect(() => {
    init();
  }, []);

  // 載入時不回 bare ProgressView：它沒有背景，整頁會閃黑。包一層深灰
  // ScrollView，載入中也是深灰底。
  // 2.1.9：跟倉庫其他階層一致，載入／失敗時的置頂標題也是用戶名，
  // 檔名已經在編輯器內文與上一頁的資訊區顯示，不重複。
  if (file.value === undefined) return (
    <ScrollView tint={palette.accent} background={<GlassBackground />} navigationTitle={owner}>
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} alignment="center">
        <Spacer />
        <ProgressView title={t("載入中", "载入中", "Loading...")} />
        <Spacer />
      </VStack>
    </ScrollView>
  );
  if (file.value === null) return (
    <ScrollView tint={palette.accent} background={<GlassBackground />} navigationTitle={owner}>
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} alignment="center">
        <Spacer />
        <ProgressView title={t("載入失敗，請返回", "载入失败，请返回", "Failed to load, please go back")} />
        <Spacer />
      </VStack>
    </ScrollView>
  );
  return <MyEditor owner={owner} repo={repoName} branch={branch} path={path} sha={file.value.sha} initial={file.value.text} onSaved={onSaved} onRenamed={onRenamed} readOnly={readOnly} />;
}

function MyEditor({
  owner,
  repo: repoName,
  branch,
  path,
  sha,
  initial,
  onSaved,
  onRenamed,
  readOnly,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  initial: string;
  onSaved?: () => void;
  onRenamed?: (newPath: string, newRepo?: string, newBranch?: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const controller = useMemo(() => {
    // 2026-11-20：ext 改用 editorExt()。原本直接拿 Path.extname(path)，
    // 像 .domainset 這類不在官方清單的副檔名會讓高亮判斷失敗；editorExt
    // 會正規化成 txt。唯讀時一併把控制器設成 readOnly。
    return new EditorController({
      content: initial ?? "",
      ext: editorExt(path) as any,
      readOnly: readOnly === true,
    });
  }, []);

  // 1.4.1：編輯器搜尋改成彈出頁。1.4.0 把 Editor 包進 VStack 讓它
  // 一直轉圈圈、內容出不來，所以 Editor 改回全螢幕直接放著（1.3.0
  // 的寫法），搜尋用 Navigation.present 另外開一頁。查詢字串跟
  // 目前第幾個記在這裡，下次打開搜尋時繼續。
  const searchState = useObservable<{ query: string; index: number }>({ query: "", index: 0 });

  async function openSearch() {
    const result = await Navigation.present(
      <EditorSearchSheet controller={controller} initialQuery={searchState.value.query} initialIndex={searchState.value.index} />
    );
    if (result && typeof result === "object") {
      searchState.setValue({ query: (result as any).query ?? "", index: (result as any).index ?? 0 });
    }
  }

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return (
    <Editor
      controller={controller}
      scriptName={t("編輯器", "编辑器", "Editor")}
      showAccessoryView={true}
      toolbar={{
        // v3.0 回饋 2（續）：打勾跟資料夾兩顆位置跟顏色都對調。
        // 位置已經靠陣列順序對調了（資料夾在左、打勾在右），但 2026-11-05
        // 截圖證實顏色沒有跟著位置走：資料夾在左還是藍色、打勾在右還是深色。
        // 顏色是跟著按鈕寫法走的，不是跟位置走：title + systemImage 那種
        // 寫法會是藍色藥丸，action + 子 Image 那種寫法會是深色藥丸。
        // 所以這次把兩顆的寫法也對調：資料夾改成子 Image 寫法（深色），
        // 打勾改成 title + systemImage 寫法（藍色）。功能不換，打勾還是
        // 只存內容、資料夾還是更名儲存。
        // 1.0.26（重建）：以 Kristen 上傳的 1.0.0 為底，把 1.0.1 以後的要求
        // 全部加回來。編輯器這裡：第一顆是魔法棒（1.0.3 就要的功能），
        // 外觀跟原本的資料夾一模一樣（icon-only、深色、不上色、沒有狀態），
        // 按下去是格式化不是更名；工具列就是一個寫死的陣列 [魔法棒, 打勾]，
        // 沒有展開、沒有條件。打勾不動（藍色藥丸＋直接跳 Dialog.prompt
        // 問提交訊息，跟 Repo Manager 一模一樣）。更名還在檔案頁的
        // 「更改路徑／檔名」那裡。Dialog 不用匯入（跟 Repo Manager 一樣，
        // 它是全域的）。
        confirmationAction: readOnly
          ? [<SearchButton onOpen={openSearch} />]
          : [
              <SearchButton onOpen={openSearch} />,
              // 1.0.28：不能格式化的檔案就不顯示魔法棒（跟 Gist 一樣）。只有
              // 能格式化的檔案（.js/.json/.ts/.tsx/.jsx/.mjs/.cjs）才放魔法棒
              // 進工具列；不能格式化的檔案工具列就只有打勾一顆。
              ...(isFormattableExt(Path.extname(path) || "")
                ? [<FormatButton controller={controller} path={path} />]
                : []),
              <SaveButton owner={owner} repo={repoName} branch={branch} path={path} sha={sha} controller={controller} onSaved={onSaved} />,
            ],
      }}
    />
  );
}

// 1.0.27：魔法棒一開始沒上色（深色），點下去格式化成功才變橘色；
// 格式化不了就跳錯誤訊息。變色只改同一個 Button 的 tint prop（1.0.12
// 證實過這樣會變色），不換按鈕寫法、不拆膠囊；狀態放在魔法棒自己裡面，
// 只有魔法棒自己重畫，編輯器跟打勾都不動。打勾的 Dialog.prompt 會動
// 是因為 1.0.26 拿掉了 Dialog 匯入（全域的才對），跟按鈕寫法無關。
function FormatButton({ controller, path }: { controller: EditorController; path: string }) {
  const ext = Path.extname(path) || "";
  const formatted = useObservable<boolean>(false);
  const doFormat = async () => {
    // 1.0.28：魔法棒只在能格式化的檔案才顯示，這裡只是防禦性檢查。
    if (!isFormattableExt(ext)) return;
    try {
      const out = formatCode(controller.content, ext);
      if (out !== controller.content) controller.content = out;
      formatted.setValue(true);
    } catch (e: any) {
      await Dialog.alert({ title: t("格式化失敗", "格式化失败", "Format failed"), message: String(e?.message || e) });
    }
  };
  return (
    <Button action={doFormat} tint={formatted.value ? "#FF9F0A" : undefined}>
      <Image systemName={"wand.and.stars"} />
    </Button>
  );
}

function SaveButton({
  owner,
  repo: repoName,
  branch,
  path,
  sha,
  controller,
  onSaved,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  controller: EditorController;
  onSaved?: () => void;
}) {
  const dismiss = Navigation.useDismiss();
  const palette = useThemePalette();
  const isload = useObservable<boolean>(false);
  return (
    // 1.0.27：打勾改成跟 Gist 一樣 icon-only＋藍色 tint，兩顆 icon-only
    // 按鈕合在同一個膠囊裡（一個膠囊，不是兩個）。動作完全不動
    // （Dialog.prompt → putFile → onSaved → dismiss，跟 Repo Manager
    // 一模一樣）；存檔中顯示轉圈圈（之前 title+systemImage 寫法沒地方
    // 顯示 isload，現在跟 Gist 一樣放進子元件）。
    <Button tint={palette.accent}
      action={async () => {
        const msg = await Dialog.prompt({
          title: t("提交訊息", "提交信息", "Commit message"),
          defaultValue: t(`更新 ${path}（Scripting）`, `更新 ${path}（Scripting）`, `Update ${path} (Scripting)`),
        });
        if (msg === null || msg === undefined) return;
        isload.setValue(true);
        try {
          await repo.putFile({
            owner,
            repo: repoName,
            path,
            branch,
            message: msg || t(`更新 ${path}（Scripting）`, `更新 ${path}（Scripting）`, `Update ${path} (Scripting)`),
            base64: textToBase64(controller.content),
            sha,
          });
          if (onSaved) onSaved();
          dismiss();
        } catch (e: any) {
          await Dialog.alert({ title: t("儲存失敗", "保存失败", "Save failed"), message: String(e?.message || e) });
        }
        isload.setValue(false);
      }}>
      {isload.value ? <ProgressView /> : <Image systemName={"checkmark"} />}
    </Button>
  );
}
