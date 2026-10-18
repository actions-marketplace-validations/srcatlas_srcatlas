import { Module } from "@nestjs/common";
import { ListenerController } from "./listener.controller";
import { MixedController } from "./mixed.controller";
import {
  ArchiveReportsController,
  ReportsController,
} from "./reports.controller";

@Module({
  controllers: [
    ReportsController,
    ArchiveReportsController,
    ListenerController,
    MixedController,
  ],
})
export class ReportsModule {}
