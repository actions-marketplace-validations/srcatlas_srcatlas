import { describe, expect, it } from "vitest";
import {
  actionId,
  classId,
  eventId,
  externalId,
  fileId,
  InvalidIdError,
  nextRoutePath,
  normalizeRoutePath,
  packageId,
  queueId,
  routeId,
  withCollisionSuffix,
} from "./ids.js";

describe("ID builders (schema 5.1 examples)", () => {
  it("matches the format table", () => {
    expect(packageId("api")).toBe("package:api");
    expect(classId("module", "api", "OrdersModule")).toBe(
      "module:api/OrdersModule",
    );
    expect(classId("model", "api", "Order")).toBe("model:api/Order");
    expect(routeId("api", "get", "/v1/orders/:id")).toBe(
      "route:api/GET /v1/orders/:id",
    );
    expect(actionId("web", "app/orders/actions", "createOrder")).toBe(
      "action:web/app/orders/actions#createOrder",
    );
    expect(queueId("email")).toBe("queue:email");
    expect(eventId("/", "chat:send")).toBe("event:/#chat:send");
    expect(externalId("stripe")).toBe("external:stripe");
    expect(fileId("api", "src/main.ts")).toBe("file:api/src/main.ts");
    expect(classId("provider", "@acme/api", "S")).toBe("provider:@acme/api/S");
  });

  it("NFC-normalises and rejects control characters and empties", () => {
    expect(packageId("é")).toBe("package:é");
    expect(() => packageId("a\nb")).toThrow(InvalidIdError);
    expect(() => queueId("")).toThrow(InvalidIdError);
  });
});

describe("collision suffix (5.2)", () => {
  it("suffixes every colliding node, none of the others", () => {
    const ids = withCollisionSuffix([
      { id: "provider:api/ConfigService", dir: "src/legacy" },
      { id: "provider:api/ConfigService", dir: "src/config" },
      { id: "provider:api/Other", dir: "src" },
    ]);
    expect(ids).toEqual([
      "provider:api/ConfigService@src/legacy",
      "provider:api/ConfigService@src/config",
      "provider:api/Other",
    ]);
  });
});

describe("route normalisation (5.3)", () => {
  it("joins pieces with single slashes, no trailing slash", () => {
    expect(normalizeRoutePath("api", "/v1/", "orders//", ":id")).toBe(
      "/api/v1/orders/:id",
    );
    expect(normalizeRoutePath("")).toBe("/");
    expect(normalizeRoutePath("/", "/")).toBe("/");
  });
  it("keeps NestJS params and wildcards", () => {
    expect(normalizeRoutePath("files", "*")).toBe("/files/*");
  });
  it("maps Next.js segments", () => {
    expect(nextRoutePath(["orders", "[id]"])).toEqual({
      path: "/orders/:id",
      optionalCatchAll: false,
    });
    expect(nextRoutePath(["docs", "[...slug]"])).toEqual({
      path: "/docs/*slug",
      optionalCatchAll: false,
    });
    expect(nextRoutePath(["docs", "[[...slug]]"])).toEqual({
      path: "/docs/*slug",
      optionalCatchAll: true,
    });
    expect(nextRoutePath(["(marketing)", "@modal", "about"])).toEqual({
      path: "/about",
      optionalCatchAll: false,
    });
    expect(nextRoutePath(["feed", "(.)photo", "[id]"])).toBeNull();
    expect(nextRoutePath(["(..)(..)x"])).toBeNull();
    expect(nextRoutePath([])).toEqual({ path: "/", optionalCatchAll: false });
  });
});
