import { describe, it, expect } from "vitest";
import { parseConfig, expandEnv, slugify, EXAMPLE_CONFIG } from "../src/index.js";

describe("config", () => {
  it("parses the example config", () => {
    const c = parseConfig(EXAMPLE_CONFIG, "/tmp");
    expect(c.title).toBe("My services");
    expect(c.monitors.map((m) => m.id)).toEqual(["website", "api-health", "postgres-port"]);
    expect(c.monitors[0]).toMatchObject({ type: "http", target: "https://example.com", expectStatus: [200], expectBody: "Example Domain", interval: 60, retries: 1 });
    expect(c.monitors[1]!.interval).toBe(30);
    expect(c.monitors[2]).toMatchObject({ type: "tcp", target: "db.example.com:5432" });
    expect(c.dataDir).toBe("/tmp/data");
  });

  it("expands ${VAR} from the environment and never stores the literal", () => {
    expect(expandEnv("Bearer ${TOKEN}", { TOKEN: "abc" })).toBe("Bearer abc");
    expect(expandEnv("Bearer ${MISSING}", {})).toBe("Bearer ");
    process.env.PW_TEST_TOKEN = "s3cret";
    const c = parseConfig("monitors:\n  - name: a\n    url: https://x.test\n    headers:\n      Authorization: Bearer ${PW_TEST_TOKEN}\n");
    expect(c.monitors[0]!.headers.Authorization).toBe("Bearer s3cret");
  });

  it("rejects bad input with helpful errors", () => {
    expect(() => parseConfig("title: x")).toThrow(/non-empty list/);
    expect(() => parseConfig("monitors:\n  - name: a\n    url: ftp://x")).toThrow(/http/);
    expect(() => parseConfig("monitors:\n  - name: a\n    type: tcp\n    host: x")).toThrow(/host and port/);
  });

  it("de-duplicates ids and clamps intervals", () => {
    const c = parseConfig("monitors:\n  - name: A\n    url: https://a\n    interval: 1\n  - name: a\n    url: https://b\n");
    expect(c.monitors.map((m) => m.id)).toEqual(["a", "a-2"]);
    expect(c.monitors[0]!.interval).toBe(10);
    expect(slugify("  Hello World! ")).toBe("hello-world");
  });
});
