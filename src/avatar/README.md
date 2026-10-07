# Avatar runtime (vendored)

`pack/` and `runtime/` are vendored from the avatar engine in the
`nexus-app-ina` repo (`src/pack/**` and `src/runtime/**`), the three.js runtime
for toon avatar packs. The pack contract is documented there in
`docs/pack-format.md`.

The copy here is generic and trails upstream on purpose: it keeps comments free
of app names and does not carry every upstream feature (lip sync and the
shadow-rig tracking are not ported). Make engine changes upstream first, then
port them by applying upstream's diff for `src/pack` and `src/runtime` onto this
tree (`git apply -p2 --directory=src/avatar --reject`), merging rejected hunks
by hand, and cover them with vitest here.

Everything else under `src/sandbox/ui/avatar*` (`avatarSession.ts`,
`avatarProps.ts`, `AvatarComposite.tsx`) is nexus-web's own host-side glue: it
dynamically imports this vendored runtime so the `three` dependency never
reaches the main dashboard bundle (see `AvatarComposite.tsx`).
