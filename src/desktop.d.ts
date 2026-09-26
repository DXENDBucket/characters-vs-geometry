interface Window {
  charsetDesktop?: {
    exportSave(text: string): Promise<boolean>;
    importSave(): Promise<string | null>;
    exportReplay?(text: string): Promise<boolean>;
    importReplay?(): Promise<string | null>;
    readonly runtime: { electron: string; chromium: string; v8: string; platform: string; arch: string };
    onBeforeClose(callback: () => boolean | Promise<boolean>): void;
  };
}
