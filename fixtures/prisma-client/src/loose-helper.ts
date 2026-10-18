import type { LedgerDb } from "./ledger-db";

// Neither a provider nor a controller: its calls have no node to start from.
export class LooseHelper {
  constructor(private readonly ledger: LedgerDb) {}

  touch() {
    return this.ledger.invoice.count();
  }
}

export function countCustomers(ledger: LedgerDb) {
  return ledger.customer.count();
}
