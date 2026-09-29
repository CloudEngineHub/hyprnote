import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { installReactScan } from "./react-scan";
import { ReactScanControls } from "./react-scan-controls";
import {
  registerReactTools,
  resetReactToolsForTests,
  updateReactTools,
} from "./react-tools";

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  outlines: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock("./render-tracker", () => ({ setRenderOutlinesEnabled: vi.fn() }));
vi.mock("./react-scan", () => ({ installReactScan: vi.fn() }));
vi.mock("./scan-panel", () => ({
  ScanPanel: () => <section aria-label="Scan details" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetReactToolsForTests();
  vi.mocked(installReactScan).mockImplementation(() => {
    const unregister = registerReactTools({
      setToolbarVisible: (toolbarVisible) =>
        updateReactTools({ toolbarVisible }),
      setOutlinesEnabled: mocks.outlines,
      setInspecting: mocks.inspect,
      setSettings: vi.fn(),
      readReport: () => [],
    });
    return () => {
      mocks.dispose();
      unregister();
    };
  });
});
afterEach(cleanup);

it("does not start instrumentation after unmounting during the import", async () => {
  const view = render(<ReactScanControls />);
  view.unmount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(installReactScan).not.toHaveBeenCalled();
});
