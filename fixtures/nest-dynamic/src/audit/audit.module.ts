import { type DynamicModule, forwardRef, Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";

@Module({})
export class AuditModule {
  static register(): DynamicModule {
    const definition = {
      module: AuditModule,
      imports: [forwardRef(() => CacheModule)],
    };
    return definition;
  }
}
