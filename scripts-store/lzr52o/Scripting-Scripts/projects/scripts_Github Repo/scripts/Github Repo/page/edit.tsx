import { Image, Navigation, Path, ProgressView, useEffect, useObservable } from "scripting";
import { Button, Editor, useMemo } from "scripting";
import { parseMoveTarget, repo, textToBase64 } from "../class/repo";
import { t } from "../class/i18n";

export function View({
  owner,
  repo: repoName,
  branch,
  path,
  onSaved,
  onRenamed,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  onSaved?: () => void;
  onRenamed?: (newPath: string, newRepo?: string, newBranch?: string) => Promise<void>;
}) {
  const file = useObservable<{ text: string; sha: string } | undefined>(undefined);

  async function init() {
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

  if (file.value === undefined) return <ProgressView title={t("載入中", "载入中", "Loading...")} />;
  if (file.value === null) return <ProgressView title={t("載入失敗，請返回", "载入失败，请返回", "Failed to load, please go back")} />;
  return <MyEditor owner={owner} repo={repoName} branch={branch} path={path} sha={file.value.sha} initial={file.value.text} onSaved={onSaved} onRenamed={onRenamed} />;
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
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  initial: string;
  onSaved?: () => void;
  onRenamed?: (newPath: string, newRepo?: string, newBranch?: string) => Promise<void>;
}) {
  const controller = useMemo(() => {
    return new EditorController({ content: initial ?? "", ext: Path.extname(path) as any });
  }, []);

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
        confirmationAction: [
          <RenameSaveButton owner={owner} repo={repoName} branch={branch} path={path} sha={sha} controller={controller} onSaved={onSaved} onRenamed={onRenamed} />,
          <SaveButton owner={owner} repo={repoName} branch={branch} path={path} sha={sha} controller={controller} onSaved={onSaved} />,
        ],
      }}
    />
  );
}

