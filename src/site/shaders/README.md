# Bundled shader copies

Every `.frag` in this directory is a byte-for-byte copy of the same-named
file in `nexus-service/src/Lighting/Engine/Gpu/Shaders/` (`_prelude.frag`
plus one body per demo effect). The service composes `prelude + "\n" + body`
(`ShaderLibrary.cs`) and serves the result at `/lighting/shaders/<name>`; the
marketing site has no local service, so `src/site/main.tsx` performs the same
concatenation and primes the client shader cache (`primeShaderSource` in
`src/api/lighting.ts`).

Byte parity with the service originals is load-bearing (the demos advertise
"exactly as it runs in the app"). Re-copy any file here when its
nexus-service original changes, and add the copy when a new effect joins the
demo strip.
