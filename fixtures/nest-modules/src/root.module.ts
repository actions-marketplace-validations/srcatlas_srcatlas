import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { AppConfigModule } from "./config/app-config.module";
import { MetaModule } from "./meta/meta.module";
import { SpreadModule } from "./spread/spread.module";
import { User } from "./users/user.entity";

@Module({
  imports: [
    AuthModule,
    AccountsModule,
    AppConfigModule,
    SpreadModule,
    MetaModule,
    ConfigModule.forRoot(),
    TypeOrmModule.forFeature([User]),
    HttpModule,
  ],
})
export class RootModule {}
