import { APP_PAIRING_SETTINGS_MESSAGE } from "@gatchi/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_FRAME_READY_MESSAGE, CONTENT_SOURCE_ACTION_MESSAGE } from "./messages";

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;
type InstalledListener = () => void;

const fakeClient = vi.hoisted(() => ({
  connectAndPair: vi.fn(),
  onOriginalSubmitAllowed: vi.fn(),
  onQuizCommand: vi.fn(),
  onRoomState: vi.fn(),
  onSourceAction: vi.fn(),
  requestOriginalSubmit: vi.fn(),
  sendExtensionState: vi.fn(),
  sendOriginalFailure: vi.fn(),
  sendOriginalResult: vi.fn(),
  sendSourceActionFailure: vi.fn(),
  sendSourceMirror: vi.fn(),
  sendSourceWindow: vi.fn()
}));

vi.mock("./socketClient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./socketClient.js")>();
  return {
    ...actual,
    MachugiSocketClient: vi.fn(function MockMachugiSocketClient() {
      return fakeClient;
    })
  };
});

function resetFakeClient() {
  fakeClient.connectAndPair.mockResolvedValue({ roomCode: "ABC123" });
  fakeClient.onOriginalSubmitAllowed.mockReturnValue(vi.fn());
  fakeClient.onQuizCommand.mockReturnValue(vi.fn());
  fakeClient.onRoomState.mockReturnValue(vi.fn());
  fakeClient.onSourceAction.mockReturnValue(vi.fn());
  fakeClient.requestOriginalSubmit.mockResolvedValue(undefined);
  fakeClient.sendExtensionState.mockResolvedValue(undefined);
  fakeClient.sendOriginalFailure.mockResolvedValue(undefined);
  fakeClient.sendOriginalResult.mockResolvedValue(undefined);
  fakeClient.sendSourceActionFailure.mockResolvedValue(undefined);
  fakeClient.sendSourceMirror.mockResolvedValue(undefined);
  fakeClient.sendSourceWindow.mockResolvedValue(undefined);
}

function installChromeMock() {
  let runtimeListener: RuntimeListener | null = null;
  let installedListener: InstalledListener | null = null;

  const tabs = {
    onRemoved: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    query: vi.fn((queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
      const urls = Array.isArray(queryInfo.url) ? queryInfo.url : [queryInfo.url];
      if (urls.some((url) => typeof url === "string" && url.includes("machugi.io"))) {
        callback([{ id: 11, url: "https://machugi.io/quiz/example" } as chrome.tabs.Tab]);
        return;
      }
      callback([{ id: 22, url: "https://gatchi-machugi.up.railway.app/rooms/ABC123" } as chrome.tabs.Tab]);
    }),
    sendMessage: vi.fn((_tabId: number, _message: unknown, _options: chrome.tabs.MessageSendOptions, callback?: () => void) => {
      callback?.();
    }),
    update: vi.fn()
  };
  const scripting = {
    executeScript: vi.fn((_details: chrome.scripting.ScriptInjection<unknown[], unknown>, callback?: () => void) => {
      callback?.();
    })
  };
  const runtime = {
    lastError: undefined as chrome.runtime.LastError | undefined,
    onInstalled: {
      addListener: vi.fn((listener: InstalledListener) => {
        installedListener = listener;
      })
    },
    onMessage: {
      addListener: vi.fn((listener: RuntimeListener) => {
        runtimeListener = listener;
      })
    }
  };
  const storage = {
    local: {
      set: vi.fn((_items: Record<string, unknown>, callback?: () => void) => {
        callback?.();
      })
    }
  };

  vi.stubGlobal("chrome", {
    runtime,
    scripting,
    storage,
    tabs
  });

  return {
    get installedListener() {
      if (!installedListener) throw new Error("Expected an installed listener to be registered");
      return installedListener;
    },
    get runtimeListener() {
      if (!runtimeListener) throw new Error("Expected a runtime listener to be registered");
      return runtimeListener;
    },
    scripting,
    tabs
  };
}

async function loadBackground() {
  const chromeMock = installChromeMock();
  await import("./background");
  return chromeMock;
}

async function dispatchRuntimeMessage(listener: RuntimeListener, message: unknown, sender: chrome.runtime.MessageSender) {
  return await new Promise<unknown>((resolve) => {
    const handledAsync = listener(message, sender, resolve);
    if (handledAsync !== true) resolve(undefined);
  });
}

describe("background service worker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetFakeClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not navigate the current machugi source when the app resends pairing settings", async () => {
    const chromeMock = await loadBackground();

    await dispatchRuntimeMessage(
      chromeMock.runtimeListener,
      { type: CONTENT_FRAME_READY_MESSAGE, href: "https://machugi.io/quiz/example", title: "Quiz" },
      { frameId: 0, tab: { id: 11, active: true, url: "https://machugi.io/quiz/example" } as chrome.tabs.Tab }
    );
    chromeMock.tabs.sendMessage.mockClear();

    await dispatchRuntimeMessage(
      chromeMock.runtimeListener,
      {
        type: APP_PAIRING_SETTINGS_MESSAGE,
        payload: {
          serverUrl: "https://gatchi-machugi.up.railway.app",
          roomCode: "ABC123",
          hostCode: "#H0ST"
        }
      },
      { frameId: 0, tab: { id: 22, url: "https://gatchi-machugi.up.railway.app/rooms/ABC123" } as chrome.tabs.Tab }
    );

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        type: CONTENT_SOURCE_ACTION_MESSAGE,
        payload: expect.objectContaining({
          action: { name: "focusHome" }
        })
      }),
      expect.anything(),
      expect.anything()
    );
  });

  it("injects extension bridges into already-open tabs after install or update", async () => {
    const chromeMock = await loadBackground();

    chromeMock.installedListener();

    await vi.waitFor(() => {
      expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ["contentScript.js"],
          target: { tabId: 11, allFrames: true }
        }),
        expect.anything()
      );
      expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ["appBridge.js"],
          target: { tabId: 22, allFrames: false }
        }),
        expect.anything()
      );
    });
  });
});
