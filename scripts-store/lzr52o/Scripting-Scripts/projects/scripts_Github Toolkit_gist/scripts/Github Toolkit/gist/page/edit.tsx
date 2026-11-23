import { Image, Navigation, NavigationStack, Path, ProgressView, Rectangle, ScrollView, Spacer, Text, VStack, useEffect, useObservable } from "scripting";
import { Button, Editor, useMemo } from "scripting";
import { gist } from "../class/gist";
import { addLog, buildChanges } from "./activityLog";
import { flushOrders } from "./fileOrder";
import { t } from "../../components/i18n";
import { PAGE_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { useThemePalette } from "../../components/themePalette";
import { formatCode, isFormattableExt } from "../../components/formatCode";
import { EditorSearchSheet, SearchButton } from "../../components/editorSearch";

export function View({
  filename,
  info,
  list,
  accountToken,
  onSaved,
}: {
  filename: string;
  info: any;
  list: Observable<any[] | undefined>;
  accountToken: string;
  onSaved: () => Promise<void>;
}) {
  const file = useObservable<string>();
  // 2.1.11：載入失敗時以前只跳一個 alert，file 一直是 undefined，整頁就
  // 永遠停在「載入中」轉圈；關掉 alert 也回不到編輯器。現在記下錯誤，
  // 直接畫一頁失敗訊息＋重試，不再無盡轉圈。
  const loadError = useObservable<string>();

  async function init() {
    try {
      const r = await gist.withToken(accountToken, () =>
        gist.getContent(info.files[filename].raw_url)
      );
      file.setValue(r);
    } catch (e) {
      loadError.setValue(String(e));
    }
  }

  // 2.0.11：本頁強調色跟背景主題連動。
  const palette = useThemePalette();

  useEffect(() => {
    init();
  }, []);

  // 載入時不回 bare ProgressView：它沒有背景，整頁會閃黑。包一層深灰
  // ScrollView，載入中也是深灰底。
  if (file.value === undefined) return (
    <ScrollView tint={palette.accent} background={<GlassBackground />} navigationTitle={filename}>
      <VStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }} alignment="center">
        <Spacer />
        {loadError.value ? (
          <VStack spacing={12}>
            <Text foregroundStyle="secondaryLabel" font="footnote">
              {t(`載入失敗：${loadError.value}`, `载入失败：${loadError.value}`, `Failed to load: ${loadError.value}`)}
            </Text>
            <Button
              title={t("重試", "重试", "Retry")}
              action={() => {
                loadError.setValue(undefined);
                init();
              }}
            />
          </VStack>
        ) : (
          <ProgressView title={t("載入中", "载入中", "Loading")} />
        )}
        <Spacer />
      </VStack>
    </ScrollView>
  );
  return (
    <MyEditor
      info={info}
      filename={filename}
      file={file.value}
      list={list}
      accountToken={accountToken}
      onSaved={onSaved}
    />
  );
}

function MyEditor({
  info,
  filename,
  file,
  list,
  accountToken,
  onSaved,
}: {
  info: any;
  filename: string;
  file: string;
  list: Observable<any[] | undefined>;
  accountToken: string;
  onSaved: () => Promise<void>;
}) {
  const controller = useMemo(() => {
    return new EditorController({ content: file ?? "", ext: Path.extname(filename) as any });
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

  // 1.0.20：formatted 改成魔法棒自己管（FormatButton 內部），不要
  // 再放在編輯器這層。之前放在這層，魔法棒一成功編輯器就整個重畫、
  // 工具列重建（Repository 那邊就是這樣把打勾的 Dialog.prompt 弄壞的）。
  // Gist 打勾本來就沒在跳視窗，不受影響，但做法統一，編輯器都不重畫。

  // v1.3.7：編輯器拿掉 List，回到全螢幕。1.3.5/1.3.6 把 Editor 塞進 List 列裡，
  // 鍵盤一出現 List 就會捲動、面板跟著位移，輸入工具列（showAccessoryView）
  // 也跟系統鍵盤重疊；全螢幕的 Editor（跟 Repository 的編輯器一樣）本來就自己處理
  // 鍵盤，不會有這個問題。X 跟勾改用 Editor 自己的 toolbar 左右按鈕：
  // cancellationAction 是左邊 X（跟設定頁 List 的 cancellationAction 同一個
  // 寫法）、confirmationAction 是右邊勾，標題放在 Editor 的 navigationTitle，
  // 整個包在 NavigationStack 裡才有導覽列可以放這些按鈕；固定高度也拿掉了，
  // 全螢幕本來就是一大片。
  return (
    <NavigationStack>
      <Editor
        controller={controller}
        scriptName={t("編輯器", "编辑器", "Editor")}
        showAccessoryView={true}
        navigationTitle={filename}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          cancellationAction: [<CancelButton />],
          confirmationAction: [
            <SearchButton onOpen={openSearch} />,
            ...(isFormattableExt(Path.extname(filename) || "")
              ? [<FormatButton controller={controller} path={filename} />]
              : []),
            <SaveButton
              info={info}
              filename={filename}
              controller={controller}
              list={list}
              accountToken={accountToken}
              onSaved={onSaved}
              original={file}
            />,
          ],
        }}
      />
    </NavigationStack>
  );
}

