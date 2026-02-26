/**
 * Simple TTL-based in-memory cache.
 */

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class Cache {
    #store = new Map<string, CacheEntry<unknown>>();
    #defaultTtl: number;

    constructor(defaultTtlMs: number = 30_000) {
        this.#defaultTtl = defaultTtlMs;
    }

    get<T>(key: string): T | undefined {
        const entry = this.#store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.#store.delete(key);
            return undefined;
        }
        return entry.value as T;
    }

    set<T>(key: string, value: T, ttlMs?: number): void {
        this.#store.set(key, {
            value,
            expiresAt: Date.now() + (ttlMs ?? this.#defaultTtl),
        });
    }

    invalidate(key: string): void {
        this.#store.delete(key);
    }

    clear(): void {
        this.#store.clear();
    }
}
