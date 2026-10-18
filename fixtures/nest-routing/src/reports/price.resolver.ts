import { Query, Resolver } from "@nestjs/graphql";

// GraphQL is not a route in v1: nothing is emitted and nothing is reported.
@Resolver()
export class PriceResolver {
  @Query() prices() {}
}
