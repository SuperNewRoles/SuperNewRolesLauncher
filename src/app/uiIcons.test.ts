import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiIcon } from "./UiIcon";
import { getUiIconContent, getUiIconElements } from "./uiIcons";

describe("getUiIconElements", () => {
  it("converts trusted icon markup into typed SVG elements", () => {
    const elements = getUiIconElements("check-circle");

    expect(elements).toEqual([
      { tag: "circle", attributes: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attributes: { d: "m9 12 2 2 4-4" } },
    ]);
    expect(getUiIconContent("check-circle")).toContain("<circle");
  });

  it("renders parsed elements as SVG children", () => {
    const markup = renderToStaticMarkup(createElement(UiIcon, { name: "check-circle", size: 18 }));

    expect(markup).toContain('<circle cx="12" cy="12" r="10"></circle>');
    expect(markup).toContain('<path d="m9 12 2 2 4-4"></path>');
  });
});
