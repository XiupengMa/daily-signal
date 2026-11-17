import handler from 'vinext/server/fetch-handler';
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const result = await handler.fetch(request, env, ctx);
    const response = new Response(result.body, result);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('Content-Security-Policy', "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    return response;
  },
};
