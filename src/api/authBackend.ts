// Backend-agnostic shapes for the account auth flows (sign in, register,
// recovery, authenticated profile management). Two adapters implement
// AuthBackend: LocalServiceBackend (in-app, wraps the desktop service's
// /cloud/* routes - nexus-service holds the tokens) and DirectApiBackend
// (public web, talks to api.hellonexus.com directly - the browser holds the
// tokens). The flow components (SignInForm, CreateAccountForm,
// ForgotPasswordFlow, AccountAuthenticationSection, AccountDangerZoneSection)
// consume only this interface, so the same components render both surfaces.

export interface AuthEnvelope {
  error?: boolean;
  msg?: string;
}

export interface AuthAvatar {
  large: string;
  small: string;
}

export interface AuthAccount {
  accountId: string;
  email: string;
  username: string;
  avatar: AuthAvatar | null;
  isPrivate: boolean;
  emailVerified: boolean;
}

export type AuthLoginResponse = AuthEnvelope & Partial<AuthAccount>;
export type AuthRegisterResponse = AuthEnvelope;
export type AuthPasswordResponse = AuthEnvelope;
export type AuthDeleteResponse = AuthEnvelope;

export interface AuthUsernameResponse extends AuthEnvelope {
  retryAt?: string;
}

export interface AuthRecoveryStartResponse {
  grantId: string;
}

export type AuthRecoveryStatusValue = 'idle' | 'pending' | 'approved' | 'expired';

export interface AuthRecoveryStatusResponse {
  status: AuthRecoveryStatusValue;
}

export interface AuthFetchResult<T> {
  status: number;
  body: T | null;
}

export interface AccountDeviceItem {
  installId: string;
  hostname: string;
  specs: Record<string, string>;
  /** Client-added entry (no telemetry backing it) vs an auto-reported install. */
  manual: boolean;
  lastSeenAt: string;
}

export type AuthDeviceUpsertResponse = AuthEnvelope & Partial<AccountDeviceItem>;

export interface AuthBackend {
  login(identifier: string, password: string): Promise<AuthFetchResult<AuthLoginResponse>>;
  register(email: string, password: string, username: string): Promise<AuthFetchResult<AuthRegisterResponse>>;
  logout(): Promise<void>;
  getAccount(): Promise<AuthAccount | null>;
  recoveryStart(email: string): Promise<AuthRecoveryStartResponse | null>;
  recoveryStatus(): Promise<AuthRecoveryStatusResponse | null>;
  // Discards any client-held recovery grant when the user backs out of the
  // pending phase - only DirectApiBackend holds one (sessionStorage); the
  // in-app backend leaves grant custody to the service.
  recoveryCancel?: () => void;
  changePassword(currentPassword: string | undefined, newPassword: string): Promise<AuthFetchResult<AuthPasswordResponse>>;
  changeUsername(username: string): Promise<AuthFetchResult<AuthUsernameResponse>>;
  setPrivate(isPrivate: boolean): Promise<boolean>;
  deleteAccount(currentPassword?: string): Promise<AuthFetchResult<AuthDeleteResponse>>;
  uploadAvatar(blob: Blob): Promise<AuthAvatar | null>;
  // Device management (My devices) is a public-web-only affordance today:
  // nexus-api's /account/devices routes have no local-service proxy, so only
  // DirectApiBackend implements these. Optional so LocalServiceBackend (the
  // in-app dashboard) simply omits them - AccountDevicesSection renders
  // nothing when a backend leaves them undefined.
  listDevices?(): Promise<AccountDeviceItem[] | null>;
  upsertDevice?(installId: string, patch: { hostname: string; specs: Record<string, string>; manual?: boolean }): Promise<AuthFetchResult<AuthDeviceUpsertResponse>>;
  deleteDevice?(installId: string): Promise<boolean>;
}
