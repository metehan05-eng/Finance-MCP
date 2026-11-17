# Finance-MCP (Global & BIST Finance MCP Server)

An open-source **Model Context Protocol (MCP)** server providing direct access to Turkish (BIST) and global financial markets. 

**It lets AI tools such as Cursor, Claude Desktop, and Claude Code access real-time data including BIST stocks, global stocks (NVIDIA, Apple, Tesla, etc.), cryptocurrency prices, exchange rates, inflation data, macroeconomic indicators, technical analysis indicators, portfolio backtesting, VIOP/TEFAS data, and financial news.**

> 💡 **All data sources are completely free and do not require any API keys!**

---

## 🚀 Available Tools (51 Tools)

### Currency & Exchange
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_exchange_rate` | Current or historical exchange rate between two currencies (e.g., `USD` -> `TRY`) | Frankfurter (ECB) |
| `convert_currency` | Convert a specific amount to another currency using the current exchange rate | Frankfurter (ECB) |
| `get_historical_rate` | Exchange rate on a specific date from 1999 onwards | Frankfurter (ECB) |
| `get_tcmb_rate` | Buying/selling rates from the official CBRT bulletin | TCMB XML |

### Borsa Istanbul & Global Stocks
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_bist_price` | Current price, market cap, and 52-week high/low data for BIST stocks (e.g., `THYAO`, `ASELS`) | Yahoo Finance |
| `get_global_stock_price` | Stocks from around the world (AAPL, NVDA, TSLA), indices (S&P 500, NASDAQ), and ETFs | Yahoo Finance |
| `get_stock_history` | Historical OHLC (chart) data for a stock — for technical analysis (`THYAO.IS`, `AAPL`, `NVDA`) | Yahoo Finance |
| `search_symbol` | Search for ticker symbol by company name — `"ASELSAN"` → `ASELS.IS` | Yahoo Finance |
| `get_bist_indices` | BIST indices + sector breakdown: sectors ranked by benchmark (XU100) (`XBANK`, `XUTEK`, `XGMYO`, `XILTM`, `XUSIN`) | Yahoo Finance |

### Cryptocurrency
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_crypto_price` | Current price, market cap, and 24h volume of cryptocurrencies in selected currency | CoinGecko |
| `get_multi_crypto_price` | Get prices of multiple cryptocurrencies in a single query | CoinGecko |
| `get_crypto_history` | Historical OHLC data for cryptocurrencies (USD or TRY) — `bitcoin`, `ethereum`, `solana` | Yahoo Finance |
| `get_crypto_movers` | Top gainers and losers in 24h/7d, market median, market cap filter | CoinGecko |

### Commodities
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_commodity_price` | Prices of gold, silver, oil (WTI/Brent), natural gas, copper, platinum, etc. | Yahoo Finance |

### Macroeconomics
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_inflation_data` | Turkey CPI inflation (annual, World Bank) | World Bank / TÜİK |
| `get_macro_indicators` | GDP growth, GDP per capita, inflation, unemployment, current account, reserves (by country) | World Bank + FRED |
| `get_policy_rate` | CBRT policy rate (1-week repo) and historical rate changes | TCMB |
| `get_gov_bond_yields` | 10-year and benchmark government bond yields | doviz.com |

### Investment Analysis
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_fundamentals` | P/E, EPS, P/B, dividend yield, margins, beta, analyst targets | Yahoo Finance |
| `get_correlation` | Price/return correlation between two assets + annual return & volatility | Yahoo Finance |
| `analyze_portfolio` | Portfolio value, daily change, weights, historical volatility/return/Sharpe/max drawdown, currency distribution + **sector/industry breakdown, weighted beta, and concentration warnings** | Yahoo Finance |

### BIST Specific
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_fund_price` | TEFAS mutual fund current price (NAV) and recent performance data | TEFAS |
| `get_viop_quote` | VIOP futures contract price, bid/ask, and volume data | OYAK Yatırım |
| `get_market_summary` | BIST market summary: main indices + bank/industry watchlist | Yahoo Finance |

### News & Calendar
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_economic_calendar` | Global economic calendar (rate decisions, inflation, employment, etc.) — country/impact filter | ForexFactory |
| `get_financial_news` | Latest news headlines on stocks/indices/crypto/FX | Yahoo Finance RSS |

