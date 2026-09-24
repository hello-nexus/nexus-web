# Avatar runtime (vendored)

`pack/` and `runtime/` are vendored verbatim from `nexus-avatar-web`
(`src/pack/**` and `src/runtime/**`), the standalone three.js runtime for
Unity-exported toon avatar packs. The pack contract is documented there in
`docs/pack-format.md`.

Do not hand-edit these two directories. Port a fix or a feature upstream in
`nexus-avatar-web`, then re-copy `src/pack/**` and `src/runtime/**` here
unchanged so the two trees stay in lockstep.

Everything else under `src/sandbox/ui/avatar*` (`avatarSession.ts`,
`avatarProps.ts`, `AvatarComposite.tsx`) is nexus-web's own host-side glue: it
dynamically imports this vendored runtime so the `three` dependency never
reaches the main dashboard bundle (see `AvatarComposite.tsx`).
