import { type DynamicModule, Module } from "@nestjs/common";

// Three helper calls deep: more than the two levels the extractor follows.
function levelOne(): DynamicModule {
  return levelTwo();
}

function levelTwo(): DynamicModule {
  return levelThree();
}

function levelThree(): DynamicModule {
  return { module: DeepModule };
}

@Module({})
export class DeepModule {
  static forRoot(): DynamicModule {
    return levelOne();
  }
}
