import { t } from "./i18n";
import { Image } from "scripting";
// 小鎖放在清單尾端，公開項目不預留額外空間。
export function PrivateMarker({ isPrivate }: { isPrivate: boolean }) {
  if (!isPrivate) return null;
  return <Image systemName="lock.fill" font={9} foregroundStyle="secondaryLabel" frame={{ width: 10 }} opacity={isPrivate ? 1 : 0} accessibilityHidden={!isPrivate} accessibilityLabel={t("私人","私有","Private")} />;
}
