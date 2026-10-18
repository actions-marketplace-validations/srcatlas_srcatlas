import { Module } from "@nestjs/common";
import { ArchiveDb } from "./archive-db";
import { CustomersService } from "./customers.service";
import { DynamicService } from "./dynamic.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { LedgerDb } from "./ledger-db";
import { PaymentsService } from "./payments.service";
import { RawService } from "./raw.service";
import { ReportsService } from "./reports.service";

@Module({
  controllers: [InvoicesController],
  providers: [
    LedgerDb,
    ArchiveDb,
    InvoicesService,
    PaymentsService,
    CustomersService,
    ReportsService,
    RawService,
    DynamicService,
  ],
})
export class LedgerModule {}
