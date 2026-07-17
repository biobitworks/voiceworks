import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
export * from "./schema";

// Raw SQL helpers — drizzle's select-builder was causing infinite recursion in this proxy.
export function sqlAll(env: any, sql: string, params: any[] = []): any[] {
  return env.sql.raw(sql, params).rows as any[];
}
export function sqlGet(env: any, sql: string, params: any[] = []): any | undefined {
  const rows = env.sql.raw(sql, params).rows as any[];
  return rows.length > 0 ? rows[0] : undefined;
}
export function sqlRun(env: any, sql: string, params: any[] = []): void {
  env.sql.exec(sql, params);
}

export function makeDb(env: any) {
  return drizzle(async (sql: string, params: any[], method: string) => {
    if (method === "run") { env.sql.exec(sql, params); return { rows: [] }; }
    const { rows } = env.sql.raw(sql, params);
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  }, { schema });
}
