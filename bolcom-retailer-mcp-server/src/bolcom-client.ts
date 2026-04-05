interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class BolcomClient {
  private clientId: string;
  private clientSecret: string;
  private cachedToken: CachedToken | null = null;
  private baseUrl = "https://api.bol.com/retailer";
  private tokenUrl = "https://login.bol.com/token?grant_type=client_credentials";
  private apiVersion = "v10";

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.token;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(this.tokenUrl, { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" } });
    if (!response.ok) throw new Error(`Failed to get access token: ${response.status}`);
    const data = (await response.json()) as TokenResponse;
    this.cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 10) * 1000 };
    return data.access_token;
  }

  private async makeRequest<T>(endpoint: string, method = "GET"): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}${endpoint}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: `application/vnd.retailer.${this.apiVersion}+json` } });
    if (response.status === 429) { const ra = response.headers.get("retry-after"); await new Promise(r => setTimeout(r, ra ? parseInt(ra) * 1000 : 5000)); return this.makeRequest<T>(endpoint, method); }
    if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  }

  async getOrders(page?: number) { const p = new URLSearchParams(); if (page !== undefined) p.append("page", page.toString()); const qs = p.toString(); return this.makeRequest(qs ? `/orders?${qs}` : "/orders"); }
  async getShipments(page?: number) { const p = new URLSearchParams(); if (page !== undefined) p.append("page", page.toString()); const qs = p.toString(); return this.makeRequest(qs ? `/shipments?${qs}` : "/shipments"); }
  async getReturns(page?: number, handled?: boolean) { const p = new URLSearchParams(); if (page !== undefined) p.append("page", page.toString()); if (handled !== undefined) p.append("handled", handled.toString()); const qs = p.toString(); return this.makeRequest(qs ? `/returns?${qs}` : "/returns"); }
  async getOffers(page?: number) { const p = new URLSearchParams(); if (page !== undefined) p.append("page", page.toString()); const qs = p.toString(); return this.makeRequest(qs ? `/offers?${qs}` : "/offers"); }
  async getPerformanceIndicators(name: string, year: number, week: number) { const p = new URLSearchParams(); p.append("name", name); p.append("year", year.toString()); p.append("week", week.toString()); return this.makeRequest(`/performance/indicators?${p.toString()}`); }
  async getReviews(page?: number) { const p = new URLSearchParams(); if (page !== undefined) p.append("page", page.toString()); const qs = p.toString(); return this.makeRequest(qs ? `/reviews?${qs}` : "/reviews"); }
}
