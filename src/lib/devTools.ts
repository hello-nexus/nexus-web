// True in `vite dev` and in DEV_TOOLS=1 builds; statically false in prod/CI
// so esbuild dead-code-eliminates any branch guarded by this flag.
export const DEV_TOOLS = import.meta.env.DEV || __DEV_TOOLS__;
