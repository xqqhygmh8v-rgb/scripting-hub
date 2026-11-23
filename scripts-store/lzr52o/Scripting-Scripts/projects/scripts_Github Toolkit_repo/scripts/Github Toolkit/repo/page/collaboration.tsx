import { Navigation, NavigationStack, NavigationLink, List, Section, HStack, VStack, Text, TextField, Button, Image, Label, ProgressView, Spacer, Link, useState, useEffect, useRef } from "scripting";
import { repo } from "../class/repo";
import { t } from "../../components/i18n";
import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { GlassBackground } from "../../components/glass";
import { LoadingRow } from "../../components/loadingRow";
import { SwipeRowBackground } from "../../components/swipeRowBackground";

export type CollaborationProps = {
  owner: string;
  repoName: string;
  token: string;
  currentBranch?: string;
  defaultBranch?: string;
  // 3.1：把某個分支設成預設分支後通知外層，讓瀏覽頁的「預設分支」狀態跟著更新。
  onDefaultChanged?: (branch: string) => void;
};
type Branch = { name: string; protected?: boolean };
type PullRequest = {
  id: number; number: number; title: string; body?: string | null;
  state: string; draft?: boolean; merged?: boolean; merged_at?: string | null;
  user?: { login?: string }; head?: { label?: string; ref?: string };
  base?: { label?: string; ref?: string }; html_url?: string;
  created_at?: string; updated_at?: string; closed_at?: string | null;
  commits?: number; additions?: number; deletions?: number; changed_files?: number;
};
type PullFile = { filename?: string; status?: string; additions?: number; deletions?: number; patch?: string };
type PullComment = { id: number; user?: { login?: string }; body?: string; created_at?: string; updated_at?: string };
const PAGE_SIZE = 100;
function diffLineStyle(line: string): { background: any; foreground: any } {
  if (line.startsWith("+")) return { background: "#173B2B", foreground: "#B7E4C7" };
  if (line.startsWith("-")) return { background: "#482628", foreground: "#FFB4AE" };
  if (line.startsWith("@@")) return { background: "#1C3455", foreground: "#A9C8FF" };
  return { background: "#22282D", foreground: "secondaryLabel" };
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error || t("載入失敗", "载入失败", "Failed to load"));
const dateText = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(t("zh-TW", "zh-CN", "en-US"));
};

// Request generations prevent old filters/accounts and unmounted pages from publishing results.
// The synchronous lock also prevents two rapid load-more taps from fetching the same page.
function usePages<T>(props: CollaborationProps, endpoint: string, allPages: boolean, keyOf: (item: T) => string | number) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const page = useRef(1);
  const failedReset = useRef(true);
  const data = useRef<T[]>([]);
  const sourceKey = JSON.stringify([props.owner, props.repoName, props.token, endpoint]);
  const activeKey = useRef(sourceKey);
  // Check the rendered source as well as the effect generation, including the interval before cleanup.
  activeKey.current = sourceKey;
  const [resultKey, setResultKey] = useState(sourceKey);

  async function load(reset: boolean) {
    if (!reset && busy.current) return;
    const version = reset ? ++generation.current : generation.current;
    const valid = () => version === generation.current && sourceKey === activeKey.current;
    busy.current = true;
    failedReset.current = reset;
    if (reset) {
      page.current = 1;
      data.current = [];
      setItems([]);
      setHasMore(false);
      setResultKey(sourceKey);
    }
    setLoading(true);
    setError("");
    try {
      let more = true;
      do {
        const separator = endpoint.includes("?") ? "&" : "?";
        const response: unknown = await repo.collaborationGet(props.owner, props.repoName,
          `${endpoint}${separator}per_page=${PAGE_SIZE}&page=${page.current}`, props.token);
        if (!valid()) return;
        if (!Array.isArray(response)) throw new Error(t("GitHub 回傳的列表格式不正確", "GitHub 返回的列表格式不正确", "GitHub returned an invalid list format"));
        const batch = response as T[];
        const unique = new Map(data.current.map(item => [keyOf(item), item]));
        batch.forEach(item => unique.set(keyOf(item), item));
        data.current = Array.from(unique.values());
        setItems(data.current);
        page.current += 1;
        more = batch.length === PAGE_SIZE;
        setHasMore(more);
      } while (allPages && more);
    } catch (error) {
      if (valid()) setError(message(error));
    } finally {
      if (valid()) {
        busy.current = false;
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    void load(true);
    return () => { generation.current += 1; busy.current = false; };
  }, [sourceKey]);
  const sameSource = resultKey === sourceKey;
  return {
    items: sameSource ? items : [], loading: !sameSource || loading,
    error: sameSource ? error : "", hasMore: sameSource && hasMore,
    reload: () => load(true), more: () => load(false),
    retry: () => load(failedReset.current),
  };
}

