import { describe, expect, it } from "vitest";
import { withUtf8Charset } from "../site/charset";

const typeOf = (type: string) =>
  withUtf8Charset(new Response("x", { headers: { "content-type": type } })).headers.get("content-type");

describe("withUtf8Charset", () => {
  it("adds the charset to HTML and other text types", () => {
    expect(typeOf("text/html")).toBe("text/html; charset=utf-8");
    expect(typeOf("application/xml")).toBe("application/xml; charset=utf-8");
    expect(typeOf("text/plain")).toBe("text/plain; charset=utf-8");
  });

  it("keeps a charset that is already named", () => {
    expect(typeOf("text/html; charset=ISO-8859-1")).toBe("text/html; charset=ISO-8859-1");
  });

  it("leaves binary types alone", () => {
    expect(typeOf("image/png")).toBe("image/png");
    expect(typeOf("application/pdf")).toBe("application/pdf");
  });

  it("passes a response without a type through", () => {
    const frozen = Response.redirect("https://tracht-digital.de/", 301);
    expect(withUtf8Charset(frozen)).toBe(frozen);
  });

});
