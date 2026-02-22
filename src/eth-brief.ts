const COINGECKO_SIMPLE_API = 'https://api.coingecko.com/api/v3/simple/price';
const COINBASE_API = 'https://api.exchange.coinbase.com/products';
const DEFILLAMA_API = 'https://api.llama.fi';
const STABLECOINS_API = 'https://stablecoins.llama.fi';

interface CoinbaseStats {
  open: string;
  last: string;
}

interface CoinGeckoSimplePrice {
  ethereum?: { usd: number; usd_market_cap: number };
  bitcoin?: { usd: number; usd_market_cap: number };
}

interface DefiLlamaChain {
  name: string;
  tvl: number;
}

interface DefiLlamaProtocol {
  name: string;
  change_1d?: number;
  chainTvls?: Record<string, number>;
  chains?: string[];
}

interface DefiLlamaDexProtocol {
  name: string;
  total24h?: number;
}

interface DefiLlamaDexOverview {
  total24h?: number;
  total7d?: number;
  protocols?: DefiLlamaDexProtocol[];
}

interface StablecoinAsset {
  symbol: string;
  chainCirculating?: Record<string, { current?: { peggedUSD?: number } }>;
}

interface StablecoinsResponse {
  peggedAssets: StablecoinAsset[];
}

function fmtUSD(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(2)}`;
}

function fmtChange(pct: number): string {
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

async function fetchPrices(): Promise<{ eth: { price: number; change24h: number; marketCap: number }; btc: { price: number; change24h: number; marketCap: number } } | null> {
  try {
    // Use Coinbase for price + 24h change (same source as /btc command — reliable on CF Workers)
    const [ethRes, btcRes] = await Promise.all([
      fetch(`${COINBASE_API}/ETH-USD/stats`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)' } }),
      fetch(`${COINBASE_API}/BTC-USD/stats`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HNTelegramBot/1.0)' } }),
    ]);
    if (!ethRes.ok || !btcRes.ok) return null;
    const [ethData, btcData] = await Promise.all([
      ethRes.json() as Promise<CoinbaseStats>,
      btcRes.json() as Promise<CoinbaseStats>,
    ]);
    const ethPrice = parseFloat(ethData.last);
    const ethOpen = parseFloat(ethData.open);
    const btcPrice = parseFloat(btcData.last);
    const btcOpen = parseFloat(btcData.open);

    // Try CoinGecko simple/price for market caps (optional — fail gracefully)
    let ethMarketCap = 0;
    let btcMarketCap = 0;
    try {
      const mcRes = await fetch(
        `${COINGECKO_SIMPLE_API}?ids=ethereum,bitcoin&vs_currencies=usd&include_market_cap=true`,
        { headers: { Accept: 'application/json' } }
      );
      if (mcRes.ok) {
        const mc = (await mcRes.json()) as CoinGeckoSimplePrice;
        ethMarketCap = mc.ethereum?.usd_market_cap ?? 0;
        btcMarketCap = mc.bitcoin?.usd_market_cap ?? 0;
      }
    } catch {
      // market cap is optional
    }

    return {
      eth: { price: ethPrice, change24h: ethOpen > 0 ? ((ethPrice - ethOpen) / ethOpen) * 100 : 0, marketCap: ethMarketCap },
      btc: { price: btcPrice, change24h: btcOpen > 0 ? ((btcPrice - btcOpen) / btcOpen) * 100 : 0, marketCap: btcMarketCap },
    };
  } catch {
    return null;
  }
}

async function fetchChainTvl(): Promise<{ ethereum: number; total: number } | null> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/v2/chains`);
    if (!res.ok) return null;
    const chains = (await res.json()) as DefiLlamaChain[];
    const ethereum = chains.find((c) => c.name === 'Ethereum')?.tvl ?? 0;
    const total = chains.reduce((sum, c) => sum + (c.tvl ?? 0), 0);
    return { ethereum, total };
  } catch {
    return null;
  }
}

