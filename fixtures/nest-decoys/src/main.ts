import { ForeignModule } from "./foreign-imports";
import { NestFactory } from "./other-lib";

// Not NestFactory from @nestjs/core: no application, no global prefix.
const app = NestFactory.create(ForeignModule);
app.setGlobalPrefix("decoy");
