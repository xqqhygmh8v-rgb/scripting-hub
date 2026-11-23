import { fetch } from "scripting";
import { RssFeedProps } from "./types";
import { htmlToMd } from "../html_md";
import { xml } from "../xml";

export async function loadRss(url: string): Promise<RssFeedProps> {
  const rssObj = await fetch(url, { timeout: 3000 })
    .then((res) =>
      res.ok ? res.text() : Promise.reject("Failed to load RSS feed")
    )
    .then((text) => xml.parse(text));

  if (rssObj.rss) {
    // RSS
    const { channel } = rssObj.rss;
    return {
      title: channel.title,
      link: extractDomain(channel.link),
      description: channel.description,
      items: await Promise.all(
        channel.item.map(async (v: any) => {
          return {
            title: v.title,
            link: v.link,
            pubDate: v.pubDate,
            content: htmlToMd(v.description ?? v["content:encoded"] ?? ""),
          };
        })
      ),
    };
  } else {
    // Atom
    const { feed } = rssObj;
    return {
      title: feed.title,
      link: extractDomain(url),
      items: await Promise.all(
        feed.entry.map(async (v: any) => {
          return {
            title: v.title,
            link: v.link || url,
            pubDate: v.updated,
            content: htmlToMd(v.content ?? ""),
          };
        })
      ),
    };
  }
}

function extractDomain(url: string): string {
  const parts = url.split("/");
  return parts[0] + "//" + parts[2];
}
