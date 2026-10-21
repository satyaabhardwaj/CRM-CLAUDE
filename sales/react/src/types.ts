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
export interface Context {
  readOnly?: boolean;
  all: Client[];
  everyone: Client[];
  clients: Client[];
  dash: string;
  selected: Client | null;
  isOpen: boolean;
  viewing: string;
  match(c: Client): boolean;
  add(c: Client): void;
  select(id: string): void;
  peek(stage: string): void;
  close(): void;
  update(change?: (() => void) | null): void;
  goTo(stage: string, c: Client): void;
  open(c: Client): void;
}
export interface KitAPI {
  bankOnly(): boolean;
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
