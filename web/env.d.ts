declare namespace Cloudflare {
  interface Env {
    BUCKET?: R2Bucket;
    RUNNER_TOKEN_SHA256?: string;
    DEMO_MODE?: string;
  }
}
