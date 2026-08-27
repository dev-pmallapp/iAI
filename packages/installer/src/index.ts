export type Host = "claude" | "opencode" | "both";

export interface InstallOptions {
  host: Host;
  apply: boolean;
}

export function describeInstall(options: InstallOptions): string {
  return `install host=${options.host} apply=${options.apply}`;
}
