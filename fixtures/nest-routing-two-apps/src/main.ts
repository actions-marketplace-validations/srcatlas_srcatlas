import { NestFactory } from "@nestjs/core";
import { ShelfModule } from "./shelf.module";

async function bootstrap() {
  const app = await NestFactory.create(ShelfModule);
  app.setGlobalPrefix("api");
  await app.listen(3000);
}
bootstrap();
