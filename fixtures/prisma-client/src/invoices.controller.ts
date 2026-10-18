import { Controller, Get } from "@nestjs/common";
import type { LedgerDb } from "./ledger-db";

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly ledger: LedgerDb) {}

  @Get() count() {
    return this.ledger.invoice.count();
  }
}
