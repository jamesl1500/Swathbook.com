/**
 * A stand-in for the Supabase client in unit tests. Query builders are
 * chainable and awaitable like the real ones; every finished query is recorded
 * in `calls`, and results are scripted per "table.operation" with `respond()`.
 */
import { vi } from "vitest";

type QueryError = { code?: string; message: string };
type QueryResult = { data?: unknown; error?: QueryError | null };

export type RecordedCall = {
    table: string;
    op: "select" | "insert" | "update" | "delete" | "upsert";
    values?: unknown;
    columns?: string;
    filters: Array<[string, ...unknown[]]>;
};

type Responder = QueryResult | ((call: RecordedCall) => QueryResult);

export function createSupabaseMock() {
    const calls: RecordedCall[] = [];
    const responders = new Map<string, Responder[]>();

    function respond(key: `${string}.${RecordedCall["op"]}`, ...results: Responder[]) {
        responders.set(key, [...(responders.get(key) ?? []), ...results]);
    }

    function resolve(call: RecordedCall) {
        calls.push(call);
        const queue = responders.get(`${call.table}.${call.op}`) ?? [];
        // Use queued results in order; the last one repeats.
        const responder = queue.length > 1 ? queue.shift() : queue[0];
        const result = typeof responder === "function" ? responder(call) : (responder ?? {});
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    }

    function from(table: string) {
        const call: RecordedCall = { table, op: "select", filters: [] };
        const builder = {
            select(columns?: string) {
                if (call.op === "select") call.columns = columns;
                return builder;
            },
            insert(values: unknown) {
                Object.assign(call, { op: "insert", values });
                return builder;
            },
            update(values: unknown) {
                Object.assign(call, { op: "update", values });
                return builder;
            },
            upsert(values: unknown) {
                Object.assign(call, { op: "upsert", values });
                return builder;
            },
            delete() {
                call.op = "delete";
                return builder;
            },
            single: () => resolve(call),
            maybeSingle: () => resolve(call),
            then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
                return resolve(call).then(onFulfilled, onRejected);
            },
        } as Record<string, unknown>;

        for (const filter of ["eq", "neq", "is", "in", "not", "order", "limit", "match", "gte", "lte", "lt", "gt"]) {
            builder[filter] = (...args: unknown[]) => {
                call.filters.push([filter, ...args]);
                return builder;
            };
        }
        return builder;
    }

    const auth = {
        getClaims: vi.fn(async () => ({ data: { claims: null as Record<string, unknown> | null }, error: null })),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(async () => ({ error: null })),
        resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as QueryError | null })),
        updateUser: vi.fn(),
        refreshSession: vi.fn(async () => ({ data: {}, error: null as QueryError | null })),
        resend: vi.fn(async () => ({ data: {}, error: null as QueryError | null })),
        verifyOtp: vi.fn(async () => ({ data: {}, error: null as QueryError | null })),
        exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null as QueryError | null })),
    };

    const rpc = vi.fn<(fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: QueryError | null }>>(
        async () => ({ data: null, error: null }),
    );

    // Storage: script folder listings in `files` ("bucket/folder" -> entries); removals are recorded.
    const files = new Map<string, Array<{ name: string; id: string | null }>>();
    const removed: Array<{ bucket: string; paths: string[] }> = [];
    const uploaded: Array<{ bucket: string; path: string; contentType?: string }> = [];
    const storage = {
        from: (bucket: string) => ({
            upload: vi.fn(async (path: string, _file: unknown, options?: { contentType?: string }) => {
                uploaded.push({ bucket, path, contentType: options?.contentType });
                return { data: { path }, error: null as QueryError | null };
            }),
            list: vi.fn(async (folder: string) => ({ data: files.get(`${bucket}/${folder}`) ?? [], error: null })),
            remove: vi.fn(async (paths: string[]) => {
                removed.push({ bucket, paths });
                return { data: [], error: null };
            }),
        }),
    };

    return {
        client: { from: vi.fn(from), auth, rpc, storage },
        calls,
        respond,
        auth,
        rpc,
        files,
        removed,
        uploaded,
        /** Recorded calls for one table and operation. */
        callsTo(table: string, op?: RecordedCall["op"]) {
            return calls.filter((call) => call.table === table && (!op || call.op === op));
        },
    };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
