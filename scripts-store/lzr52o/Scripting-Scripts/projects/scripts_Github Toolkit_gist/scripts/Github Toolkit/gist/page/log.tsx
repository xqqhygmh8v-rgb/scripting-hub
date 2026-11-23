import { ThemeCardBackground } from "../../components/themePalette";
import { DiffFileView } from "../../components/diffView";
import {
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Button,
  HStack,
  Text,
  Section,
  ProgressView,
  Spacer,
  useObservable,
  useEffect,
  useState,
  Image,
  Label,

  Rectangle,} from "scripting";
import { getLogs, clearLogs, deleteLog, getLogStorageMode, LogEntry } from "./activityLog";
import { gist, getAccounts } from "../class/gist";
import { flushOrders } from "./fileOrder";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { SwipeRowBackground } from "../../components/swipeRowBackground";
import { t } from "../../components/i18n";

export function View() {
  const dismiss = Navigation.useDismiss();
  const logs = useObservable(getLogs());
  const isDeleting = useObservable<boolean>(false);
  // 滑動開啟中的列，讓該列背景四角變圓弧。
  const [openSwipe, setOpenSwipe] = useState<number | null>(null);

  return (
    <NavigationStack>
      <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        // 活動記錄每列只有一行字，列高收緊，滑出來的膠囊也跟著變小。
        listRowInsets={{ top: 2, leading: 16, bottom: 2, trailing: 16 }}
        // 滑動膠囊的高度跟著元件尺寸走，小一號的 controlSize 才會真的變小。
        controlSize="small"
        navigationTitle={t("活動記錄", "活动记录", "Activity Log")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [
            <Button title={t("關閉", "关闭", "Close")} systemImage={"xmark"} action={dismiss} />,
          ],
          topBarTrailing: [
            <Button
              action={async () => {
                const isGist = getLogStorageMode() === "gist";
                const ok = await Dialog.confirm({
                  title: t("清空記錄", "清空记录", "Clear Log"),
                  message: isGist
                    ? t("⚠️ 雲端資料也將同步刪除！\n\n確定要清空所有活動記錄嗎？", "⚠️ 云端数据也将同步删除！\n\n确定要清空所有活动记录吗？", "⚠️ Cloud data will also be deleted!\n\nAre you sure you want to clear all activity logs?")
                    : t("確定要清空所有活動記錄嗎？", "确定要清空所有活动记录吗？", "Are you sure you want to clear all activity logs?"),
                });
                if (ok) {
                  isDeleting.setValue(true);
                  try {
                    clearLogs();
                    logs.setValue([]);
                    await flushOrders();
                    dismiss();
                  } catch (e) {
                    await Dialog.alert({ title: t("錯誤", "错误", "Error"), message: String(e) });
                  }
                  isDeleting.setValue(false);
                }
              }}>
              {isDeleting.value ? <ProgressView /> : <Image systemName={"trash"} />}
            </Button>,
          ],
        }}
      >
        {logs.value.length === 0 ? (
          <Section>
            <Text listRowBackground={<ThemeCardBackground />} foregroundStyle="secondaryLabel">{t("暫無活動記錄", "暂无活动记录", "No activity logs yet")}</Text>
          </Section>
        ) : (
          logs.value
            .slice()
            .reverse()
            .map((entry: LogEntry, revIndex: number) => {
              const origIndex = logs.value.length - 1 - revIndex;

              async function handleDelete() {
                const isGist = getLogStorageMode() === "gist";
                const ok = await Dialog.confirm({
                  title: t("刪除記錄", "删除记录", "Delete Log Entry"),
                  message: isGist
                    ? t("⚠️ 雲端資料也將同步刪除！\n\n確定要刪除這條記錄嗎？", "⚠️ 云端数据也将同步删除！\n\n确定要删除这条记录吗？", "⚠️ Cloud data will also be deleted!\n\nAre you sure you want to delete this log entry?")
                    : t("確定要刪除這條記錄嗎？", "确定要删除这条记录吗？", "Are you sure you want to delete this log entry?"),
                });
                if (!ok) return;
                isDeleting.setValue(true);
                try {
                  deleteLog(origIndex);
                  // 從可觀察陣列中移除該項，立即刷新 UI
                  const updated = [...logs.value];
                  updated.splice(origIndex, 1);
                  logs.setValue(updated);
                  await flushOrders();
                } catch (e) {
                  await Dialog.alert({ title: t("錯誤", "错误", "Error"), message: String(e) });
                }
                isDeleting.setValue(false);
              }

              // 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上
              //（不要掛 NavigationLink）。選項跟原本一對一相同：
              //共享／複製內容／刪除記錄，刪除沿用 handleDelete 本來的確認流程。
              //按鈕是素 Button＋Label 子元件。
              // 2.0.12：列高再往下壓。只調 listRowInsets 時，列還是被內容
              // 與 List 的最小列高撐在原來的高度，滑出來的膠囊就跟著不變小；
              // 這裡直接把內容列本身的高度定為 30，列高變成 30 加內距，
              // 膠囊貼著列高畫，就會真的變小一號。
              return (
                <NavigationLink listRowBackground={<SwipeRowBackground isPresented={openSwipe === origIndex} />}
                  key={origIndex}
                  destination={
                    <LogDetail
                      entry={entry}
                      navigationTitle={t("詳情", "详情", "Details")}
                      navigationBarTitleDisplayMode={"inline"}
                    />
                  }
                >
                  <HStack alignment={"center"} frame={{ maxWidth: "infinity", height: 30 }}
                    // 2.0.27：滑動刪除改成長按刪除（跟 Gist／Repo 首頁同一招）。
                    // 左滑只剩共享跟複製，刪除改成長按這列叫出的選單。
                    contextMenu={{
                      menuItems: (
                        <>
                          <Section>
                            <Button title={t("刪除記錄", "删除记录", "Delete Log Entry")} systemImage="trash" role="destructive" action={async () => { await handleDelete(); }} />
                          </Section>
                        </>
                      ),
                    }}
                    trailingSwipeActions={{
                    allowsFullSwipe: false,
                    onPresentationChanged: (presented: boolean) => setOpenSwipe(current => presented ? origIndex : current === origIndex ? null : current),
                    actions: [
                      <Button action={async () => { await shareEntry(entry); }} tint="accentColor">
                        <Label title={t("共享", "共享", "Share")} systemImage="square.and.arrow.up" />
                      </Button>,
                      <Button action={async () => { await copyEntry(entry); }} tint="accentColor">
                        <Label title={t("複製內容", "复制内容", "Copy Content")} systemImage="doc.on.doc" />
                      </Button>,
                    ],
                  }}>
                    <Text font={15} lineLimit={1}>{formatListTitle(entry)}</Text>
                  </HStack>
                </NavigationLink>
              );
            })
        )}
      </List>
    </NavigationStack>
  );
}