function ErrorRow({ error, retry }: { error: string; retry: () => void }) {
  return <VStack alignment="leading" spacing={10} listRowBackground={<ThemeCardBackground />}>
    <Text foregroundStyle="systemRed" font={13}>{error}</Text>
    <Button title={t("重試", "重试", "Retry")} systemImage="arrow.clockwise" action={retry} />
  </VStack>;
}

export function BranchListPage(props: CollaborationProps) {
  const dismiss = Navigation.useDismiss();
  const { accent, muted, selected } = useThemePalette();
  const [query, setQuery] = useState("");
  // 3.1：預設分支用本地 state，設好後這一頁立刻換標籤，不用等外層重畫。
  const [defaultName, setDefaultName] = useState(props.defaultBranch || "");
  const [busyBranch, setBusyBranch] = useState("");
  const [openSwipe, setOpenSwipe] = useState("");
  const state = usePages<Branch>(props, "branches", true, item => item.name);
  const normalized = query.trim().toLowerCase();
  const branches = state.items.filter(branch => branch.name.toLowerCase().includes(normalized));

  // 3.1：左滑「設為預設」。PATCH 倉庫的 default_branch，只有擁有者有權限；
  // 先確認一次，成功後本地標籤立刻換、並通知外層。
  async function makeDefault(name: string) {
    if (name === defaultName) return;
    const ok = await Dialog.confirm({
      title: t("設為預設分支", "设为默认分支", "Set as default branch"),
      message: t(`確定要把「${name}」設成這個倉庫的預設分支嗎？`, `确定要把「${name}」设成这个仓库的默认分支吗？`, `Set “${name}” as the default branch of this repository?`),
    });
    if (!ok) return;
    setBusyBranch(name);
    try {
      await repo.setDefaultBranchForToken(props.token, props.owner, props.repoName, name);
      setDefaultName(name);
      props.onDefaultChanged?.(name);
    } catch (e: any) {
      await Dialog.alert({ title: t("設定失敗", "设置失败", "Failed"), message: message(e) });
    }
    setBusyBranch("");
  }

  return <NavigationStack>
    <List listStyle="insetGroup" listSectionSpacing={8} scrollContentBackground="hidden"
      background={<GlassBackground />} tint={accent} navigationTitle={t("選擇分支", "选择分支", "Choose branch")} navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title={t("關閉", "关闭", "Close")} systemImage="xmark" action={() => dismiss()} /> }}>
      <Section>
        <Text font={12} foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{props.owner}/{props.repoName}</Text>
        <TextField title={t("搜尋分支", "搜索分支", "Search branches")} prompt={t("分支名稱", "分支名称", "Branch name")} value={query} onChanged={setQuery}
          textInputAutocapitalization="never" autocorrectionDisabled listRowBackground={<ThemeCardBackground />} />
      </Section>
      <Section>
        {state.loading ? <LoadingRow /> : null}
        {state.error ? <ErrorRow error={state.error} retry={state.retry} /> : null}
        {!state.loading && !state.error && branches.length === 0 ?
          <Text foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{normalized ? t("沒有符合的分支", "没有符合的分支", "No matching branches") : t("尚無分支", "暂无分支", "No branches")}</Text> : null}
        {branches.map(branch => <HStack key={branch.name} alignment="center"
          listRowBackground={<SwipeRowBackground isPresented={openSwipe === branch.name} />}
          trailingSwipeActions={{
            allowsFullSwipe: false,
            onPresentationChanged: (presented: boolean) => setOpenSwipe(current => presented ? branch.name : current === branch.name ? "" : current),
            actions: [
              <Button tint="#EF963C" disabled={busyBranch !== "" || branch.name === defaultName}
                action={async () => { await makeDefault(branch.name); }}>
                <Label title={branch.name === defaultName ? t("已是預設", "已是默认", "Default") : t("設為預設", "设为默认", "Set default")} systemImage="star" />
              </Button>,
            ],
          }}
        >
          <Button buttonStyle="borderless" frame={{ maxWidth: "infinity", alignment: "leading" }} action={() => dismiss(branch.name)}>
            <HStack spacing={10} padding={{ vertical: 4 }}>
              <Image systemName="arrow.triangle.branch" foregroundStyle={accent} />
              <VStack alignment="leading" spacing={6}>
                <Text font={14} fontWeight="semibold" foregroundStyle="label">{branch.name}</Text>
                <HStack spacing={6}>
                  {branch.name === props.currentBranch ? <Text font={10} fontWeight="medium" foregroundStyle={accent} padding={{ horizontal: 8, vertical: 3 }} background={{ style: selected, shape: "capsule" }}>{t("目前", "当前", "Current")}</Text> : null}
                  {branch.name === defaultName ? <Text font={10} fontWeight="medium" foregroundStyle={accent} padding={{ horizontal: 8, vertical: 3 }} background={{ style: selected, shape: "capsule" }}>{t("預設", "默认", "Default")}</Text> : null}
                  {branch.protected ? <Text font={10} foregroundStyle={muted}>{t("受保護", "受保护", "Protected")}</Text> : null}
                </HStack>
              </VStack>
              <Spacer />
              {busyBranch === branch.name ? <ProgressView /> : branch.name === props.currentBranch ? <Image systemName="checkmark" foregroundStyle={accent} /> : null}
            </HStack>
          </Button>
        </HStack>)}
      </Section>
    </List>
  </NavigationStack>;
}

