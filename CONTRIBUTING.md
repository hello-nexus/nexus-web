# Contributing

## License

This repository is licensed under AGPL-3.0 (see [`LICENSE`](LICENSE)). By
contributing, you agree your contributions are licensed under AGPL-3.0 and the
terms in [`CLA.md`](CLA.md).

## Tested in the real app, or not merged

This bundle runs inside the desktop service and on physical panels. A change
that passes `npm test` and looks right in `npm run dev` has not been tested
until it has run in the service-embedded build on a real machine.

Every pull request that changes what ships (anything but docs and tests) must
have been built, run and tested by the contributor, on the contributor's own
machine, against a running nexus-service. There is no lab that does this for
you. A pull request without that is closed, whatever its size.

1. Build the embedded bundle (`npm run build:service`) and run it from the
   service, not only the vite dev server.
2. If the change touches a panel, overlay or phone surface, exercise it on
   that surface. If it touches a device page or a lighting control, exercise
   it with that device attached.
3. Fill in the Validation section of the pull request template. Write down
   what you observed, not what you expect.

If you cannot test a change in the real app, do not send it. Open an issue and
describe what you found.

## If an AI agent writes the change

The same rules apply, and the person who opens the pull request answers for
them. An agent cannot run the result on your machine, so the validation
section describes what you ran, on your machine, in your words. A pull request
whose validation text does not match what was run is closed.

## Standards

- One topic per pull request.
- `npm run lint`, `npm test` and `npm run audit:locales` pass locally. New
  behaviour comes with tests.
- No hard-coded UI strings. Every new or changed string goes through i18n and
  is translated in every `src/locales/*.json`, not left in English.
- Styles use the theme tokens; `npm run audit:styles` passes.
- Match the surrounding code. Do not reformat, rename or reorganize anything
  the change does not need.
- Keep `README.md` true. If the change alters how the app is built, run or
  laid out, update the README in the same pull request.
- Read every line you submit, generated or not, and be able to say why it is
  there.

## Workflow

1. Fork and branch from `main`.
2. Open the pull request against `main` and complete every section of the
   template.
3. Confirm in the pull request that you have read and agree to
   [`CLA.md`](CLA.md).
4. Answer review with new commits. After any change, test again and update
   the validation section.
