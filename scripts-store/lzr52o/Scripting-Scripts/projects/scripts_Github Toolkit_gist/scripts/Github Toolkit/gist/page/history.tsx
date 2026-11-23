import { Navigation, NavigationStack, NavigationLink, List, Section, VStack, HStack, Spacer, Text, Button, Link, ProgressView, useState, useEffect } from "scripting";
import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { GlassBackground } from "../../components/glass";
import { LoadingRow } from "../../components/loadingRow";
import { DiffFileView } from "../../components/diffView";
import { t } from "../../components/i18n";
import { getRevisionHistory, getRevisionDiff, Revision, RevisionDiff, HistoryProgress, HistoryLoadError } from "../class/history";

type HistoryProps = { info: { id: string; description?: string | null; owner?: { login?: string } }; accountToken: string; filename?: string };
const dateText = (value: string) => new Date(value).toLocaleString(t("zh-TW", "zh-CN", "en-US"));
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
// 單一文件的歷史只需要版本號；整個 Gist 才顯示變更檔名 + 版本號。
function revisionTitle(revision: Revision, filename?: string) {
  const version = revision.version.slice(0, 12);
  if (filename !== undefined) return version;
  const files = revision.changedFiles?.join(", ") || "";
  return files ? `${files} · ${version}` : version;
}
function ErrorRow({ error, retry }: { error: string; retry: () => void }) {
  return <VStack alignment="leading" spacing={8} listRowBackground={<ThemeCardBackground />}>
    <Text foregroundStyle="systemRed" font={12}>{error}</Text>
    <Button title={t("重試", "重试", "Retry")} systemImage="arrow.clockwise" action={retry} />
  </VStack>;
}

