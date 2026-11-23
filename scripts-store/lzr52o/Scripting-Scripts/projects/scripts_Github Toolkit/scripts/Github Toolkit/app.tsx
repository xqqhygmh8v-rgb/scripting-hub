// Shared GitHub Toolkit app shell.
//
// index.tsx (run as a script) and home_screen_default_ui.tsx (embedded in
// Scripting's Home tab) both render this component, so the two entry points
// can never drift apart again.
//
// Why this file exists: home_screen_default_ui.tsx used to render only a
// static logo + subtitle. The Home tab host embeds that file's default
// export directly — it never calls Navigation.present / Script.exit, and a
// static VStack has no buttons, lists or navigation to tap. That is exactly
// the black screen in the screenshot: the logo shows, but there is nothing
// operable. Rendering the full App here makes the Home tab show the same
// operable Repository / Gist / Actions interface as running the script.
//
// Embedded mode (`embedded: true`):
// - No Navigation.present / Script.exit is involved: the host already
//   displays this component, so there is nothing to present or exit.
// - The "退出 / 關閉" (X) button is hidden in every module (see the
//   `embedded` prop threaded through ActionView / Gist View / Repository
//   View). In the Home tab there is no presented sheet to close, and
//   Script.exit() would kill the tool instead of returning to Scripting —
//   the Scripting tab bar underneath is the way back.
import { RoundedRectangle, Rectangle, Button, HStack, Image, Text, Spacer, Navigation, NavigationStack, Script, VStack, useState } from "scripting";
import { ActionView, LoginPage } from "./action";
import { View as GistView } from "./gist/page/list";
import { View as RepoListView } from "./repo/page/repoList";
import { GlassBackground } from "./components/glass";
import { useThemePalette } from "./components/themePalette";
import { t } from "./components/i18n";

type Module = "actions" | "gist" | "repo";
const LAST_MODULE_KEY = "newui_last_module";
const ACCENT = { light: "#087E8B", dark: "#67E8D9" } as const;
const MUTED = { light: "#52677A", dark: "#96AFC4" } as const;
const SURFACE = { light: "#FFFFFF", dark: "rgba(28, 28, 30, 0.62)" } as const;
const modules: { id: Module; title: string; icon: string; code: string }[] = [
  { id: "repo", title: t("倉庫", "仓库", "Repositories"), icon: "square.stack.3d.up", code: "01" },
  { id: "gist", title: t("程式片段", "代码片段", "Gists"), icon: "chevron.left.forwardslash.chevron.right", code: "02" },
  { id: "actions", title: t("工作流程", "工作流", "Actions"), icon: "waveform.path.ecg", code: "03" },
];

// Page background for the whole tool — see components/theme.ts. The root
// VStack only paints its own content area, so it also needs maxWidth /
// maxHeight "infinity" — otherwise the host's black background shows
// through around it (the screenshot's all-black page).

const titles: Record<Module, string> = {
  actions: t("工作流程 // 即時", "工作流 // 实时", "ACTIONS // LIVE"),
  gist: t("程式片段 // 收藏庫", "代码片段 // 收藏库", "GIST // VAULT"),
  repo: t("倉庫 // 核心", "仓库 // 核心", "REPOSITORY // CORE"),
};

