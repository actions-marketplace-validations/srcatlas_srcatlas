import { Injectable } from "@nestjs/common";
import type { LedgerDb } from "./ledger-db";

const REFUND = "refund" as const;

@Injectable()
export class DynamicService {
  constructor(private readonly ledger: LedgerDb) {}

  byName(name: "invoice" | "payment") {
    return this.ledger[name].findMany();
  }

  customers() {
    // biome-ignore lint/complexity/useLiteralKeys: PR-C7 reads a literal key like a delegate
    return this.ledger["customer"].count();
  }

  refunds() {
    return this.ledger[REFUND].count();
  }

  ghosts() {
    return this.ledger.ghost.findMany();
  }
}
