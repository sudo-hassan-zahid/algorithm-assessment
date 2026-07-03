import { describe, expect, it } from "vitest";

import { openApiDocument } from "./openapi";

describe("OpenAPI document", () => {
  it("documents every public API operation", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.paths).toMatchObject({
      "/api/health": { get: expect.any(Object) },
      "/api/customers": { get: expect.any(Object) },
      "/api/requests": {
        get: expect.any(Object),
        post: expect.any(Object),
      },
      "/api/requests/{id}": { get: expect.any(Object) },
      "/api/escalations/{id}/review": { post: expect.any(Object) },
    });
  });

  it("only uses resolvable local references", () => {
    const references = JSON.stringify(openApiDocument).match(
      /#\/components\/(?:schemas|parameters)\/[^"}]+/g,
    );

    for (const reference of new Set(references ?? [])) {
      const resolved = reference
        .slice(2)
        .split("/")
        .reduce<unknown>((value, key) => {
          if (!value || typeof value !== "object") return undefined;
          return (value as Record<string, unknown>)[key];
        }, openApiDocument);

      expect(resolved, `${reference} should resolve`).toBeDefined();
    }
  });
});
