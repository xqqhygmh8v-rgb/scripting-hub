import { Image, useState } from 'scripting'
export default function PackCover({ url }: { url?: string }) {
 const [failed, setFailed] = useState(false)
 const fallback = <Image systemName="square.stack.3d.up.fill" font={20} foregroundStyle="#5965DE" frame={{ width: 40, height: 40 }} background={{ style: '#EEF0FC', shape: 'circle' }}/>
 if (!url || failed) return fallback
 return <Image imageUrl={url} resizable aspectRatio={{ contentMode: 'fit' }} frame={{ width: 40, height: 40 }} placeholder={fallback} onError={() => setFailed(true)}/>
}
