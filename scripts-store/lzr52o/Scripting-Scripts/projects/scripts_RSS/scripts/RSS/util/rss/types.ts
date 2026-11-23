export interface RssFeedProps {
  title: string;
  link: string;
  description?: string;
  items: RssItemProps[];
  // [key: string]: any;
}

export interface RssItemProps {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  // description?: string;
  // [key: string]: any;
}
