import { Global, Module } from "@nestjs/common";
import { ConfigStore } from "./config.store";

@Global()
@Module({ providers: [ConfigStore], exports: [ConfigStore] })
export class AppConfigModule {}
