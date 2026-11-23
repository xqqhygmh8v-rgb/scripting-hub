import { Navigation, Tab, TabView, useCallback, useObservable } from "scripting"
import type { CatalogueItem, Source } from "./core"
import { useCatalogueStore } from "./useCatalogueStore"
import { ModuleBrowser } from "./ModuleBrowser"
import { Detail, RuleDetail } from "./ModuleDetail"
import { SourceManager, SourcesPage } from "./SourcesPage"
import { GitHubSettings } from "./GitHubSettings"
import { AboutPage } from "./AboutPage"
import { failure, stamp } from "./ui"

export function App() {
  const dismiss = Navigation.useDismiss()
  const selection = useObservable<number>(0)
  const {
    sources, cache, all, favoriteItems, favoriteKeys,
    githubConfigured, busy, progress, message, feedback,
    refresh, mark, saveMetadata, toggleSource, commitSources,
    authenticationChanged, isFavorite, getSources, canConfigureGitHub,
    loadText, githubAuth,
  } = useCatalogueStore(failure, stamp)

  async function manage() {
    const previous = getSources()
    const next = await Navigation.present<Source[] | undefined>({
      element: <SourceManager initial={previous} />,
      modalPresentationStyle: "fullScreen",
      swipeBackBehavior: "dismiss",
    })
    if (next) await commitSources(next, previous)
  }

  async function configureGitHub() {
    if (!canConfigureGitHub()) return
    await Navigation.present({
      element: <GitHubSettings auth={githubAuth} onChanged={authenticationChanged} />,
      modalPresentationStyle: "fullScreen",
      swipeBackBehavior: "dismiss",
    })
  }

  const refreshAction = useCallback(() => refresh(), [])
  const goSources = useCallback(() => selection.setValue(2), [])
  const goBrowse = useCallback(() => selection.setValue(0), [])
  const closeApp = useCallback(() => dismiss(), [])
  const detail = useCallback(async (item: CatalogueItem) => {
    await Navigation.present({
      element: item.rule
        ? <RuleDetail loadText={loadText} item={item}
            favorite={isFavorite(item)} onFavorite={mark} />
        : <Detail loadText={loadText} item={item}
            favorite={isFavorite(item)} onFavorite={mark} onMetadata={saveMetadata} />,
      modalPresentationStyle: "fullScreen",
      swipeBackBehavior: "dismiss",
    })
  }, [mark])

  return <TabView selection={selection}>
    <Tab title="模块" systemImage="square.stack" value={0}>
      <ModuleBrowser onlyFavorites={false}
        sources={sources} all={all} favoriteKeys={favoriteKeys}
        busy={busy} progress={progress} message={feedback}
        onDetail={detail} onFavorite={mark}
        onRefresh={refreshAction} onSources={goSources}
        onBrowse={goBrowse} onClose={closeApp} />
    </Tab>
    <Tab title="收藏"
      systemImage="star" value={1}>
      <ModuleBrowser onlyFavorites
        sources={sources} all={favoriteItems} favoriteKeys={favoriteKeys}
        busy={busy} progress={progress} message={message}
        onDetail={detail} onFavorite={mark}
        onRefresh={refreshAction} onSources={goSources}
        onBrowse={goBrowse} onClose={closeApp} />
    </Tab>
    <Tab title="来源"
      systemImage="tray.full" value={2}>
      <SourcesPage sources={sources} cache={cache} uniqueCount={all.length}
        busy={busy} progress={progress} message={feedback}
        onManage={manage} onRefresh={() => refresh()}
        onRetry={current => refresh(current, "重试")}
        onToggle={toggleSource} onClose={() => dismiss()} />
    </Tab>
    <Tab title="关于"
      systemImage="info.circle" value={3}>
      <AboutPage all={all}
        githubConfigured={githubConfigured} busy={busy}
        onGitHub={configureGitHub} onClose={() => dismiss()} />
    </Tab>
  </TabView>
}
