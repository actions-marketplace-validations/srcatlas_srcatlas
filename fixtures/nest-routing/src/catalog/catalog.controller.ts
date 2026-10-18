import { All, Controller, Get, Head, Options, Sse } from "@nestjs/common";

@Controller({ path: "catalog", version: "1", host: "api.example.com" })
export class CatalogController {
  @Get() list() {}
  @Get("search/:term") search() {}
  @Get(["latest", "recent"]) latest() {}
  @All("any") any() {}
  @Options("opts") options() {}
  @Head("probe") probe() {}
  @Sse("events") events() {}
}
