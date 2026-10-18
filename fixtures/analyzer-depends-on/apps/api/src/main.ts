import { greet } from "@shared/greet";
import { client } from "./client";

export const hello = greet(client);
