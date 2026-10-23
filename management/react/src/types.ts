export interface Client {
  id: string;
  cid: string;
  pid: string;
  name: string;
  stage: string;
  owner?: string;
  city?: string;
  product?: string;
  source?: string;
  psm?: string;
  receivedAt: string;
  spokeAt?: string;
  missed24?: boolean;
  nextFollowUp?: string;
  approvedAt?: string;
  bookedAt?: string;
  submittedAt?: string;
  contacts: { at: string; type: string; outcome: string; note?: string }[];
  design: {
    step?: string;
    stepAt?: string;
    sentAt?: string;
    designer?: string;
    promisedBy?: string;
    brief: { requiredOn?: string; [key: string]: unknown };
    proposals: {
      v: number;
      amount: number;
      receivedAt?: string;
      sharedAt?: string;
      [key: string]: unknown;
    }[];
    revisions: { reason: string; [key: string]: unknown }[];
  };
  payment: {
    plan: string;
    expectedBy?: string;
    receipts: {
      amount: number;
      date: string;
      status: string;
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
  approvals: Record<string, string>;
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
}
export type Tone = "red" | "yellow" | "blue" | "grey" | "green" | "violet";
export type Flag = [string, Tone, string];
export interface Rules {
  ensure(c: Client): Client;
  totals(c: Client): { total: number };
  collected(c: Client): number;
  bookingLeft(c: Client): number;
  bookingDue(c: Client): number;
  tokenIn(c: Client): boolean;
  dates(c: Client): { handover: string } | null;
  firstCall(c: Client): { late: boolean; hoursLeft: number };
}
export type Open = { kind: "client" | "person"; id: string };
export type Show = (value: Open) => void;
export type Tab = "overview" | "people" | "clients" | "analysis" | "users";
export type Range = "all" | "month" | "lastMonth" | "week";
declare global {
  interface Window {
    Kit: {
      short(v: number): string;
      money(v: number): string;
      day(v: string): string;
      dayTime(v: string): string;
      span(v: number): string;
      daysSince(v?: string): number;
      today(): string;
      ymd(d: Date): string;
      headName(): string;
      store: { data: Store };
    };
    People: { list: Person[]; owner(c: Client): string };
    SalesLogic: Rules;
    Signals: {
      LIVE: string[];
      STAGE: Record<string, string>;
      flags(c: Client): Flag[];
      value(c: Client): number;
      lastTouch(c: Client): number;
      ball(c: Client): [string, number];
    };
  }
}
