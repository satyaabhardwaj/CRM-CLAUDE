import type { Client, Context } from "./types";
export function clientReport(c: Client): unknown[];
export function clientPdf(c: Client): void;
export function weeklyReport(ctx: Context): void;
