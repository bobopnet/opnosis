/**
 * Opnosis Auction Backend — hyper-express API server.
 *
 * Routes:
 *   GET  /health                -> { status, network, contract }
 *   GET  /stats                 -> AuctionStats
 *   GET  /price/:tokenAddress   -> { usd: number }
 *   GET  /auctions              -> IndexedAuction[]
 *   GET  /auctions/:id          -> IndexedAuction
 *   GET  /auctions/:id/clearing -> IndexedClearing
 *   GET  /fee-parameters        -> { feeNumerator }
 */

import HyperExpress from '@btc-vision/hyper-express';
import { OpnosisContract, getNetworkConfig } from '@opnosis/shared';
import { config, provider } from './config.js';
import { Cache } from './cache.js';
import { startIndexer, getAuctions, getAuction, getClearingData, getOrdersData, getStats } from './indexer.js';
import { getTokenUsdPrice } from './pricefeed.js';

const networkConfig = getNetworkConfig(config.network);
const contract = new OpnosisContract(
    config.contractAddress,
    provider,
    networkConfig.btcNetwork,
);

const cache = new Cache(config.cacheTtlMs);

startIndexer(contract, cache, config.indexerPollMs, provider, networkConfig.btcNetwork);

// -- HTTP server ---------------------------------------------------------------

const app = new HyperExpress.Server({
    max_body_length: 1024 * 16,
    fast_abort: true,
    idle_timeout: 60,
    response_timeout: 30,
});

// Global error handler
app.set_error_handler((_req, res, _error) => {
    if (res.closed) return;
    res.atomic(() => {
        res.status(500);
        res.json({ error: 'Internal server error' });
    });
});

// -- CORS middleware ------------------------------------------------------------

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.corsOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    next();
});

// -- GET /health ---------------------------------------------------------------

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        network: config.network,
        contract: config.contractAddress,
    });
});

// -- GET /stats ----------------------------------------------------------------

app.get('/stats', async (_req, res) => {
    const cacheKey = 'stats';
    const cached = cache.get<Awaited<ReturnType<typeof getStats>>>(cacheKey);
    if (cached) {
        res.json(cached);
        return;
    }
    const stats = await getStats();
    cache.set(cacheKey, stats);
    res.json(stats);
});

// -- GET /price/:tokenAddress --------------------------------------------------

app.get('/price/:tokenAddress', async (req, res) => {
    const tokenAddress = req.path_parameters?.['tokenAddress'] ?? '';
    if (!tokenAddress) {
        res.status(400).json({ error: 'Missing token address' });
        return;
    }
    const cacheKey = `price:${tokenAddress}`;
    const cached = cache.get<{ usd: number }>(cacheKey);
    if (cached) {
        res.json(cached);
        return;
    }
    const usd = await getTokenUsdPrice(tokenAddress);
    const data = { usd };
    cache.set(cacheKey, data);
    res.json(data);
});

// -- GET /auctions -------------------------------------------------------------

app.get('/auctions', (_req, res) => {
    res.json(getAuctions());
});

// -- GET /auctions/:id ---------------------------------------------------------

app.get('/auctions/:id', (req, res) => {
    const id = parseInt(req.path_parameters?.['id'] ?? '', 10);
    if (isNaN(id) || id < 1) {
        res.status(400).json({ error: 'Invalid auction ID' });
        return;
    }
    const auction = getAuction(id);
    if (!auction) {
        res.status(404).json({ error: 'Auction not found' });
        return;
    }
    res.json(auction);
});

// -- GET /auctions/:id/orders --------------------------------------------------

app.get('/auctions/:id/orders', async (req, res) => {
    const id = parseInt(req.path_parameters?.['id'] ?? '', 10);
    if (isNaN(id) || id < 1) {
        res.status(400).json({ error: 'Invalid auction ID' });
        return;
    }
    const auction = getAuction(id);
    if (!auction) {
        res.status(404).json({ error: 'Auction not found' });
        return;
    }
    const orders = await getOrdersData(contract, cache, id);
    if (!orders) {
        res.status(500).json({ error: 'Failed to fetch orders' });
        return;
    }
    res.json(orders);
});

// -- GET /auctions/:id/clearing ------------------------------------------------

app.get('/auctions/:id/clearing', async (req, res) => {
    const id = parseInt(req.path_parameters?.['id'] ?? '', 10);
    if (isNaN(id) || id < 1) {
        res.status(400).json({ error: 'Invalid auction ID' });
        return;
    }
    const auction = getAuction(id);
    if (!auction) {
        res.status(404).json({ error: 'Auction not found' });
        return;
    }
    if (!auction.isSettled) {
        res.status(400).json({ error: 'Auction not yet settled' });
        return;
    }
    const clearing = await getClearingData(contract, cache, id);
    if (!clearing) {
        res.status(500).json({ error: 'Failed to fetch clearing data' });
        return;
    }
    res.json(clearing);
});

// -- GET /fee-parameters -------------------------------------------------------

app.get('/fee-parameters', async (_req, res) => {
    const cacheKey = 'fee-parameters';
    const cached = cache.get<{ feeNumerator: string }>(cacheKey);
    if (cached) {
        res.json(cached);
        return;
    }
    try {
        const fees = await contract.getFeeParameters();
        const data = { feeNumerator: fees.feeNumerator.toString() };
        cache.set(cacheKey, data);
        res.json(data);
    } catch {
        res.status(500).json({ error: 'Failed to fetch fee parameters' });
    }
});

// -- Start ---------------------------------------------------------------------

await app.listen(config.port);
console.log(`Opnosis Auction backend running on port ${config.port}`);
console.log(`  Network : ${config.network}`);
console.log(`  Contract: ${config.contractAddress}`);
console.log(`  Indexer : polling every ${config.indexerPollMs}ms`);
