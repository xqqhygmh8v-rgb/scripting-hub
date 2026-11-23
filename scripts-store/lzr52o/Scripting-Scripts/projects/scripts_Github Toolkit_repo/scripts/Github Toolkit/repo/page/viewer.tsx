import { Button, List, Navigation, Section, Text, useEffect, useObservable } from "scripting";
import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { GlassBackground } from "../../components/glass";
import { REPO_LIST, RepoHeader } from "../../components/repoUI";
import { LoadingRow } from "../../components/loadingRow";
import { previewBase64AsFile } from "../../components/filePreview";
import { MAX_VIEW_BYTES, looksLikeText, repo } from "../class/repo";
import { t } from "../class/i18n";
import { View as ReadOnlyEditorView } from "./edit";

// 2026-11-20：唯讀內容檢視頁（收藏裡其他使用者的倉庫）。
// 檔案頁那顆「查看內容／預覽檔案」不分類型都推到這一頁，由這裡決定
// 怎麼呈現：
// - 純文字 → 直接把整頁交給唯讀編輯器（高亮、可搜尋）
// - 二進位（圖片、PDF 等）→ 載好內容後自動開系統 QuickLook 預覽，
//   關掉預覽就自己退回檔案頁（2026-11-20 回饋：不要留一個
//   「無法檢視」的空頁在那邊）。只有預覽失敗才留在頁上顯示錯誤。
//
// 內容來源順序：
// 1. 檔案頁的 meta.content（1MB 以下，GitHub contents API 直接給 base64）
// 2. 沒有就改用 sha 讀 git/blobs（可拿到 1MB 以上）
// 3. 大小超過 MAX_VIEW_BYTES（5 MB）就不載入，直接提示改用下載
export function View({
  owner,
  repo: repoName,
  branch,
  path,
  sha,
  size,
  initialBase64,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha?: string;
  size?: number;
  initialBase64?: string;
}) {
  const palette = useThemePalette();
  const dismiss = Navigation.useDismiss();
  // undefined = 載入中；null = 失敗；字串 = 內容好了。
  const content = useObservable<string | null | undefined>(undefined);
  // 內容有、但不是純文字時，記住 base64 讓使用者可以再次預覽。
  const binaryBase64 = useObservable<string>("");
  const error = useObservable<string>("");

  async function load() {
    content.setValue(undefined);
    error.setValue("");
    binaryBase64.setValue("");
    try {
      let clean = initialBase64 ? String(initialBase64).replace(/\s/g, "") : "";
      if (!clean) {
        if (typeof size === "number" && size > MAX_VIEW_BYTES) {
          throw new Error(
            t(
              "檔案過大：超過 5 MB，請改用下載檔案。",
              "文件过大：超过 5 MB，请改用下载文件。",
              "File is too large (over 5 MB). Use Download file instead.",
            ),
          );
        }
        clean = await repo.getBlobBase64(owner, repoName, sha ?? "");
      }
      const data = Data.fromBase64String(clean);
      if (!data) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Failed to decode file content"));
      // 副檔名判斷不出來、或檔案頁直接指定要檢視時，用內容再確認一次：
      // 真的二進位就不硬開成文字，直接彈 QuickLook。
      if (!looksLikeText(data)) {
        binaryBase64.setValue(clean);
        // 這裡刻意不把 content 翻成 null：預覽期間畫面維持載入中，
        // QuickLook 蓋在上面；關掉預覽就退場，不會先閃一頁錯誤。
        // 只有預覽失敗時 previewBinary 才把錯誤頁叫出來。
        await previewBinary(clean);
        return;
      }
      const decoded = data.toDecodedString();
      if (decoded === null || decoded === undefined) {
        throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Failed to decode file content"));
      }
      content.setValue(decoded);
    } catch (e: any) {
      content.setValue(null);
      error.setValue(String(e?.message || e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  // 預覽二進位內容：成功就把預覽關掉後直接退回檔案頁；
  // 失敗才留在這頁顯示錯誤與「再次預覽」。
  async function previewBinary(base64?: string) {
    const clean = base64 ?? binaryBase64.value;
    try {
      await previewBase64AsFile(clean, path);
    } catch (e: any) {
      binaryBase64.setValue(clean);
      content.setValue(null);
      error.setValue(String(e?.message || e));
      return;
    }
    // 預覽成功、使用者已關掉 QuickLook，就退回檔案頁。
    // 退場失敗不能反過來被當成預覽失敗，所以獨立一層。
    try {
      dismiss();
    } catch {}
  }

  if (content.value === undefined) {
    return (
      <List
        {...REPO_LIST}
        tint={palette.accent}
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={owner}
      >
        <Section>
          <LoadingRow />
        </Section>
      </List>
    );
  }

  if (content.value === null) {
    return (
      <List
        {...REPO_LIST}
        tint={palette.accent}
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={owner}
      >
        <Section header={<RepoHeader symbol="exclamationmark.triangle" title={binaryBase64.value ? t("無法預覽", "无法预览", "Cannot preview") : t("無法檢視", "无法查看", "Cannot view")} />}>
          <Text listRowBackground={<ThemeCardBackground />}>{error.value}</Text>
          {binaryBase64.value ? (
            <Button
              listRowBackground={<ThemeCardBackground />}
              title={t("再次預覽", "再次预览", "Preview again")}
              systemImage="eye"
              action={() => previewBinary()}
            />
          ) : null}
          <Button
            listRowBackground={<ThemeCardBackground />}
            title={t("重新整理", "刷新", "Refresh")}
            systemImage="arrow.clockwise"
            action={load}
          />
        </Section>
      </List>
    );
  }

  // 內容好了就直接把整頁交給唯讀編輯器（Editor 要全螢幕，不能包在
  // List/VStack 裡，這點跟一般編輯頁完全一樣）。
  return (
    <ReadOnlyEditorView
      owner={owner}
      repo={repoName}
      branch={branch}
      path={path}
      readOnly
      initialText={content.value}
      initialSha={sha}
    />
  );
}
