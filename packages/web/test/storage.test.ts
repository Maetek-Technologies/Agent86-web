// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clampSidebar,
  cleanTitle,
  loadSidebar,
  localTitles,
  saveSidebar,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  takeLegacyDefaultMode,
  TITLE_MAX,
} from "../src/threads/storage.ts";

beforeEach(() => window.localStorage.clear());

describe("sidebar layout", () => {
  it("keeps the width within its limits", () => {
    expect(clampSidebar(10)).toBe(SIDEBAR_MIN);
    expect(clampSidebar(10_000)).toBe(SIDEBAR_MAX);
    expect(clampSidebar(300.4)).toBe(300);
    expect(clampSidebar(Number.NaN)).toBe(SIDEBAR_DEFAULT);
  });

  it("remembers the width and whether the panel is shown", () => {
    expect(loadSidebar()).toEqual({ width: SIDEBAR_DEFAULT, shown: true });
    saveSidebar({ width: 400, shown: false });
    expect(loadSidebar()).toEqual({ width: 400, shown: false });
    window.localStorage.setItem("agent86web.sidebar.v1", JSON.stringify({ width: 9999 }));
    expect(loadSidebar()).toEqual({ width: SIDEBAR_MAX, shown: true });
  });
});

describe("cleanTitle", () => {
  const zeroWidth = String.fromCharCode(0x200b);
  const rtlOverride = String.fromCharCode(0x202e);
  it("keeps one trimmed line without invisible characters, capped", () => {
    expect(cleanTitle("  Release prep  ")).toBe("Release prep");
    expect(cleanTitle("first line\nsecond line")).toBe("first line");
    expect(cleanTitle(`a${zeroWidth}b${rtlOverride}c${String.fromCharCode(7)}`)).toBe("abc");
    expect(cleanTitle("x".repeat(500))).toHaveLength(TITLE_MAX);
    expect(cleanTitle("   \n  ")).toBe("");
  });
});

describe("local titles", () => {
  it("waits for agent86, then gives way to its list", () => {
    localTitles.set("s1", "Mine");
    expect(localTitles.get("s1")).toBe("Mine");
    expect(localTitles.pending("s1")).toBe("Mine");
    localTitles.synced("s1", "Mine", 1000);
    expect(localTitles.pending("s1")).toBeUndefined();
    // An older list (agent86-web's short cache) does not undo the name.
    localTitles.seen("s1", "Old name", 2000);
    expect(localTitles.get("s1")).toBe("Mine");
    // Once agent86's list carries it, the local copy goes.
    localTitles.seen("s1", "Mine", 3000);
    expect(localTitles.get("s1")).toBeUndefined();
  });

  it("lets agent86's newer name win after a while", () => {
    localTitles.set("s2", "Mine");
    localTitles.synced("s2", "Mine", 1000);
    localTitles.seen("s2", "Renamed at a terminal", 60_000);
    expect(localTitles.get("s2")).toBeUndefined();
  });

  it("keeps a name agent86 never took (older agent86)", () => {
    localTitles.set("s3", "Mine");
    localTitles.seen("s3", "agent86's title", 60_000);
    expect(localTitles.get("s3")).toBe("Mine");
  });
});

describe("the 0.2.0 default mode", () => {
  it("is handed over once, then forgotten", () => {
    expect(takeLegacyDefaultMode()).toBeUndefined();
    window.localStorage.setItem("agent86web.prefs.v1", JSON.stringify({ mode: "deny" }));
    expect(takeLegacyDefaultMode()).toBe("deny");
    expect(window.localStorage.getItem("agent86web.prefs.v1")).toBeNull();
    expect(takeLegacyDefaultMode()).toBeUndefined();
  });

  it("ignores agent86's default and unknown values", () => {
    for (const mode of ["default", "yolo", 3]) {
      window.localStorage.setItem("agent86web.prefs.v1", JSON.stringify({ mode }));
      expect(takeLegacyDefaultMode()).toBeUndefined();
    }
  });
});