const filterOptions = () => [{ id: "open", title: t("開啟中", "开启中", "Open") }, { id: "closed", title: t("已關閉", "已关闭", "Closed") }, { id: "all", title: t("全部", "全部", "All") }];
function statusText(pr: PullRequest) {
  if (pr.merged || pr.merged_at) return t("已合併", "已合并", "Merged");
  if (pr.state === "closed") return t("已關閉", "已关闭", "Closed");
  return pr.draft ? t("草稿", "草稿", "Draft") : t("開啟中", "开启中", "Open");
}

export function PullRequestsPage(props: CollaborationProps) {
  const dismiss = Navigation.useDismiss();
  const { accent, muted, selected } = useThemePalette();
  const [filter, setFilter] = useState("open");
  const state = usePages<PullRequest>(props, `pulls?state=${filter}&sort=updated&direction=desc`, false, item => item.id);
  return <NavigationStack>
    <List listStyle="insetGroup" listSectionSpacing={8} scrollContentBackground="hidden" background={<GlassBackground />}
      tint={accent} navigationTitle={t("拉取請求", "拉取请求", "Pull Requests")} navigationBarTitleDisplayMode="inline"
      toolbar={{ cancellationAction: <Button title={t("關閉", "关闭", "Close")} systemImage="xmark" action={() => dismiss()} /> }}>
      <Section>
        <Text font={12} foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{props.owner}/{props.repoName}</Text>
        <HStack spacing={6} padding={{ vertical: 3 }} listRowBackground={<ThemeCardBackground />}>
          {filterOptions().map(option => <Button key={option.id} buttonStyle="plain" action={() => setFilter(option.id)}>
            <Text font={12} fontWeight={option.id === filter ? "semibold" : "regular"} lineLimit={1}
              foregroundStyle={option.id === filter ? accent : muted}
              padding={{ horizontal: 14, vertical: 8 }}
              background={{ style: option.id === filter ? selected : "clear", shape: "capsule" }}>{option.title}</Text>
          </Button>)}
        </HStack>
      </Section>
      <Section>
        {state.items.map(pr => <NavigationLink key={pr.id} destination={<PullRequestDetail {...props} number={pr.number} />}
          listRowBackground={<ThemeCardBackground />}>
          <VStack alignment="leading" spacing={6} padding={{ vertical: 4 }}>
            <Text font={14} fontWeight="semibold">{pr.title}</Text>
            <Text font={11} foregroundStyle={muted}>{`#${pr.number} · ${pr.user?.login || t("未知作者", "未知作者", "Unknown author")} · ${statusText(pr)}`}</Text>
            <Text font={11} foregroundStyle={muted}>{`${pr.head?.label || pr.head?.ref || "—"} → ${pr.base?.label || pr.base?.ref || "—"}`}</Text>
            <Text font={10} foregroundStyle={muted}>{t(`更新 ${dateText(pr.updated_at)}`, `更新 ${dateText(pr.updated_at)}`, `Updated ${dateText(pr.updated_at)}`)}</Text>
          </VStack>
        </NavigationLink>)}
        {state.loading ? <LoadingRow /> : null}
        {state.error ? <ErrorRow error={state.error} retry={state.retry} /> : null}
        {!state.loading && !state.error && state.items.length === 0 ?
          <Text foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{t("沒有符合的 Pull Request", "没有符合的 Pull Request", "No matching pull requests")}</Text> : null}
        {!state.loading && !state.error && state.hasMore ?
          <Button title={t("載入更多", "载入更多", "Load more")} systemImage="arrow.down" action={state.more} listRowBackground={<ThemeCardBackground />} /> : null}
      </Section>
    </List>
  </NavigationStack>;
}

