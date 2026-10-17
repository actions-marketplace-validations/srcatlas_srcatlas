import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [forwardRef(() => AuthModule)],
})
export class UsersModule {}
