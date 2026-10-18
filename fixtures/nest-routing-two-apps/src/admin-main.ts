import { NestFactory } from "@nestjs/core";
import { ShelfModule } from "./shelf.module";

async function bootstrap() {
  const admin = await NestFactory.create(ShelfModule);
  admin.setGlobalPrefix("admin");
  await admin.listen(3001);
}
bootstrap();
