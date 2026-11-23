export interface ACGApiResponse {
  url: string;
  width: number;
  height: number;
  ratio: string;
}

export interface ACGConfig {
  /** 用户指定的图片 ID，字符串形式；空串或 "0" 表示随机 */
  imageId: string;
  /** 自动刷新间隔（秒），字符串形式 */
  refreshInterval: string;
  /** 是否启用自动刷新 */
  isAutoRefreshing: boolean;
  /** 界面主题：pink 少女粉（默认）、green 清新绿、blue 天空蓝、purple 梦幻紫、orange 活力橙、red 热情红、cyan 薄荷青、yellow 阳光黄、rainbow 彩虹流光（动态） */
  theme: string;
}