export function GitHubToolkitApp({ embedded = false }: { embedded?: boolean } = {}) {
  // Restore the last-used module; Repository is the fallback for a first launch.
  const [selected, setSelected] = useState<Module>(() => {
    const stored = Storage.get<string>(LAST_MODULE_KEY);
    return stored === "repo" || stored === "gist" || stored === "actions" ? stored : "repo";
  });
  const { accent: ACCENT, muted: MUTED, card: SURFACE, selected: selectedSurface, border, glow } = useThemePalette();
  const dismiss = Navigation.useDismiss();
  const [hasAccount, setHasAccount] = useState(() => {
    try {
      const accounts = JSON.parse(Storage.get("github_toolkit_accounts") || "[]");
      return Array.isArray(accounts) && accounts.some((a: any) => a && a.username && a.token);
    } catch {
      return false;
    }
  });

  function handleFirstLogin(auth: { token: string; username: string }) {
    const accounts = [{ username: auth.username, token: auth.token }];
    Storage.set("github_toolkit_accounts", JSON.stringify(accounts));
    // Compatibility mirrors used by the existing three modules.
    Storage.set("github_username", auth.username);
    Storage.set("github_token", auth.token);
    Storage.set("repo_editor_username", auth.username);
    Storage.set("repo_editor_token", auth.token);
    Storage.set("gist", auth.token);
    setHasAccount(true);
  }

  async function exitScript() {
    // `dismiss` closes the presented sheet first; Script.exit then terminates
    // the running script instead of merely closing a nested module view.
    // Never called in embedded mode: the exit button is hidden there.
    await dismiss();
    Script.exit();
  }

  function selectModule(module: Module) {
    Storage.set(LAST_MODULE_KEY, module);
    setSelected(module);
  }

  // The title itself is the persistent module switcher requested by the user.
  // Each original module remains intact underneath it, including its own settings.
  const content = selected === "actions"
    ? <ActionView onExit={embedded ? undefined : exitScript} embedded={embedded} />
    : selected === "gist"
      ? <GistView onExit={embedded ? undefined : exitScript} embedded={embedded} />
      : <RepoListView onExit={embedded ? undefined : exitScript} embedded={embedded} />;

  if (!hasAccount) return <LoginPage onLogin={handleFirstLogin} />;

  return (
    <NavigationStack>
      <VStack
        spacing={0}
        tint={ACCENT}
        navigationTitle="GitHub Toolkit"
        navigationBarTitleDisplayMode="inline"
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        background={<GlassBackground />}
        // 頂欄（v2.0.0 修訂）：跟參考腳本 Github_Action-2 一樣，頂欄不
        // 設任何實色背景（原腳本全站零處 toolbarBackground）。頂欄用
        // 系統預設的半透明材質，透出後面的藍綠漸層，頂欄跟頁面之間就
        // 沒有一條橫向接縫、不會割裂。以前 v1.2.0 頂欄透出全黑，是因為
        // 當時頁面底還是實色、頂欄後面沒有東西可透；現在外殼跟各頁的
        // 底都是 ignoresSafeArea 的漸層，頂欄後面就是漸層本身。
        // ignoresSafeArea 只留 bottom，讓漸層延伸到底部 home indicator
        // 區；top 不能忽略：v1.2.1 用 vertical 時，清單內容從狀態列下
        // 方（頂欄後面）開始算，首頁第一列和標題選單會被頂欄吃掉。
        ignoresSafeArea={{ regions: "all", edges: "bottom" }}
      >
        <HStack spacing={10} padding={{ horizontal: 18, top: 5, bottom: 8 }}>
          {modules.map(module => <Button key={module.id} action={() => selectModule(module.id)} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
            <VStack foregroundStyle={selected === module.id ? ACCENT : MUTED} alignment="leading" spacing={8} padding={11} frame={{ maxWidth: "infinity", alignment: "leading" }}
              background={{ style: selected === module.id ? selectedSurface : SURFACE, shape: { type: "rect", cornerRadius: 17 } }}
              overlay={<RoundedRectangle cornerRadius={17} fill="clear" stroke={{ shapeStyle: selected === module.id ? ACCENT : border, strokeStyle: { lineWidth: selected === module.id ? 1 : 0.5 } }} padding={0.5} shadow={{ color: selected === module.id ? glow : "clear", radius: 3 }} allowsHitTesting={false} />}>
              <HStack><Image systemName={module.icon} font={19} /><Spacer /><Text font={9} monospaced foregroundStyle={MUTED}>{module.code}</Text></HStack>
              <Text font={12} fontWeight="semibold" lineLimit={1} minScaleFactor={0.8}>{module.title}</Text>
            </VStack>
          </Button>)}
        </HStack>
        {content}
      </VStack>
    </NavigationStack>
  );
}
