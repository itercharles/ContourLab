// Older Safari, jsdom, and a few enterprise browsers omit requestIdleCallback.
// TypeScript's lib.dom typings do include it, but our codebase guards the call
// at runtime — the augmentation here is purely so the optional-chain access
// pattern is idiomatic instead of a per-call cast.
//
// Hosted in /types so threeDScene.ts and ThreeDViewport.tsx don't need to
// repeat the inline `Window & { requestIdleCallback?: ... }` cast.

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

interface IdleRequestOptions {
  timeout: number;
}

declare global {
  interface Window {
    requestIdleCallback?: (
      callback: (deadline: IdleDeadline) => void,
      options?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  }
}

export {};
