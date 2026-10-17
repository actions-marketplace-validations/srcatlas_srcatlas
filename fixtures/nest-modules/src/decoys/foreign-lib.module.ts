import { Module } from "some-other-lib";
import { UsersModule } from "../users/users.module";

@Module({ imports: [UsersModule] })
export class ForeignLibModule {}
