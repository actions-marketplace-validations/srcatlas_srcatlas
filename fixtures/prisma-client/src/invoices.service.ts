import { Injectable } from "@nestjs/common";
import type { LedgerDb } from "./ledger-db";

@Injectable()
export class InvoicesService {
  constructor(private readonly ledger: LedgerDb) {}

  list() {
    return this.ledger.invoice.findMany();
  }

  one(id: number) {
    return this.ledger.invoice.findUnique({ where: { id } });
  }

  total() {
    return this.ledger.invoice.aggregate({ _sum: { total: true } });
  }

  create(data: object) {
    return this.ledger.invoice.create({ data });
  }

  save(id: number, data: object) {
    return this.ledger.invoice.upsert({
      where: { id },
      create: data,
      update: data,
    });
  }

  clear() {
    return this.ledger.invoice.deleteMany();
  }

  archive() {
    return this.ledger.invoice.archive();
  }
}
