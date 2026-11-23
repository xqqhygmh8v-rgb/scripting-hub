export async function summarize(data: object, size?: number, keepAlive = true): Promise<string> {
  const schema: JSONSchemaObject = {
    type: "object",
    description: "新闻总结",
    properties: {
      content: { type: "string", description: "新闻总结内容" },
    },
    required: true,
  }

  const prompt = `
总结新闻${size !== undefined ? `(控制字数在${size}字以内)` : ""}:
`

  const content = `
${prompt}
新闻内容(JSON 格式):
${JSON.stringify(data)}
`

  // --- Run --- //
  if (keepAlive) {
    const started = await BackgroundKeeper.keepAlive()
    try {
      const res = (await Assistant.requestStructuredData(content, schema)) as any
      return res.content
    } finally {
      if (started) await BackgroundKeeper.stopKeepAlive()
    }
  } else {
    const res = (await Assistant.requestStructuredData(content, schema)) as any
    return res.content
  }
}
