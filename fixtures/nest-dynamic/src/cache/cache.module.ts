import { type DynamicModule, Module } from "@nestjs/common";
import { CacheService } from "./cache.service";
import { CACHE_TTL } from "./cache.tokens";

@Module({})
export class CacheModule {
  static forRoot(ttl: number): DynamicModule {
    return {
      module: CacheModule,
      providers: [CacheService, { provide: CACHE_TTL, useValue: ttl }],
      exports: [CacheService],
      global: true,
    };
  }
}