// The list page supplies the Gist and its owning account's token.
export function View({ info, accountToken, filename }: HistoryProps) {
  const dismiss = Navigation.useDismiss();
  const { muted, accent } = useThemePalette();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<HistoryProgress | null>(null);
  useEffect(() => { setRevisions([]); setProgress(null); }, [info.id, accountToken, filename]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void getRevisionHistory(info.id, accountToken, filename, (value, partial) => {
      if (active) {
        setProgress(value);
        // 每批回來就立即列出已完成的部分，不等全部版本分析完。
        setRevisions(partial);
      }
    }, () => active).then(value => {
      if (active) setRevisions(value);
    }).catch(error => {
      if (!active) return;
      if (error instanceof HistoryLoadError) {
        setRevisions(error.partial); setProgress(error.progress);
      }
      setError(errorText(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [info.id, accountToken, filename, attempt]);
  return <NavigationStack>
    <List listStyle="insetGroup" scrollContentBackground="hidden" background={<GlassBackground />} tint={accent}
      navigationTitle={t("版本歷史", "版本历史", "Revision history")} navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title={t("關閉", "关闭", "Close")} systemImage="xmark" action={() => dismiss()} /> }}>
      <Section><VStack alignment="leading" spacing={6} listRowBackground={<ThemeCardBackground />}>
        <Text font={13}>{info.description || info.id}</Text>
        {filename !== undefined ? <Text font={12} foregroundStyle={muted} textSelection>{filename}</Text> : null}
      </VStack></Section>
      <Section header={<HStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <Text>{t("版本", "版本", "Revisions")}</Text>
        <Spacer />
        {loading ? <ProgressView tint={accent} /> : null}
        {loading && progress ? <Text font={12} foregroundStyle={muted}>{t(`已分析 ${progress.completed} / ${progress.total}`, `已分析 ${progress.completed} / ${progress.total}`, `${progress.completed} / ${progress.total} analyzed`)}</Text> : null}
      </HStack>}>
        {error ? <ErrorRow error={error} retry={() => setAttempt(value => value + 1)} /> : null}
        {revisions.map(revision => <NavigationLink key={revision.version} listRowBackground={<ThemeCardBackground />}
          destination={<RevisionDetail id={info.id} token={accountToken} revision={revision} previous={revision.previousVersion} filename={filename} />}>
          <VStack alignment="leading" spacing={6}>
            <Text font={13} monospaced>{revisionTitle(revision, filename)}</Text>
            <Text font={12} foregroundStyle={muted}>{`${revision.user?.login || info.owner?.login || "—"} · ${dateText(revision.committed_at)}`}</Text>
            <HStack spacing={8}>
              <Text font={11} foregroundStyle="systemGreen">{`+${revision.change_status?.additions ?? 0}`}</Text>
              <Text font={11} foregroundStyle="systemRed">{`−${revision.change_status?.deletions ?? 0}`}</Text>
              {!revision.previousVersion ? <Text font={11} foregroundStyle={muted}>{t("首次版本", "首次版本", "Initial revision")}</Text> : null}
            </HStack>
          </VStack>
        </NavigationLink>)}
        {!loading && !error && revisions.length === 0 ? <Text foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{t("沒有版本歷史", "没有版本历史", "No revision history")}</Text> : null}
      </Section>
    </List>
  </NavigationStack>;
}

function RevisionDetail({ id, token, revision, previous, filename }: { id: string; token: string; revision: Revision; previous?: string; filename?: string }) {
  const { muted, accent } = useThemePalette();
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setDiff(null);
    void getRevisionDiff(id, revision.version, previous, token, filename).then(value => {
      if (active) setDiff(value);
    }).catch(error => { if (active) setError(errorText(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token, revision.version, previous, filename, attempt]);
  const additions = diff?.files.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const deletions = diff?.files.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
  return <List listStyle="insetGroup" scrollContentBackground="hidden" background={<GlassBackground />} tint={accent}
    navigationTitle={t("版本差異", "版本差异", "Revision diff")} navigationBarTitleDisplayMode="inline">
    <Section title={t("版本", "版本", "Revision")}>
      <VStack alignment="leading" spacing={6} listRowBackground={<ThemeCardBackground />}>
        <Text font={12} monospaced textSelection>{`${previous?.slice(0, 12) || t("空版本", "空版本", "Empty")} → ${revision.version.slice(0, 12)}`}</Text>
        <Text font={12} foregroundStyle={muted}>{dateText(revision.committed_at)}</Text>
        {!previous ? <Text font={11} foregroundStyle={muted}>{t("首次版本：與空內容比較", "首次版本：与空内容比较", "Initial revision: compared with empty content")}</Text> : null}
      </VStack>
      <Link url={`https://gist.github.com/${encodeURIComponent(id)}/revisions#diff-${encodeURIComponent(revision.version)}`} listRowBackground={<ThemeCardBackground />}>
        <Text foregroundStyle={accent}>{t("在 GitHub 查看 ↗", "在 GitHub 查看 ↗", "View on GitHub ↗")}</Text>
      </Link>
    </Section>
    {loading ? <Section><LoadingRow /></Section> : null}
    {error ? <Section><ErrorRow error={error} retry={() => setAttempt(value => value + 1)} /></Section> : null}
    {diff ? <>
      <Section title={t("變更摘要", "变更摘要", "Change summary")}>
        <Text font={13} listRowBackground={<ThemeCardBackground />}>{t(`${diff.files.length} 個檔案`, `${diff.files.length} 个文件`, `${diff.files.length} files`) + ` · +${additions} / −${deletions}`}</Text>
      </Section>
      <Section title={t("檔案差異", "文件差异", "Changed files")}>
        {diff.files.map(file => <DiffFileView key={file.filename} {...file} />)}
        {diff.files.length === 0 ? <Text foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{t("沒有檔案內容差異（可能僅修改描述）", "没有文件内容差异（可能仅修改描述）", "No file content changes (the description may have changed)")}</Text> : null}
      </Section>
    </> : null}
  </List>;
}
