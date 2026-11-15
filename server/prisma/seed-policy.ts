export function assertDemoSeedAllowed(nodeEnv: string | undefined): void {
  if (nodeEnv === "production") {
    throw new Error("Demo seed is disabled in production");
  }
}
