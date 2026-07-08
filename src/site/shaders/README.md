# Bundled shader copies

`_prelude.frag` and `plasma.frag` are byte-for-byte copies of
`nexus-service/src/Lighting/Engine/Gpu/Shaders/{_prelude,plasma}.frag`. The
service composes `prelude + "\n" + body` (`ShaderLibrary.cs`) and serves the
result at `/lighting/shaders/<name>`; the marketing site has no local service,
so `src/site/main.tsx` performs the same concatenation and primes the client
shader cache (`primeShaderSource` in `src/api/lighting.ts`).

Re-copy both files when the nexus-service originals change.