function PullRequestDetail(props: CollaborationProps & { number: number }) {
  const { accent, muted, selected } = useThemePalette();
  const [detail, setDetail] = useState<PullRequest | null>(null);
  const [files, setFiles] = useState<PullFile[]>([]);
  const [comments, setComments] = useState<PullComment[]>([]);
  const [comment, setComment] = useState("");
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const refresh = () => setAttempt(value => value + 1);
  useEffect(() => {
    const version = ++generation.current;
    setLoading(true); setError(""); setDetail(null); setFiles([]); setComments([]);
    void (async () => {
      try {
        const [value, fileValue, commentValue] = await Promise.all([
          repo.collaborationGet(props.owner, props.repoName, `pulls/${props.number}`, props.token),
          repo.collaborationGet(props.owner, props.repoName, `pulls/${props.number}/files?per_page=100`, props.token),
          repo.collaborationGet(props.owner, props.repoName, `issues/${props.number}/comments?per_page=100`, props.token),
        ]);
        if (!value || typeof value !== "object" || !value.number) throw new Error(t("GitHub 回傳的 PR 格式不正確", "GitHub 返回的 PR 格式不正确", "GitHub returned an invalid pull request format"));
        if (version === generation.current) {
          setDetail(value as PullRequest);
          setFiles(Array.isArray(fileValue) ? fileValue as PullFile[] : []);
          setComments(Array.isArray(commentValue) ? commentValue as PullComment[] : []);
        }
      } catch (error) {
        if (version === generation.current) setError(message(error));
      } finally {
        if (version === generation.current) setLoading(false);
      }
    })();
    return () => { generation.current += 1; };
  }, [props.owner, props.repoName, props.token, props.number, attempt]);
  async function mutate(suffix: string, method: string, body: any, confirmText: string) {
    if (!(await Dialog.confirm(confirmText))) return;
    try {
      await repo.collaborationRequest(props.owner, props.repoName, suffix, props.token, method, body);
      refresh();
    } catch (error) { await Dialog.alert(message(error)); }
  }
  async function addComment() {
    const body = comment.trim(); if (!body) return;
    try { await repo.collaborationRequest(props.owner, props.repoName, `issues/${props.number}/comments`, props.token, "POST", { body }); setComment(""); refresh(); }
    catch (error) { await Dialog.alert(message(error)); }
  }
  async function submitReview(event: string) {
    const body = review.trim();
    if (event === "COMMENT" && !body) return;
    try { await repo.collaborationRequest(props.owner, props.repoName, `pulls/${props.number}/reviews`, props.token, "POST", { body, event }); setReview(""); refresh(); }
    catch (error) { await Dialog.alert(message(error)); }
  }
  return <List listStyle="insetGroup" listSectionSpacing={8} scrollContentBackground="hidden" background={<GlassBackground />}
    tint={accent} navigationTitle={t(`PR #${props.number}`, `PR #${props.number}`, `PR #${props.number}`)} navigationBarTitleDisplayMode="inline">
    {loading ? <Section><LoadingRow /></Section> : null}
    {error ? <Section><ErrorRow error={error} retry={refresh} /></Section> : null}
    {detail ? <>
      <Section title={t("拉取請求", "拉取请求", "Pull Request")}>
        <VStack alignment="leading" spacing={10} listRowBackground={<ThemeCardBackground />}>
          <Text font={18} fontWeight="semibold">{detail.title}</Text>
          <Text foregroundStyle={accent}>{statusText(detail)}</Text>
          <Text font={13} foregroundStyle={muted}>{t(`作者：${detail.user?.login || t("未知作者", "未知作者", "Unknown author")}`, `作者：${detail.user?.login || t("未知作者", "未知作者", "Unknown author")}`, `Author: ${detail.user?.login || t("未知作者", "未知作者", "Unknown author")}`)}</Text>
          <Text font={12} monospaced>{`${detail.head?.label || detail.head?.ref || "—"} → ${detail.base?.label || detail.base?.ref || "—"}`}</Text>
          {props.token ? <HStack spacing={8}>
            {detail.state === "open" ? <Button title={t("關閉", "关闭", "Close")} systemImage="xmark.circle" action={() => mutate(`pulls/${props.number}`, "PATCH", { state: "closed" }, t("確定要關閉這個 PR 嗎？", "确定要关闭这个 PR 吗？", "Close this pull request?"))} /> : <Button title={t("重新開啟", "重新开启", "Reopen")} systemImage="arrow.uturn.left" action={() => mutate(`pulls/${props.number}`, "PATCH", { state: "open" }, t("確定要重新開啟這個 PR 嗎？", "确定要重新开启这个 PR 吗？", "Reopen this pull request?"))} />}
            {detail.state === "open" && !detail.draft ? <Button title={t("合併", "合并", "Merge")} systemImage="arrow.triangle.merge" action={() => mutate(`pulls/${props.number}/merge`, "PUT", {}, t("確定要合併這個 PR 嗎？", "确定要合并这个 PR 吗？", "Merge this pull request?"))} /> : null}
          </HStack> : <Text font={12} foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{t("登入後才能處理 Pull Request", "登录后才能处理 Pull Request", "Sign in to manage this pull request")}</Text>}
        </VStack>
      </Section>
      <Section title={t("描述", "描述", "Description")}><Text font={14} textSelection listRowBackground={<ThemeCardBackground />}>{detail.body?.trim() || t("未提供描述", "未提供描述", "No description provided")}</Text></Section>
      <Section title={t("留言", "留言", "Comments")}>
        {comments.map(item => <VStack key={item.id} alignment="leading" spacing={4} listRowBackground={<ThemeCardBackground />}><Text font={12} fontWeight="semibold">{item.user?.login || t("未知作者", "未知作者", "Unknown author")}</Text><Text font={13} textSelection>{item.body || ""}</Text><Text font={10} foregroundStyle={muted}>{dateText(item.created_at)}</Text></VStack>)}
        {props.token ? <TextField title={t("新增留言", "新增留言", "Add comment")} prompt={t("輸入留言", "输入留言", "Write a comment")} axis="vertical" value={comment} onChanged={setComment} listRowBackground={<ThemeCardBackground />} /> : null}
        {props.token ? <Button title={t("送出留言", "发送留言", "Post comment")} systemImage="paperplane" action={addComment} listRowBackground={<ThemeCardBackground />} /> : null}
      </Section>
      {props.token ? <Section title={t("審查", "审查", "Review")}>
        <TextField title={t("審查意見", "审查意见", "Review comment")} prompt={t("輸入審查意見", "输入审查意见", "Write review comment")} axis="vertical" value={review} onChanged={setReview} listRowBackground={<ThemeCardBackground />} />
        <HStack spacing={8} padding={{ vertical: 4 }} listRowBackground={<ThemeCardBackground />}>
          <Button title={t("留言審查", "留言审查", "Comment")} action={() => submitReview("COMMENT")} />
          <Button title={t("核准", "批准", "Approve")} action={() => submitReview("APPROVE")} />
          <Button title={t("要求修改", "要求修改", "Request changes")} action={() => submitReview("REQUEST_CHANGES")} />
        </HStack>
      </Section> : null}
      <Section title={t("檔案差異", "文件差异", "Changed files")}>
        {files.map((file, index) => <VStack key={file.filename || index} alignment="leading" spacing={5} listRowBackground={<ThemeCardBackground />}>
          <Text font={13} fontWeight="semibold">{file.filename || "—"}</Text>
          <Text font={11} foregroundStyle={muted}>{`${file.status || "modified"} · +${file.additions || 0} / −${file.deletions || 0}`}</Text>
          {file.patch ? <VStack alignment="leading" spacing={0}>
            {file.patch.split("\n").map((line, lineIndex) => { const style = diffLineStyle(line); const mark = line.startsWith("+") ? "+" : line.startsWith("-") ? "−" : line.startsWith("@@") ? "@" : " "; return <HStack key={lineIndex} spacing={6} padding={{ horizontal: 6, vertical: 2 }} background={{ style: style.background, shape: { type: "rect", cornerRadius: 0 } }}>
              <Text font={9} monospaced foregroundStyle={style.foreground} frame={{ width: 10, alignment: "leading" }}>{mark}</Text>
              <Text font={10} monospaced foregroundStyle={style.foreground} textSelection frame={{ maxWidth: "infinity", alignment: "leading" }}>{line.slice(mark === "+" || mark === "−" || mark === "@" ? 1 : 0) || " "}</Text>
            </HStack>; })}
          </VStack> : <Text font={11} foregroundStyle={muted}>{t("GitHub 未提供此檔案的文字差異", "GitHub 未提供此文件的文本差异", "GitHub did not provide a text patch for this file")}</Text>}
        </VStack>)}
        {files.length === 0 ? <Text foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{t("沒有檔案差異", "没有文件差异", "No changed files")}</Text> : null}
      </Section>
      <Section title={t("時間", "时间", "Dates")}><VStack alignment="leading" spacing={8} listRowBackground={<ThemeCardBackground />}><Text font={12} foregroundStyle={muted}>{t(`建立：${dateText(detail.created_at)}`, `创建：${dateText(detail.created_at)}`, `Created: ${dateText(detail.created_at)}`)}</Text><Text font={12} foregroundStyle={muted}>{t(`更新：${dateText(detail.updated_at)}`, `更新：${dateText(detail.updated_at)}`, `Updated: ${dateText(detail.updated_at)}`)}</Text>{detail.closed_at ? <Text font={12} foregroundStyle={muted}>{t(`關閉：${dateText(detail.closed_at)}`, `关闭：${dateText(detail.closed_at)}`, `Closed: ${dateText(detail.closed_at)}`)}</Text> : null}{detail.merged_at ? <Text font={12} foregroundStyle={muted}>{t(`合併：${dateText(detail.merged_at)}`, `合并：${dateText(detail.merged_at)}`, `Merged: ${dateText(detail.merged_at)}`)}</Text> : null}</VStack></Section>
      <Section title={t("變更摘要", "变更摘要", "Change summary")}><Text font={13} foregroundStyle={muted} listRowBackground={<ThemeCardBackground />}>{t(`${detail.commits ?? "—"} 次提交 · ${detail.changed_files ?? "—"} 個檔案`, `${detail.commits ?? "—"} 次提交 · ${detail.changed_files ?? "—"} 个文件`, `${detail.commits ?? "—"} commits · ${detail.changed_files ?? "—"} files`)}{` · +${detail.additions ?? "—"} / −${detail.deletions ?? "—"}`}</Text><Link url={`https://github.com/${encodeURIComponent(props.owner)}/${encodeURIComponent(props.repoName)}/pull/${props.number}`} listRowBackground={<ThemeCardBackground />}><Text foregroundStyle={accent}>{t("在 GitHub 查看 ↗", "在 GitHub 查看 ↗", "View on GitHub ↗")}</Text></Link></Section>
    </> : null}
  </List>;
}