async function fetchTopEthProtocols(): Promise<Array<{ name: string; tvl: number; change1d: number }>> {
  try {
    const res = await fetch(`${DEFILLAMA_API}/protocols`);
    if (!res.ok) return [];
    const protocols = (await res.json()) as DefiLlamaProtocol[];
    return protocols
      .filter((p) => p.chainTvls?.Ethereum !== undefined && p.chainTvls.Ethereum > 0)
      .map((p) => ({
        name: p.name,
        tvl: p.chainTvls!.Ethereum,
        change1d: p.change_1d ?? 0,
      }))
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchTopEthStablecoins(): Promise<Array<{ symbol: string; circulating: number }>> {
  try {
    const res = await fetch(`${STABLECOINS_API}/stablecoins?includePrices=true`);
    if (!res.ok) return [];
    const data = (await res.json()) as StablecoinsResponse;
    return (data.peggedAssets ?? [])
      .map((a) => ({
        symbol: a.symbol,
        circulating: a.chainCirculating?.Ethereum?.current?.peggedUSD ?? 0,
      }))
      .filter((a) => a.circulating > 0)
      .sort((a, b) => b.circulating - a.circulating)
      .slice(0, 4);
  } catch {
    return [];
  }
}

async function fetchDexVolume(): Promise<{
  total24h: number;
  total7d: number;
  top: Array<{ name: string; volume24h: number }>;
} | null> {
  try {
    const res = await fetch(
      `${DEFILLAMA_API}/overview/dexs/ethereum?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as DefiLlamaDexOverview;
    const top = (data.protocols ?? [])
      .filter((p) => (p.total24h ?? 0) > 0)
      .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))
      .slice(0, 5)
      .map((p) => ({ name: p.name, volume24h: p.total24h ?? 0 }));
    return {
      total24h: data.total24h ?? 0,
      total7d: data.total7d ?? 0,
      top,
    };
  } catch {
    return null;
  }
}

export async function fetchAndFormatEthBrief(kv: KVNamespace): Promise<string> {
  const CACHE_KEY = 'eth:brief';
  const CACHE_TTL = 3600;

  const cached = await kv.get(CACHE_KEY);
  if (cached) return cached;

  const [prices, tvl, protocols, stablecoins, dex] = await Promise.all([
    fetchPrices(),
    fetchChainTvl(),
    fetchTopEthProtocols(),
    fetchTopEthStablecoins(),
    fetchDexVolume(),
  ]);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });

  const lines: string[] = [];
  lines.push(`🔷 <b>ETH Daily Brief — ${dateStr} ${timeStr} CST</b>`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Prices
  lines.push('💰 <b>价格</b>');
  if (prices) {
    const ethChange = fmtChange(prices.eth.change24h);
    const btcChange = fmtChange(prices.btc.change24h);
    const ethMcStr = prices.eth.marketCap > 0 ? `  市值 ${fmtUSD(prices.eth.marketCap)}` : '';
    const btcMcStr = prices.btc.marketCap > 0 ? `  市值 ${fmtUSD(prices.btc.marketCap)}` : '';
    lines.push(`  ETH  <b>${fmtUSD(prices.eth.price)}</b>  ${ethChange}${ethMcStr}`);
    lines.push(`  BTC  <b>${fmtUSD(prices.btc.price)}</b>  ${btcChange}${btcMcStr}`);
  } else {
    lines.push('  ❌ 价格获取失败');
  }

  // DeFi TVL
  lines.push('📊 <b>DeFi TVL (DeFiLlama)</b>');
  if (tvl) {
    lines.push(`  Ethereum  <b>${fmtUSD(tvl.ethereum)}</b>`);
    lines.push(`  全链总计  <b>${fmtUSD(tvl.total)}</b>`);
  } else {
    lines.push('  ❌ TVL 获取失败');
  }

  // Top protocols
  lines.push('🏆 <b>ETH Top 5 协议 TVL</b>');
  if (protocols.length > 0) {
    protocols.forEach((p, i) => {
      const name = p.name.padEnd(22);
      const tvlStr = fmtUSD(p.tvl).padEnd(10);
      const change = fmtChange(p.change1d);
      lines.push(`  ${i + 1}. ${name}${tvlStr}${change}`);
    });
  } else {
    lines.push('  ❌ 协议数据获取失败');
  }

  // Stablecoins
  lines.push('💵 <b>ETH 链稳定币 (Top 4)</b>');
  if (stablecoins.length > 0) {
    stablecoins.forEach((s) => {
      lines.push(`  ${s.symbol.padEnd(8)} <b>${fmtUSD(s.circulating)}</b>`);
    });
  } else {
    lines.push('  ❌ 稳定币数据获取失败');
  }

  // DEX volume
  lines.push('🔄 <b>ETH DEX 交易量</b>');
  if (dex) {
    lines.push(`  24h 合计  <b>${fmtUSD(dex.total24h)}</b>    7d 合计  <b>${fmtUSD(dex.total7d)}</b>`);
    lines.push('  ── Top 5 ──');
    dex.top.forEach((d, i) => {
      const name = d.name.padEnd(22);
      lines.push(`  ${i + 1}. ${name}<b>${fmtUSD(d.volume24h)}</b>`);
    });
  } else {
    lines.push('  ❌ DEX 数据获取失败');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('Data: CoinGecko + DeFiLlama');

  const message = lines.join('\n');
  await kv.put(CACHE_KEY, message, { expirationTtl: CACHE_TTL });
  return message;
}
