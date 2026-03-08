import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

export interface BinanceConfig {
  apiKey: string;
  secretKey: string;
  testnet?: boolean;
  baseURL?: string;
}

export interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT_LIMIT';
  quantity?: number;
  quoteOrderQty?: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  newClientOrderId?: string;
}

export interface AccountInfo {
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
  totalWalletBalance: string;
  totalUnrealizedPnl: string;
  totalMarginBalance: string;
  totalInitialMargin: string;
  totalMaintMargin: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  totalCrossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
}

export interface PositionInfo {
  symbol: string;
  initialMargin: string;
  maintMargin: string;
  unrealizedPnl: string;
  positionInitialMargin: string;
  openOrderInitialMargin: string;
  leverage: string;
  isolated: boolean;
  entryPrice: string;
  maxNotional: string;
  bidNotional: string;
  askNotional: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
}

export class BinanceService {
  private client: AxiosInstance;
  private config: BinanceConfig;

  constructor(config: BinanceConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseURL || (config.testnet 
        ? 'https://testnet.binancefuture.com' 
        : 'https://fapi.binance.com'
      ),
      timeout: 10000,
    });

    // Add request interceptor for signed/private endpoints.
    this.client.interceptors.request.use((config) => {
      if (this.requiresAuth(config.url || '')) {
        const timestamp = Date.now();
        const params = {
          ...(config.params || {}),
          timestamp,
        } as Record<string, string | number | boolean>;

        const queryString = new URLSearchParams(
          Object.entries(params).map(([key, value]) => [key, String(value)])
        ).toString();
        const signature = this.generateSignature(queryString);
        
        config.headers = {
          ...(config.headers as any),
          'X-MBX-APIKEY': this.config.apiKey,
          'Content-Type': 'application/json',
        } as any;
        
        config.params = {
          ...params,
          signature,
        };
      }
      return config;
    });
  }

  private requiresAuth(url: string): boolean {
    // Public market endpoints must remain unsigned.
    const publicPaths = ['/fapi/v1/ping', '/fapi/v1/time', '/fapi/v1/ticker', '/fapi/v1/klines'];
    if (publicPaths.some((path) => url.startsWith(path))) return false;
    return url.startsWith('/fapi/');
  }

  private generateSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(queryString)
      .digest('hex');
  }

  // Get account information
  async getAccountInfo(): Promise<AccountInfo> {
    try {
      const response = await this.client.get('/fapi/v2/account');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching account info:', error);
      const detail = error?.response?.data?.msg || error?.message || 'Failed to fetch account information';
      throw new Error(detail);
    }
  }

  // Get positions
  async getPositions(symbol?: string): Promise<PositionInfo[]> {
    try {
      const params = symbol ? { symbol } : {};
      const response = await this.client.get('/fapi/v2/positionRisk', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }

  // Place an order
  async placeOrder(params: OrderParams): Promise<any> {
    try {
      const response = await this.client.post('/fapi/v1/order', params);
      return response.data;
    } catch (error) {
      console.error('Error placing order:', error);
      throw new Error('Failed to place order');
    }
  }

  // Get order status
  async getOrderStatus(symbol: string, orderId: number): Promise<any> {
    try {
      const response = await this.client.get('/fapi/v1/order', {
        params: { symbol, orderId }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching order status:', error);
      throw new Error('Failed to fetch order status');
    }
  }

  // Cancel an order
  async cancelOrder(symbol: string, orderId: number): Promise<any> {
    try {
      const response = await this.client.delete('/fapi/v1/order', {
        params: { symbol, orderId }
      });
      return response.data;
    } catch (error) {
      console.error('Error canceling order:', error);
      throw new Error('Failed to cancel order');
    }
  }

  // Get 24hr ticker price change statistics
  async get24hrTicker(symbol?: string): Promise<any> {
    try {
      const params = symbol ? { symbol } : {};
      const response = await this.client.get('/fapi/v1/ticker/24hr', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching 24hr ticker:', error);
      throw new Error('Failed to fetch 24hr ticker');
    }
  }

  // Get current price
  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const response = await this.client.get('/fapi/v1/ticker/price', {
        params: { symbol }
      });
      return parseFloat(response.data.price);
    } catch (error) {
      console.error('Error fetching current price:', error);
      throw new Error('Failed to fetch current price');
    }
  }

  // Get kline/candlestick data
  async getKlines(symbol: string, interval: string, limit: number = 500): Promise<any[]> {
    try {
      const response = await this.client.get('/fapi/v1/klines', {
        params: { symbol, interval, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching klines:', error);
      throw new Error('Failed to fetch klines');
    }
  }

  // Set leverage
  async setLeverage(symbol: string, leverage: number): Promise<any> {
    try {
      const response = await this.client.post('/fapi/v1/leverage', {
        symbol,
        leverage
      });
      return response.data;
    } catch (error) {
      console.error('Error setting leverage:', error);
      throw new Error('Failed to set leverage');
    }
  }

  // Get trading fees
  async getTradingFees(symbol?: string): Promise<any> {
    try {
      const params = symbol ? { symbol } : {};
      const response = await this.client.get('/fapi/v1/commissionRate', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching trading fees:', error);
      throw new Error('Failed to fetch trading fees');
    }
  }

  // Test connectivity
  async testConnectivity(): Promise<boolean> {
    try {
      await this.client.get('/fapi/v1/ping');
      return true;
    } catch (error) {
      console.error('Binance connectivity test failed:', error);
      return false;
    }
  }

  // Get server time
  async getServerTime(): Promise<number> {
    try {
      const response = await this.client.get('/fapi/v1/time');
      return response.data.serverTime;
    } catch (error) {
      console.error('Error fetching server time:', error);
      throw new Error('Failed to fetch server time');
    }
  }
}
