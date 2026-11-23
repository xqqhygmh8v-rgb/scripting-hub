import { fetch, Path } from "scripting";

class GitHub {
  private KEY = "setting";

  TOKEN = "";
  OWNER = "";
  REPO = "";
  PATH = "";

  FILENAME = "";

  constructor() {
    Object.assign(this, Storage.get(this.KEY));
  }

  save() {
    const { KEY, FILENAME, ...data } = this;
    Storage.set(this.KEY, data);
  }

  getImgURL() {
    return ``;
  }

  async upload(data: Data, filename: string) {
    this.FILENAME = filename;
    const { status, content } = await this.UPLOAD(data);
    if (status) {
      const { sha } = await this.INFO();
      const { message, content } = await this.UPLOAD(data, sha);
      if (message) throw new Error(message);
      return content.download_url;
    } else {
      return content.download_url;
    }
  }

  private async INFO() {
    return await fetch(
      `https://api.github.com/repos/${this.OWNER}/${this.REPO}/contents/${Path.join(
        this.PATH,
        this.FILENAME
      )}`,
      {
        headers: { Authorization: `Bearer ${this.TOKEN}` },
      }
    ).then((r) => r.json());
  }

  private async UPLOAD(data: Data, sha?: string) {
    const body: any = {
      message: "upload: " + this.PATH,
      content: data.toBase64String(),
    };
    if (sha) body.sha = sha;

    return await fetch(
      `https://api.github.com/repos/${this.OWNER}/${this.REPO}/contents/${Path.join(
        this.PATH,
        this.FILENAME
      )}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.TOKEN}` },
        body: JSON.stringify(body),
      }
    ).then((r) => r.json());
  }
}

export const github = new GitHub();
