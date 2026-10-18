import { Injectable } from "@nestjs/common";
import type { ArchiveDb } from "./archive-db";
import { ledgerClient } from "./client";

@Injectable()
export class CustomersService {
  constructor(private readonly archive: ArchiveDb) {}

  first() {
    return ledgerClient.customer.findFirst();
  }

  receipts() {
    return this.archive.receipt.findMany();
  }
}