### Technical Analysis
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_technical_indicators` | RSI(14), SMA(20/50/200), EMA(12/26), MACD(12/26/9), Bollinger Bands, ATR(14) + signal interpretation | Yahoo Finance + local calculation |
| `get_market_movers` | Top gainers/losers, most active, growth tech stocks, etc. pre-defined lists | Yahoo Finance Screener |
| `get_trending_stocks` | Most trending/popular stocks by region (with price and change) | Yahoo Finance Trending |

### Market Indicators & Turkey
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_market_indicators` | VIX (fear index), US 13-week/5/10/30-year Treasury yields, Dollar Index (DXY), yield curve interpretation | Yahoo Finance |
| `get_altin_gram_price` | Gold spot price (USD) and gram gold price (TRY) — 24K and 22K (jewelry) | Yahoo Finance |
| `get_tcmb_snapshot` | Turkey snapshot: major FX rates, CBRT policy rate, US 10Y Treasury, gram gold | Yahoo Finance + TCMB |

### Advanced Analytics
| Tool | Description | Source |
| :--- | :--- | :--- |
| `backtest_portfolio` | Portfolio backtest: total/annual return, volatility, maximum drawdown, Sharpe, asset contributions (TRY→USD conversion) | Yahoo Finance OHLC |
| `get_crypto_fear_greed` | Crypto Fear & Greed Index (0-100) current value and 30-day history | alternative.me |
| `get_crypto_market_overview` | Crypto market cap, 24h volume/change, BTC-ETH dominance, top trending coins | CoinGecko |

### Dividends, Earnings & Analysts
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_dividend_history` | Dividend history, annual totals, trailing 12-month dividend yield, and payment continuity | Yahoo Finance |
| `get_earnings_info` | Upcoming earnings date, estimated EPS/revenue range, projected growth | Yahoo Finance |
| `get_analyst_consensus` | Analyst recommendation distribution, bullish percentage, average/low/high target price | Yahoo Finance |

### Company, Comparison & Sector
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_company_profile` | Company profile: sector, industry, country, employee count, website, business summary | Yahoo Finance |
| `compare_stocks` | Compare 2-8 stocks by price, market cap, P/E, P/B, ROE, dividend yield, 52-week range, and beta | Yahoo Finance |
| `get_sector_performance` | Period return ranking across 11 US sector ETFs, strongest/weakest sector | Yahoo Finance |
| `get_watchlist` | Watchlist of up to 20 symbols: live status, top gainers/losers. Reads the **persistent** list when `symbols` is omitted | Yahoo Finance |
| `save_watchlist` | Saves the watchlist to `~/.finans-mcp/watchlist.json` (`replace` / `add` / `remove` / `clear`) | Local file |

### Risk, Ownership & Derivatives
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_risk_metrics` | Historical VaR/CVaR, maximum drawdown and recovery, Sharpe/Sortino/Calmar, volatility, skewness/kurtosis | Yahoo Finance OHLC + local calculation |
| `get_seasonality` | Calendar-month seasonal performance: mean/median return, positive rate, best/worst year | Yahoo Finance OHLC + local calculation |
| `get_insider_transactions` | Recent insider buys/sells, net insider buying trend, and insider ownership ratio | Yahoo Finance |
| `get_institutional_holders` | Institutional/fund ownership breakdown, largest institutions, position and change ratios | Yahoo Finance |
| `get_etf_holdings` | ETF/fund composition: top holdings, sector allocation, expense ratio, and periodic returns | Yahoo Finance |
| `get_options_chain` | Options chain: available expiries, ATM call/put, open interest, volume, and put/call ratio | Yahoo Finance |
| `get_rebalancing_plan` | Rebalancing to target weights: buy/sell amount per asset and warnings | Local calculation |

### System
| Tool | Description | Source |
| :--- | :--- | :--- |
| `get_data_health` | Availability, response time, cache, and circuit breaker status of all data sources (diagnostics) | Multiple sources |

> 📚 Clients can read the `finans://tools/catalog` resource to see the tool catalog and example questions; the `finans://watchlist` resource returns the persistent watchlist saved via `save_watchlist`.
>
> 🧩 **Ready-made prompt templates** (`prompts/list`): `market_morning_brief`, `stock_deep_dive`, `portfolio_review`, `data_source_diagnosis`.

