import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { ClockService, LoggerService } from "./shared.services";

const SHARED = [LoggerService, ClockService];
const BASE_IMPORTS = [UsersModule];

@Module({
  imports: [...BASE_IMPORTS],
  providers: [...SHARED],
})
export class SpreadModule {}