// v3.0：編輯時順便更名／換目錄，做法跟 GitHub 網頁編輯一樣。
// 右邊打勾是原本的「只存內容」不動；這一顆是「改路徑再存」：
// 先問新路徑（檔名跟目錄可以一次改），再問提交訊息，最後用一次提交
// 把新內容寫到新路徑、舊路徑刪除，分支不變。路徑沒改時就退回原本
// 的 putFile 存法，不會因為誤觸就多一次搬移。
function RenameSaveButton({
  owner,
  repo: repoName,
  branch,
  path,
  sha,
  controller,
  onSaved,
  onRenamed,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  controller: EditorController;
  onSaved?: () => void;
  onRenamed?: (newPath: string, newRepo?: string, newBranch?: string) => Promise<void>;
}) {
  const dismiss = Navigation.useDismiss();
  const isload = useObservable<boolean>(false);
  return (
    <Button
      action={async () => {
        const newPathRaw = await Dialog.prompt({
          title: t("路徑/檔名", "路径/文件名", "Path/filename"),
          defaultValue: `${repoName}/${path}`,
        });
        if (newPathRaw === null || newPathRaw === undefined) return;
        // 回饋 4：提示顯示倉庫名（repoName/path），送出前把 owner/repo/
        // 或 repo/ 前綴去掉，GitHub API 才不會多出一層同名資料夾。
        // 2026-11-05 回饋：提示第一段就是倉庫名，留著就是同倉庫搬，
        // 改成別的倉庫名就是跨倉庫搬（moveFileToRepo：先查目標倉庫、
        // 不存在就提示失敗不提交）。同倉庫換資料夾請保留倉庫名開頭。
        const newPathInput = String(newPathRaw).trim();
        if (newPathInput.split("/").some((s) => s === "..")) {
          await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("路徑不能包含 ..。", "路径不能包含 ..。", "Path cannot contain ...") });
          return;
        }
        const target = parseMoveTarget(newPathInput, owner, repoName);
        const newPath = target.path;
        const isCross = target.repo !== repoName;
        if (!newPath) return;
        const msg = await Dialog.prompt({
          title: t("提交訊息", "提交信息", "Commit message"),
          defaultValue:
            !isCross && newPath === path
              ? t(`更新 ${path}（Scripting）`, `更新 ${path}（Scripting）`, `Update ${path} (Scripting)`)
              : t(`移動並更新 ${path} 至 ${isCross ? `${target.repo}/${target.path}` : newPath}（Scripting）`, `移动并更新 ${path} 至 ${isCross ? `${target.repo}/${target.path}` : newPath}（Scripting）`, `Move and update ${path} to ${isCross ? `${target.repo}/${target.path}` : newPath} (Scripting)`),
        });
        if (msg === null || msg === undefined) return;
        // 2026-11-05 回饋：會移動到其他倉庫時先彈窗提醒，確認後才移動。
        // 只在跨倉庫時跳，同倉庫改名不跳；取消就留在編輯器，不關頁。
        if (isCross) {
          const ok = await Dialog.confirm({
            title: t("移動到其他倉庫", "移动到其他仓库", "Move to another repository"),
            message: t(`確定要移動以下檔案嗎？\n「${path}」\n從 "${repoName}" 移動到 "${target.repo}"`, `确定要移动以下文件吗？\n「${path}」\n从 "${repoName}" 移动到 "${target.repo}"`, `Move the following file to another repository?\n"${path}"\nFrom "${repoName}" to "${target.repo}"`),
          });
          if (!ok) return;
        }
        isload.setValue(true);
        try {
          let targetBranch: string | undefined = undefined;
          if (!isCross && newPath === path) {
            await repo.putFile({
              owner,
              repo: repoName,
              path,
              branch,
              message: msg || t(`更新 ${path}（Scripting）`, `更新 ${path}（Scripting）`, `Update ${path} (Scripting)`),
              base64: textToBase64(controller.content),
              sha,
            });
          } else if (isCross) {
            const r = await repo.moveFileToRepo({
              owner,
              repo: repoName,
              branch,
              message:
                msg ||
                t(`移動並更新 ${path} 至 ${target.repo}/${target.path}（Scripting）`, `移动并更新 ${path} 至 ${target.repo}/${target.path}（Scripting）`, `Move and update ${path} to ${target.repo}/${target.path} (Scripting)`),
              oldPath: path,
              targetRepo: target.repo,
              targetPath: target.path,
              newText: controller.content,
            });
            targetBranch = r.targetBranch;
          } else {
            await repo.moveFile({
              owner,
              repo: repoName,
              branch,
              message:
                msg ||
                t(`移動並更新 ${path} 至 ${newPath}（Scripting）`, `移动并更新 ${path} 至 ${newPath}（Scripting）`, `Move and update ${path} to ${newPath} (Scripting)`),
              oldPath: path,
              newPath,
              newText: controller.content,
            });
          }
          // 2026-11-05 回饋：編輯並改名後不能只叫 onSaved（那只會重載
          // 舊資料夾），要叫 onRenamed 讓詳情頁換成新路徑、瀏覽頁切到
          // 新資料夾；跨倉庫時把新倉庫跟新分支也帶過去，詳情頁就顯示
          // 新倉庫的檔案；路徑跟倉庫都沒改時還是走原本的 onSaved。
          if ((isCross || newPath !== path) && onRenamed) await onRenamed(newPath, isCross ? target.repo : undefined, targetBranch);
          else if (onSaved) onSaved();
          dismiss();
        } catch (e: any) {
          await Dialog.alert({ title: t("儲存失敗", "保存失败", "Save failed"), message: String(e?.message || e) });
        }
        isload.setValue(false);
      }}
    >
      {isload.value ? <ProgressView /> : <Image systemName={"folder"} />}
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
  const isload = useObservable<boolean>(false);
  return (
    <Button
      title={t("儲存", "保存", "Save")}
      systemImage={"checkmark"}
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
      }}
    />
  );
}