### Data freshness and outages

JSON tool responses include a `_dataMetadata` object with source names, the last successful fetch time, cache status, data age, and response generation time. When a source refresh fails, the server may return its last successful cached response for up to 24 hours; those results are marked with `staleData: true` and a `stale` source status. `get_data_health` also checks that providers return recognizable payloads, not only successful HTTP status codes.

---

## 📦 Installation

Make sure Node.js (>= 22) is installed:

```bash
git clone https://github.com/metehan05-eng/Finance-MCP.git
cd Finance-MCP
npm install
npm run build
```

**With Docker:**

```bash
docker build -t finans-mcp .
docker run -i --rm finans-mcp
```

**Connecting Docker to an MCP client (Claude Desktop config):**

```json
{
  "mcpServers": {
    "finans-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "finans-mcp"]
    }
  }
}
```

---

## 🖥️ Connecting with Cursor (2 Easy Ways)

### Way 1 (Automatic Project Config - Easiest)
Thanks to the `.cursor/mcp.json` file included in the project root, the **MCP server is recognized automatically** when you open this folder with Cursor:

1. Open Cursor and open the `Finance-MCP` folder.
2. Open Chat with `Ctrl + L` (`Cmd + L` on Mac).
3. Select **Agent** mode in the chat box.

### Way 2 (Global Cursor Setting)
If you want to use this server while working on other projects:
1. Click the **Settings (Gear ⚙️)** icon in the top right of Cursor (or press `Ctrl + Shift + J`).
2. Go to **Features > MCP Servers** in the left menu.
3. Click the **"+ Add New MCP Server"** button:
   * **Name:** `finance-mcp`
   * **Type:** `command`
   * **Command:** `node /full/path/to/Finance-MCP/build/index.js`

---

## 🤖 Connecting with Claude Desktop

Open your settings file in the Claude Desktop app:
* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add the following block to the file (update the path for your system):

```json
{
  "mcpServers": {
    "finance-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/Finance-MCP/build/index.js"
      ]
    }
  }
}
```

Restart the Claude Desktop app. The hammer (Tools) icon in the bottom right should show **51 tools** active.

---

## 💻 Connecting with Claude Code

### Way 1 — Project configuration (recommended, automatic)

The repo root contains the `scripts/claude-mcp.mjs` launcher and a Claude Code-specific `.mcp.json`:

```json
{
  "mcpServers": {
    "finans-mcp": {
      "command": "node",
      "args": ["${CLAUDE_PROJECT_DIR:-.}/scripts/claude-mcp.mjs"],
      "timeout": 60000
    }
  }
}
```

1. `npm install && npm run build` (on first run).
2. Run `claude` in the repo root and approve the `finans-mcp` server in the **approval** prompt on first launch.
3. The `/mcp` panel should show `finans-mcp · 51 tools` connected.

If `build/index.js` is missing, the launcher runs `npm run build` automatically, starts the server as a child process, and forwards signals. To reset approvals: `claude mcp reset-project-choices`.

### Way 2 — Manual addition (personal/user scope)

```bash
# For all projects (user scope)
claude mcp add finance-mcp -s user -- node /absolute/path/to/Finance-MCP/scripts/claude-mcp.mjs

# Only for this project (local scope)
claude mcp add finance-mcp -- node /absolute/path/to/Finance-MCP/scripts/claude-mcp.mjs
```

To check status:

```bash
claude mcp list        # connection status
claude mcp get finance-mcp
```

---

## 💬 Example Commands & Questions

You can ask Cursor or Claude directly:

