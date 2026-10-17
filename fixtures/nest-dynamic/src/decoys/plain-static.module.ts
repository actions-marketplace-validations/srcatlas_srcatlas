import { Module } from "@nestjs/common";

// A static method that is not a module factory: the module stays static.
@Module({})
export class PlainStaticModule {
  static describe(): string {
    return "plain";
  }
}
