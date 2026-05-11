// Minimal ambient types for the WebHID API (Chromium / Edge). These aren't in
// lib.dom.d.ts yet since WebHID is a WICG draft. Scope matches what we actually
// call; extend as needed. https://wicg.github.io/webhid/

export {};

declare global {
  interface Navigator {
    readonly hid?: HID;
  }

  interface HID extends EventTarget {
    requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
    getDevices(): Promise<HIDDevice[]>;
  }

  interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }

  interface HIDDevice extends EventTarget {
    readonly opened: boolean;
    readonly vendorId: number;
    readonly productId: number;
    readonly productName: string;
    readonly collections: HIDCollectionInfo[];
    open(): Promise<void>;
    close(): Promise<void>;
    forget(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
    sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
    receiveFeatureReport(reportId: number): Promise<DataView>;
  }

  interface HIDCollectionInfo {
    readonly usagePage: number;
    readonly usage: number;
    readonly type: number;
    readonly children: HIDCollectionInfo[];
    readonly inputReports: HIDReportInfo[];
    readonly outputReports: HIDReportInfo[];
    readonly featureReports: HIDReportInfo[];
  }

  interface HIDReportInfo {
    readonly reportId: number;
    readonly items: unknown[];
  }

  interface HIDConnectionEvent extends Event {
    readonly device: HIDDevice;
  }

  interface HIDInputReportEvent extends Event {
    readonly device: HIDDevice;
    readonly reportId: number;
    readonly data: DataView;
  }
}
