import { t } from "./i18n";
import { HStack, VStack, Image, Text, Spacer } from "scripting";
import { useThemePalette } from "./themePalette";
export function AccountHeader({ name, avatar, count, unit, expanded, publicCount, privateCount, loading, totalStars }: { name: string; avatar?: string; count?: number; unit: string; expanded: boolean; publicCount?: number; privateCount?: number; loading?: boolean; totalStars?: number }) {
 // 2.2.0：unit 改成語言中立的 key（"repo" / "gist"）。之前呼叫端傳的是已經 t() 過的
 // 字串，這行用 unit === "倉庫" 判斷：簡中拿到「仓库」、英文拿到「Repositories」，
 // 都不會成立，於是英文的單複數分支永遠是死碼，畫面就會出現 1 Repositories。
 const localizedUnit = unit === "repo"
  ? t("倉庫", "仓库", count === 1 ? "repository" : "repositories")
  : unit === "gist"
  ? t("Gist", "Gist", count === 1 ? "Gist" : "Gists")
  : unit;
 const { accent } = useThemePalette();
 return <HStack spacing={10} padding={{ vertical: 5 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
  {avatar ? <Image imageUrl={avatar} resizable frame={{ width: 32, height: 32 }} clipShape="circle" /> : <Image systemName="person.crop.circle.fill" font={30} frame={{ width: 32, height: 32 }} foregroundStyle="secondaryLabel" />}
  <VStack alignment="leading" spacing={4}>
   {/* 2.0.5：名字後面加總星星（該帳號已載入倉庫的 stargazers_count 加總，
       首頁算好傳進來；還沒載入時 totalStars 是 undefined，先不顯示）。
       2.0.6：星星改回原本的空心樣式（star＋secondaryLabel），
       不用填滿的金色 star.fill。
       2.0.8：跟倉庫列同一原因再改小，font 11→7，圖標比旁邊 12 的數字小。 */}
   <HStack spacing={4} alignment="center">
    <Text font={14} fontWeight="semibold" lineLimit={1} foregroundStyle={accent}>{name}</Text>
    {totalStars === undefined ? null : (
     <HStack spacing={2} alignment="center">
      <Image systemName="star" font={7} foregroundStyle="secondaryLabel" />
      <Text font={12} fontWeight="semibold" foregroundStyle="secondaryLabel">{String(totalStars)}</Text>
     </HStack>
    )}
   </HStack>
   <Text font={11} foregroundStyle="secondaryLabel" lineLimit={2}>{loading ? t("載入中…","载入中…","Loading…") : count === undefined ? "" : publicCount === undefined || privateCount === undefined ? t(`${count}個${localizedUnit}`, `${count}个${localizedUnit}`, `${count} ${localizedUnit}`) : t(`${count}個${localizedUnit} · ${publicCount}公開 · ${privateCount}私人`, `${count}个${localizedUnit} · ${publicCount}公开 · ${privateCount}私有`, `${count} ${localizedUnit} · ${publicCount} public · ${privateCount} private`)}</Text>
  </VStack>
  <Spacer />
  <Image systemName={expanded ? "chevron.up" : "chevron.down"} font={13} fontWeight="semibold" frame={{ width: 22, height: 22 }} foregroundStyle={accent} />
 </HStack>;
}