* *"Build a comparison table for NVIDIA (NVDA), Apple (AAPL), and THYAO stocks."*
* *"What are the current Turkish lira prices of Bitcoin and Solana?"*
* *"Simulate a balanced portfolio of tech stocks and crypto with 250,000 TRY."*
* *"How many Turkish lira is 1,500 euros?"*
* *"How far are ASELS and TUPRS on BIST from their 52-week highs?"*
* *"What is the correlation between THYAO and BIST 100?"*
* *"Show the CBRT policy rate and the last 5 rate changes."*
* *"How have Turkey's GDP growth and unemployment rate changed over the last 3 years?"*
* *"Chart Bitcoin's last 6 months."*
* *"Analyze this portfolio: 100 THYAO.IS (cost 280), 500 GARAN.IS (cost 300), 10 AAPL (cost 150)."*
* *"Show the price of the GAF fund over the last week."*
* *"Show the price of the X10 futures contract on VIOP."*
* *"Tell me the RSI, MACD, and Bollinger values and technical outlook for THYAO over the last 6 months."*
* *"Is the trend for AAPL up or down relative to its 50- and 200-day averages?"*
* *"Which stocks drove the US market the most today?"*
* *"What is VIX right now, is the market in fear territory? What is the US 10-year Treasury yield?"*
* *"How much is gram gold in TRY today?"*
* *"How do Turkey's FX rates, policy rate, and bond yield look at a glance?"*
* *"What are the 1-year return, Sharpe ratio, and maximum drawdown of a portfolio of 100 THYAO.IS and 20 AAPL?"*
* *"Is fear or greed dominant in the crypto market right now?"*

---

## 🛠️ Development

```bash
npm run dev           # Watch for code changes and rebuild automatically
npm run lint          # ESLint (TypeScript) check
npm run format        # Format code with Prettier
npm test              # Build + unit tests (node --test)
npm run test:coverage # Unit tests + line coverage report
npm run smoke         # Live smoke test (hits real sources, requires network)
npm run check         # lint + format:check + test (same as CI)
npm run inspector     # Visually test tools in the browser with MCP Inspector
```

**Test & Quality:**
- **246 unit tests** live under `src/**/*.test.ts`: indicators, statistics, risk metrics, seasonality, ownership/ETF/options normalization, Turkish number parsing, cache/retry/circuit breaker logic, storage layer, and tool network paths with fake dependencies (DI).
- `scripts/smoke.mjs` actually boots the server and calls 32 cases against live sources (aggregate failure threshold: 40%; a single source failure is flagged as a warning).
- GitHub Actions: `ci.yml` runs lint + format + build + tests on every push/PR; `smoke.yml` runs live tests on main pushes and weekly; `release.yml` publishes to npm + GitHub Release on `v*` tags.

**Resilience:** All source calls go through a source-specific TTL in-memory cache (FX rates 60 s, macro 30 min) and are retried 3 times with jittered exponential backoff on network errors. A **circuit breaker** kicks in for a persistently failing source and returns an immediate informative error for 45 s — so hammering a blocked source does not waste time. Check status with `get_data_health`.

**Project structure:**
```
src/
  index.ts              # Server setup and registration of all tools
  tools/                # One file per tool (registerX)
  utils/
    yahoo.ts            # Yahoo Finance client (quote/OHLC/search, cached)
    cache.ts            # TTL cache + jittered retry
    indicators.ts       # RSI, SMA, EMA, MACD, Bollinger, ATR
    financeMath.ts      # Statistics and portfolio math
    fetchWithRetry.ts   # HTTP request with retry + cache + error response
    httpCircuit.ts      # Host-based circuit breaker
    resolveTickers      # THYAO → THYAO.IS symbol resolution (inside yahoo.ts)
    toolCatalog.ts      # finans://tools/catalog resource
    financePrompts.ts   # Ready-made prompt templates (MCP prompts)
scripts/smoke.mjs       # Live smoke test
```

## 📄 License

MIT License © 2026 [metehan05-eng](https://github.com/metehan05-eng)
