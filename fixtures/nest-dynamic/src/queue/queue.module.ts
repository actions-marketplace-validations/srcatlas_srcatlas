import { type DynamicModule, Module } from "@nestjs/common";

export const OPTIONS = "QUEUE_OPTIONS";

@Module({})
export class QueueModule {
  static forRootAsync(opts: {
    imports?: unknown[];
    useFactory: (...a: unknown[]) => object;
    inject?: unknown[];
  }): DynamicModule {
    return {
      module: QueueModule,
      imports: opts.imports ?? [],
      providers: [
        {
          provide: OPTIONS,
          useFactory: opts.useFactory,
          inject: opts.inject ?? [],
        },
      ],
    };
  }
}
