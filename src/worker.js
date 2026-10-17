import { route } from "./router.js";
import { mockModel, mockFetch } from "./audit/mock.js";

export default {
  async fetch(request, env, ctx) {
    const deps = env.MOCK_ENGINE === "1" ? { model: mockModel, fetchImpl: mockFetch } : {};
    const handled = await route(request, env, ctx, deps);
    if (handled) return handled;
    return env.ASSETS.fetch(request);
  },
};