function CancelButton() {
  const dismiss = Navigation.useDismiss();
  return <Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={dismiss} />;
}

// 1.0.27：魔法棒一開始沒上色（深色），點下去格式化成功才變橘色；
// 格式化不了就跳「格式化失敗」錯誤訊息（本來就有）。變色只改同一個
// Button 的 tint prop（1.0.12 證實過這樣會變色），不換按鈕寫法、不拆
// 膠囊；狀態放在魔法棒自己裡面，只有魔法棒自己重畫。打勾不動
// （icon-only＋藍色 tint，本來就是預設藍色）。
function FormatButton({ controller, path }: { controller: EditorController; path: string }) {
  const ext = Path.extname(path) || "";
  const formatted = useObservable<boolean>(false);
  const doFormat = async () => {
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
  info,
  filename,
  controller,
  list,
  accountToken,
  onSaved,
  original,
}: {
  info: any;
  filename: string;
  controller: EditorController;
  list: Observable<any[] | undefined>;
  accountToken: string;
  onSaved: () => Promise<void>;
  original: string;
}) {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：存檔按鈕的顏色也跟背景主題連動（之前寫死系統藍）。
  const palette = useThemePalette();
  const isload = useObservable<boolean>(false);
  return (
    <Button tint={palette.accent}
      action={async () => {
        isload.setValue(true);
        try {
          // 2026-11-14：防刪檔。存檔前先確認內容真的是字串；如果編輯器
          // 的內容不是字串（載入異常、狀態不同步），updateContent 會直接
          // 丟錯，這裡先擋下來、不送請求。內容是空字串時先問一次——空內容
          // 存上去檔案可能被 GitHub 移除，真的要清空請再確認一次。
          if (typeof controller.content !== "string") {
            throw t("內容無效，無法儲存（內容不是文字），請重新開啟編輯器再試", "内容无效，无法保存（内容不是文字），请重新打开编辑器再试", "Invalid content, cannot save (content is not text). Please reopen the editor and try again");
          }
          if (controller.content === "") {
            const idx = await Dialog.actionSheet({
              title: t("內容是空的", "内容是空的", "Content is empty"),
              message: t("確定要把檔案存成空的嗎？空檔案可能會被 GitHub 移除。", "确定要把文件存成空的吗？空文件可能会被 GitHub 移除。", "Save this file as empty? An empty file may be removed by GitHub."),
              actions: [{ label: t("確認儲存", "确认保存", "Confirm Save"), destructive: true }],
            });
            if (idx !== 0) {
              isload.setValue(false);
              return;
            }
          }
          // 2.1.11：內容只讀一次，後面存檔跟算差異都用同一份。之前先 await
          // 上層刷新才寫日誌，刷新一失敗（或很慢）就會變成「已經存成功了，
          // 活動記錄卻沒有這筆」；而且那時才讀 controller.content，也可能
          // 已經不是實際送上傳的那份內容。
          const content = controller.content;
          const updated = await gist.withToken(accountToken, () =>
            gist.updateContent(info.url, filename, content)
          );
          // 2.1.11：先寫活動記錄（在存檔成功後的第一時間），再刷新列表。
          const { changes, truncated, approximate } = buildChanges([
            { filename, before: original, after: content },
          ]);
          addLog({
            action: "編輯檔案",
            gistName: `${info.owner.login}/${Object.keys(info.files)[0] || ""}`,
            fileName: filename,
            // 用 PATCH 回傳的 raw URL，不要用舊 info 的。
            contentUrl: updated?.files?.[filename]?.raw_url ?? info.files[filename]?.raw_url,
            accountUsername: info._accountUsername,
            changes,
            changesTruncated: truncated,
            changesApproximate: approximate,
          });
          // 刷新失敗不要讓整個存檔變成「錯誤」——檔案其實已經存好了。
          try {
            await onSaved();
          } catch {}
          // 日誌同步失敗也一樣：存檔已成功，不要因此跳錯誤。
          try {
            await flushOrders();
          } catch {}
          dismiss();
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
