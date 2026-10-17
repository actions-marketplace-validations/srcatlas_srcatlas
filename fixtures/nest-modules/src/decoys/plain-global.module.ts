import { Module } from "@nestjs/common";

// A decorator called Global that is not the NestJS one: the module must not become global.
function Global(): ClassDecorator {
  return () => undefined;
}

@Global()
@Module({})
export class PlainGlobalModule {}
