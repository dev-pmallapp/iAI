export interface PulseStatus {
  running: boolean;
  port: number;
}

export function currentStatus(): PulseStatus {
  return { running: false, port: 31337 };
}
