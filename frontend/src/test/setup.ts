import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return 1280;
  },
});

Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return 720;
  },
});

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    width: 1280,
    height: 720,
    top: 0,
    left: 0,
    right: 1280,
    bottom: 720,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  } as DOMRect;
};
