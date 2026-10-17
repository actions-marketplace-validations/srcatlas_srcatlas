import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";

const META = { imports: [AccountsModule] };

@Module(META)
export class MetaModule {}
