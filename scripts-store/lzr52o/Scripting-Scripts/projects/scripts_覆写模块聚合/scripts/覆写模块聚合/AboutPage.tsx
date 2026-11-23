import {
  Button, HStack, Image, Link, List,
  NavigationStack, Path, Script, Section, Spacer,
  Text, VStack, ZStack, useMemo,
} from "scripting"
import type { CatalogueItem } from "./core"
import type { Client } from "./clients"
import { CLIENT_TINT } from "./client-colors"
import { CLIENTS, clientOf } from "./clients"
import {
  CLIENT_SPECTRUM, INK,
  MUTED, UI, ClientIcon, GitHubIcon, SoftChip,
  failure, formatCount,
} from "./ui"

const APP_NAME = "覆写模块聚合"

const AUTHOR_NAME = "kmorets"

const GITHUB_URL = "https://github.com/xcheam/scripting"

const TELEGRAM_URL = "https://t.me/kmorets"

// Public entry row: brand image + handle, opens the system browser.
function ContactRow({ image, title, detail, url }: {
  image: string | ReturnType<typeof GitHubIcon>; title: string; detail: string; url: string
}) {
  return <Link url={url}>
    <HStack spacing={12} padding={{ vertical: UI.tight }} accessibilityElement="combine">
      {typeof image === "string"
        ? <Image filePath={Path.join(Script.directory, image)} frame={{ width: UI.clientIcon, height: UI.clientIcon }}
            resizable clipShape="circle" accessibilityHidden />
        : image}
      <VStack alignment="leading" spacing={UI.tight}>
        <Text font="body">{title}</Text>
        <Text font="footnote" foregroundStyle={MUTED}>{detail}</Text>
      </VStack>
      <Spacer minLength={UI.tight} />
      <Image systemName="arrow.up.right" font="footnote" foregroundStyle={MUTED} accessibilityHidden />
    </HStack>
  </Link>
}

export function AboutPage({ all, githubConfigured, busy, onGitHub, onClose }: {
  all: CatalogueItem[]; githubConfigured: boolean; busy: boolean
  onGitHub: () => Promise<void>; onClose: () => void
}) {
  const { version, icon } = Script.metadata
  const counts = useMemo(() => {
    const next: Record<Client, number> = { surge: 0, loon: 0, egern: 0, stash: 0, shadowrocket: 0 }
    for (const item of all) next[clientOf(item)]++
    return next
  }, [all])
  return <NavigationStack>
    <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} background="systemGroupedBackground">
      <List listStyle="insetGroup" foregroundStyle={INK} frame={{ maxWidth: UI.detailWidth }}
        navigationTitle="关于" navigationBarTitleDisplayMode="inline"
        toolbar={{ cancellationAction: <Button title="关闭" action={onClose} /> }}>
        <Section title="脚本">
          <HStack spacing={14} padding={{ vertical: 4 }} accessibilityElement="combine">
            <ZStack frame={{ width: 56, height: 56 }}
              background={{ style: CLIENT_SPECTRUM, shape: { type: "rect", cornerRadius: 16 } }}
              shadow={{ color: "rgba(2,27,121,0.22)", radius: 8, x: 0, y: 4 }}>
              <Image systemName={icon} font="title" foregroundStyle="white" accessibilityHidden />
            </ZStack>
            <VStack alignment="leading" spacing={UI.tight}>
              <Text font="headline">{APP_NAME}</Text>
              <Text font="footnote" foregroundStyle={MUTED}>{version ? `版本 ${version}` : "版本未标注"} · 作者 {AUTHOR_NAME}</Text>
            </VStack>
          </HStack>
        </Section>
        <Section title={`支持的软件 · ${formatCount(all.length)} 个${all.some(item => item.rule) ? "条目" : "模块"}`}>
          {CLIENTS.map(client => <HStack key={client.id} spacing={UI.gap} padding={{ vertical: UI.tight }} accessibilityElement="combine">
            <ClientIcon client={client.id} />
            <VStack alignment="leading" spacing={UI.tight}>
              <Text font="body">{client.name}</Text>
              <Text font="footnote" foregroundStyle={MUTED}>{client.extensions.map(ext => `.${ext}`).join(" · ")}</Text>
            </VStack>
            <Spacer minLength={UI.tight} />
            <SoftChip label={`${formatCount(counts[client.id])} 个`}
              ink={CLIENT_TINT[client.id].ink} fill={CLIENT_TINT[client.id].soft} />
          </HStack>)}
        </Section>
        <Section title="GitHub API">
          <Button buttonStyle="borderless" disabled={busy} action={() => void onGitHub().catch(failure)}
            accessibilityLabel={`GitHub Token，${githubConfigured ? "已配置" : "未配置"}`}>
            <HStack spacing={12} frame={{ minHeight: UI.tap, maxWidth: "infinity", alignment: "leading" }} contentShape="rect">
              <GitHubIcon />
              <VStack alignment="leading" spacing={UI.tight}>
                <Text font="body" foregroundStyle={INK}>GitHub Token</Text>
                <Text font="footnote" foregroundStyle={MUTED}>{githubConfigured ? "已配置 · 使用账号额度" : "未配置 · 使用匿名额度"}</Text>
              </VStack>
              <Spacer minLength={UI.gap} />
              <Image systemName="chevron.right" font="footnote" foregroundStyle={MUTED} accessibilityHidden />
            </HStack>
          </Button>
        </Section>
        <Section title="联系与源码">
          <ContactRow image={<GitHubIcon />} title="GitHub" detail="xcheam/scripting" url={GITHUB_URL} />
          <ContactRow image="image/telegram.jpg" title="Telegram" detail="t.me/kmorets" url={TELEGRAM_URL} />
          <Text font="footnote" foregroundStyle={MUTED} listRowSeparator="hidden">
            遇到模块解析问题，欢迎在 GitHub 提 Issue，或在 Telegram 找到我。
          </Text>
        </Section>
      </List>
    </VStack>
  </NavigationStack>
}
