import { fetch } from "scripting";

class API {
  private KEY = "setting";

  private base_url = "https://api.cloudflare.com";
  accountId = "";
  token = "";
  all = 100000; // 总量 (免费账号为 100,000)

  constructor() {
    Object.assign(this, Storage.get(this.KEY));
  }

  async save() {
    return Storage.set(this.KEY, {
      accountId: this.accountId,
      token: this.token,
    });
  }

  async getUsage() {
    // return { all: 100, pages: 15, workers: 75 };

    const now = new Date();
    // End Time
    const endDate = now.toISOString();
    //  Start Time
    now.setUTCHours(0, 0, 0, 0);
    const startDate = now.toISOString();

    const { data } = await fetch(`${this.base_url}/client/v4/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        query: `query getBillingMetrics($accountId: string!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject) {
                    viewer {
                        accounts(filter: {accountTag: $accountId}) {
                            pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: $filter) {
                                sum {
                                    requests
                                }
                            }
                            workersInvocationsAdaptive(limit: 10000, filter: $filter) {
                                sum {
                                    requests
                                }
                            }
                        }
                    }
                }`,
        variables: {
          accountId: this.accountId,
          filter: { datetime_geq: startDate, datetime_leq: endDate },
        },
      }),
    }).then((r) => r.json());

    const { pagesFunctionsInvocationsAdaptiveGroups, workersInvocationsAdaptive } =
      data?.viewer?.accounts?.[0];

    // Add Pages
    const pagesArray = pagesFunctionsInvocationsAdaptiveGroups;
    const pages = pagesArray?.reduce(
      (a: number, b: { sum: { requests: number } }) => a + b?.sum?.requests,
      0,
    );
    // Add Workers
    const workersArray = workersInvocationsAdaptive;
    const workers = workersArray?.reduce(
      (a: number, b: { sum: { requests: number } }) => a + b?.sum?.requests,
      0,
    );

    return { pages: pages || 0, workers: workers || 0 };
  }
}

export const api = new API();
