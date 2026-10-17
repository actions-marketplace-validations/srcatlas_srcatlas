import { type DynamicModule, Module } from "@nestjs/common";

// The literal is two helper calls away from the static method (nestjs.md N-M5).
function makeMetrics(): DynamicModule {
  return withDefaults();
}

function withDefaults(): DynamicModule {
  return { module: MetricsModule, global: true };
}

@Module({})
export class MetricsModule {
  static forRoot(): DynamicModule {
    return makeMetrics();
  }
}
