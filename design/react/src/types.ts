export interface Client {
  id: string;
  name: string;
  pid: string;
  cid: string;
  stage: string;
  city?: string;
  phone?: string;
  owner?: string;
  [key: string]: unknown;
}
export interface Store {
  rev: number;
  clients: Client[];
  [key: string]: unknown;
}
export interface Person {
  id: string;
  name: string;
  role: string;
  reportsTo?: string;
  startedAs?: string;
}
export type WindowKind =
  | "client"
  | "proposal"
  | "timeline"
  | "measure"
  | "ept"
  | "appliances"
  | "designflow"
  | "pdi";
export interface Context {
  readOnly: boolean;
  all: import("./model").DesignClient[];
  tab: string;
  page: string;
  update(change?: (() => void) | null): void;
  show(kind: WindowKind, id: string): void;
  go(tab: string, page?: string): void;
  close(): void;
}
export interface KitAPI {
  money(v: number): string;
  bankOnly(): boolean;
  now(): string;
  day(v: string): string;
  dayTime(v: string): string;
  when(v: string): string;
  daysSince(v?: string): number;
  hoursSince(v?: string): number;
  outcome(v: string): string;
  news(c: Client, text: string, tone: string, from: string): void;
  today(): string;
  ymd(date: Date): string;
  short(value: number): string;
  lakh(value: number): string;
  newsFrom(n: { from?: string; text: string }): string;
  pdf(
    filename: string,
    title: string,
    subtitle: string,
    sections: unknown[],
  ): void;
  headName(): string;
  store: {
    data: Store;
    load(): Promise<Store>;
    save(): void;
    watch(fn: () => void): void;
    onAdd?(c: Client, others: Client[]): void;
    sendFile(owner: string, file: File): Promise<string>;
  };
}
declare global {
  interface Window {
    Kit: KitAPI;
    People: {
      list: Person[];
      designers: string[];
      designHead: string;
      ROLES: string[];
      owner(c: Client): string;
    };
    Pin: {
      ok(pin: string): boolean;
      state(pin: string): string;
      lookup(pin: string): Promise<{ city?: string; state?: string } | null>;
    };
    OCF: {
      make(c: Client): void;
      forSigning(
        c: Client,
      ): { pdf: string; filename: string; marks: unknown[] } | null;
    };
    Signals: { flags(c: Client): [string, string, string][] };
    SalesLogic: { ensure(c: Client): Client };
  }
}
