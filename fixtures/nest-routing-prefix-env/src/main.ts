import { NestFactory } from "@nestjs/core";
import { StockModule } from "./stock.module";

// Not the NestJS factory, so its setGlobalPrefix must not be read.
const Lookalike = {
  create: (_module: unknown) => ({ setGlobalPrefix: (_p: string) => {} }),
};
Lookalike.create(StockModule).setGlobalPrefix("decoy");

async function bootstrap() {
  const app = await NestFactory.create(StockModule);
  app.setGlobalPrefix(process.env.PREFIX ?? "api");
  await app.listen(3000);
}
bootstrap();