// 記錄裡存的 action 是中文固定值（刪除判斷也靠它開頭是不是「刪除」），
// 顯示時才翻譯，儲存值不動，舊記錄也跟著變語言。
function translateAction(action: string): string {
  switch (action) {
    case "新增列表": return t("新增列表", "新增列表", "Created Gist");
    case "新增檔案": return t("新增檔案", "新增文件", "Added file");
    case "編輯檔案": return t("編輯檔案", "编辑文件", "Edited file");
    case "重新命名": return t("重新命名", "重命名", "Renamed file");
    case "刪除檔案": return t("刪除檔案", "删除文件", "Deleted file");
    case "刪除列表": return t("刪除列表", "删除列表", "Deleted Gist");
    default: return action;
  }
}

function formatListTitle(entry: LogEntry): string {
  const time = new Date(entry.time);
  const timeStr =
    (time.getMonth() + 1) +
    "/" +
    time.getDate() +
    " " +
    time.getHours().toString().padStart(2, "0") +
    ":" +
    time.getMinutes().toString().padStart(2, "0");
  return timeStr + "  " + translateAction(entry.action) + " " + (entry.fileName || entry.gistName);
}

function LogDetail({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.time);
  const fullTime =
    time.getFullYear() +
    "-" +
    (time.getMonth() + 1).toString().padStart(2, "0") +
    "-" +
    time.getDate().toString().padStart(2, "0") +
    " " +
    time.getHours().toString().padStart(2, "0") +
    ":" +
    time.getMinutes().toString().padStart(2, "0") +
    ":" +
    time.getSeconds().toString().padStart(2, "0");

  const isDelete =
    entry.action.startsWith("刪除") || entry.action.startsWith("删除");
  // 2.1.10：變更紀錄的總計（+x / −y），跟版本歷史的寫法一致。
  const changesAdd = entry.changes?.reduce((sum, file) => sum + (file.additions || 0), 0) ?? 0;
  const changesDel = entry.changes?.reduce((sum, file) => sum + (file.deletions || 0), 0) ?? 0;

  return (
    <NavigationStack>
      <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}
>
        <Section title={t("時間", "时间", "Time")}>
          <Text listRowBackground={<ThemeCardBackground />}>{fullTime}</Text>
        </Section>
        <Section title={t("操作", "操作", "Action")}>
          <Text listRowBackground={<ThemeCardBackground />}>{translateAction(entry.action)}</Text>
        </Section>
        <Section title={t("列表", "列表", "List")}>
          <Text listRowBackground={<ThemeCardBackground />}>{entry.gistName}</Text>
        </Section>
        {entry.fileName ? (
          <Section title={t("檔名", "文件名", "Filename")}>
            <Text listRowBackground={<ThemeCardBackground />}>{entry.fileName}</Text>
          </Section>
        ) : null}
        {entry.changes && entry.changes.length > 0 ? (
          <Section title={t("變更紀錄", "变更记录", "Changes")}>
            <Text listRowBackground={<ThemeCardBackground />} font={12} foregroundStyle="secondaryLabel">
              {t(
                `${entry.changes.length} 個檔案 · +${changesAdd} / −${changesDel}`,
                `${entry.changes.length} 个文件 · +${changesAdd} / −${changesDel}`,
                `${entry.changes.length} files · +${changesAdd} / −${changesDel}`,
              )}
            </Text>
            {entry.changesApproximate ? (
              <Text listRowBackground={<ThemeCardBackground />} font={11} foregroundStyle="secondaryLabel">
                {t(
                  "檔案太大，採整段比對：中間被改寫的部分會同時列為刪除與新增。",
                  "文件太大，采用整段比对：中间被改写的部分会同时列为删除与新增。",
                  "File too large for a line-by-line diff; the rewritten middle is shown as deletions plus additions.",
                )}
              </Text>
            ) : null}
            {entry.changesTruncated ? (
              <Text listRowBackground={<ThemeCardBackground />} font={11} foregroundStyle="secondaryLabel">
                {t("變更過多，以下僅顯示部分內容。", "变更过多，以下仅显示部分内容。", "Too many changes; only part is shown below.")}
              </Text>
            ) : null}
            {entry.changes.map((file) => (
              <DiffFileView key={file.filename} {...file} />
            ))}
          </Section>
        ) : entry.renamedFrom ? (
          <Section title={t("變更紀錄", "变更记录", "Changes")}>
            <Text listRowBackground={<ThemeCardBackground />} font={12}>
              {t(`檔名：${entry.renamedFrom} → ${entry.fileName}`, `文件名：${entry.renamedFrom} → ${entry.fileName}`, `Filename: ${entry.renamedFrom} → ${entry.fileName}`)}
            </Text>
            <Text listRowBackground={<ThemeCardBackground />} font={11} foregroundStyle="secondaryLabel">
              {t("內容未變更。", "内容未变更。", "Content unchanged.")}
            </Text>
          </Section>
        ) : entry.action === "編輯檔案" || entry.action === "新增檔案" || entry.action === "刪除檔案" || entry.action === "新增列表" ? (
          // 2.1.11：以前沒有 changes 就整區不出現，看起來像「沒記錄到異動」，
          // 分不出是舊紀錄、內容沒變，還是差異算失敗。現在至少說清楚。
          // 2.1.12：truncated 且有 changes 已在上面顯示；truncated 但一筆都沒算成功
          // 代表這次是差異計算失敗，不能講成「內容沒有差異」。
          <Section title={t("變更紀錄", "变更记录", "Changes")}>
            <Text listRowBackground={<ThemeCardBackground />} font={11} foregroundStyle="secondaryLabel">
              {entry.changesTruncated
                ? t(
                    "這筆的內容太大，差異計算失敗，無法顯示變更內容。",
                    "这笔的内容太大，差异计算失败，无法显示变更内容。",
                    "This entry was too large to diff, so the changes could not be shown.",
                  )
                : t(
                    "這筆沒有變更紀錄（舊版記錄，或內容沒有實際差異）。",
                    "这笔没有变更记录（旧版记录，或内容没有实际差异）。",
                    "No change details for this entry (older log, or the content did not actually change).",
                  )}
            </Text>
          </Section>
        ) : null}
        {/* 2.1.11：有變更紀錄時不再重複附全文（也是之前那段要額外抓一次 raw 的地方）；
            沒有的話照舊顯示全文。 */}
        {(entry.changes && entry.changes.length > 0) ? null : entry.content ? (
          <ContentSection content={entry.content} />
        ) : entry.contentUrl && !isDelete ? (
          <RemoteContentSection url={entry.contentUrl} accountUsername={entry.accountUsername} />
        ) : null}
        {!entry.content && !entry.contentUrl && isDelete ? (
          <Section title={t("內容", "内容", "Content")}>
            <Text listRowBackground={<ThemeCardBackground />} foregroundStyle="secondaryLabel">
              {t("已刪除，無內容快照", "已删除，无内容快照", "Deleted, no content snapshot")}
            </Text>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  );
}

function ContentSection({
  content,
}: {
  content: string;
}) {
  return (
    <Section title={t("內容", "内容", "Content")}>
      <Text listRowBackground={<ThemeCardBackground />} font="footnote">
        {content.slice(0, 2000)}
        {content.length > 2000 ? t("\n\n...（內容過長，已截斷）", "\n\n...（内容过长，已截断）", "\n\n...(Content too long, truncated)") : ""}
      </Text>
    </Section>
  );
}

// v1.1.0：多帳號。記錄有記帳號就用那個帳號的 Token 看內容，
// 舊記錄沒記帳號就退回第一個帳號（gist.token）。
function tokenForAccount(accountUsername?: string): string {
  if (accountUsername) {
    const acc = getAccounts().find((a) => a.username === accountUsername);
    if (acc) return acc.token;
  }
  return gist.token;
}

function RemoteContentSection({
  url,
  accountUsername,
}: {
  url: string;
  accountUsername?: string;
}) {
  const content = useObservable<string>();

  useEffect(() => {
    (async () => {
      try {
        const text = await gist.withToken(tokenForAccount(accountUsername), () =>
          gist.getContent(url)
        );
        content.setValue(text);
      } catch (e) {
        content.setValue(t(`載入失敗: ${String(e)}`, `载入失败: ${String(e)}`, `Failed to load: ${String(e)}`));
      }
    })();
  }, [url]);

  if (content.value === undefined) {
    return (
      <Section title={t("內容", "内容", "Content")}>
        <ProgressView listRowBackground={<ThemeCardBackground />} />
      </Section>
    );
  }

  return (
    <Section title={t("內容", "内容", "Content")}>
      <Text listRowBackground={<ThemeCardBackground />} font="footnote">
        {content.value!.slice(0, 2000)}
        {content.value!.length > 2000 ? t("\n\n...（內容過長，已截斷）", "\n\n...（内容过长，已截断）", "\n\n...(Content too long, truncated)") : ""}
      </Text>
    </Section>
  );
}

// ── 共享/複製工具函數 ──────────────────────────────────────

async function getEntryContent(entry: LogEntry): Promise<string> {
  if (entry.content) return entry.content;
  if (entry.contentUrl) {
    const url = entry.contentUrl;
    return await gist.withToken(tokenForAccount(entry.accountUsername), () =>
      gist.getContent(url)
    );
  }
  throw t("該記錄無可用內容", "该记录无可用内容", "This log entry has no content available");
}

async function shareEntry(entry: LogEntry) {
  try {
    const content = await getEntryContent(entry);
    const fname = entry.fileName || entry.gistName.replace(/[/\\]/g, "_") || "gist.txt";
    const tmpPath = FileManager.temporaryDirectory + "/" + fname;
    await FileManager.writeAsString(tmpPath, content);
    await ShareSheet.present([tmpPath]);
  } catch (e) {
    await Dialog.alert({ title: t("錯誤", "错误", "Error"), message: String(e) });
  }
}

async function copyEntry(entry: LogEntry) {
  try {
    const content = await getEntryContent(entry);
    await Pasteboard.setString(content);
  } catch (e) {
    await Dialog.alert({ title: t("錯誤", "错误", "Error"), message: String(e) });
  }
}
