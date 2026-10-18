import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog/catalog.controller";
import { FleetModule } from "./fleet/fleet.module";
import { HealthController } from "./health/health.controller";
import { ReportsModule } from "./reports/reports.module";

@Module({
  imports: [FleetModule, ReportsModule],
  controllers: [HealthController, CatalogController],
})
export class AppModule {}
