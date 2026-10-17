import { Module } from "@nestjs/common";
import { buildModule } from "external-lib";
import { AuditModule } from "./audit/audit.module";
import { CacheModule } from "./cache/cache.module";
import { FakeFactory } from "./decoys/fake-factory";
import { DeepModule } from "./deep/deep.module";
import { MetricsModule } from "./metrics/metrics.module";
import { QueueModule } from "./queue/queue.module";

declare const settings: object;

@Module({
  imports: [
    CacheModule.forRoot(30),
    QueueModule.forRootAsync({ useFactory: () => ({}) }),
    MetricsModule.forRoot(),
    AuditModule.register(),
    DeepModule.forRoot(),
    buildModule(settings),
    FakeFactory.forRoot(),
  ],
})
export class DynRootModule {}
