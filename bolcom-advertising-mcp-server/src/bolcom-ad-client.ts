interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface Campaign {
  campaignId: string;
  name: string;
  status: string;
  budget?: number;
  [key: string]: any;
}

interface PerformanceMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  [key: string]: any;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class BolcomAdClient {
  private clientId: string;
  private clientSecret: string;
  private tokenCache: TokenCache | null = null;
  private readonly tokenEndpoint = 'https://login.bol.com/token?grant_type=client_credentials';
  private readonly apiBase = 'https://api.bol.com/advertiser';

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as TokenResponse;

      // Cache token with 30-second buffer before expiry
      this.tokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000) - 30000
      };

      return data.access_token;
    } catch (error) {
      throw new Error(`Failed to obtain access token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async makeRequest(endpoint: string, method: string = 'GET'): Promise<any> {
    const token = await this.getAccessToken();
    const url = `${this.apiBase}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        console.warn(`Rate limited. Waiting ${waitTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.makeRequest(endpoint, method);
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorData}`);
      }

      return response.json();
    } catch (error) {
      throw new Error(`Failed to make request to ${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getCampaigns(): Promise<Campaign[]> {
    try {
      const data = await this.makeRequest('/campaigns');

      // Handle both array and object response formats
      if (Array.isArray(data)) {
        return data;
      }
      if (data.campaigns && Array.isArray(data.campaigns)) {
        return data.campaigns;
      }
      if (data.data && Array.isArray(data.data)) {
        return data.data;
      }

      return [];
    } catch (error) {
      throw new Error(`Failed to fetch campaigns: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAdPerformance(
    campaignId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<PerformanceMetrics> {
    try {
      let endpoint = '/performance';

      if (campaignId) {
        endpoint = `/campaigns/${campaignId}/performance`;
      }

      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);

      const fullEndpoint = queryParams.toString()
        ? `${endpoint}?${queryParams.toString()}`
        : endpoint;

      const data = await this.makeRequest(fullEndpoint);

      // Normalize response format
      if (data.performance) {
        return this.normalizePerformanceMetrics(data.performance);
      }
      if (data.data) {
        return this.normalizePerformanceMetrics(data.data);
      }

      return this.normalizePerformanceMetrics(data);
    } catch (error) {
      throw new Error(`Failed to fetch ad performance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAdSpend(startDate?: string, endDate?: string): Promise<any> {
    try {
      const campaigns = await this.getCampaigns();

      if (!campaigns || campaigns.length === 0) {
        return {
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          averageCPC: 0,
          averageCTR: 0,
          period: {
            startDate: startDate || 'N/A',
            endDate: endDate || 'N/A'
          }
        };
      }

      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;

      // Fetch performance metrics for each campaign
      for (const campaign of campaigns) {
        try {
          const performance = await this.getAdPerformance(campaign.campaignId, startDate, endDate);
          totalSpend += performance.spend || 0;
          totalImpressions += performance.impressions || 0;
          totalClicks += performance.clicks || 0;
        } catch (error) {
          console.warn(`Failed to fetch performance for campaign ${campaign.campaignId}:`, error);
          // Continue with next campaign
        }
      }

      const averageCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const averageCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      return {
        totalSpend,
        totalImpressions,
        totalClicks,
        averageCPC: parseFloat(averageCPC.toFixed(2)),
        averageCTR: parseFloat(averageCTR.toFixed(2)),
        period: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Today'
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch ad spend: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private normalizePerformanceMetrics(data: any): PerformanceMetrics {
    return {
      impressions: data.impressions || data.views || 0,
      clicks: data.clicks || 0,
      ctr: data.ctr || data.clickThroughRate || 0,
      cpc: data.cpc || data.costPerClick || 0,
      spend: data.spend || data.cost || 0,
      ...data
    };
  }
}
