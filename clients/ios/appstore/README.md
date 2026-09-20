# App Store listing

The listing is code, not clicks. `texts.py` holds the copy, `push.py` writes it
to App Store Connect, and `Scripts/capture-screenshots.sh` produces the images.
Re-running any of them replaces what is there rather than adding to it.

```bash
export ASC_KEY_ID=XXXXXXXXXX
export ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
export ASC_APP_ID=6811688174

../Scripts/capture-screenshots.sh     # 5 PNGs at 1320x2868 into screenshots/
python3 push.py                       # categories, texts, TestFlight, screenshots
python3 push.py --texts-only          # or just one part
python3 push.py --testflight-only
```

## What is set

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| Primary category   | Medical                                                 |
| Secondary category | Health & Fitness                                        |
| Name               | Klarbefund, in both locales                             |
| Subtitle           | Read your lab report                                    |
| Privacy policy URL | `ma3u.github.io/.../meinbefund/privacy.html`            |
| Support URL        | the GitHub issue tracker                                |
| Screenshots        | 5, 6.9-inch, from `DemoSeed`, not committed (see below) |

## What a tester sees, which is not the listing

TestFlight shows its own texts, stored as different resources, and nothing was
writing them:

| What the tester sees    | Resource                 | Source in `texts.py` |
| ----------------------- | ------------------------ | -------------------- |
| The app's icon          | the uploaded build       | `AppIcon-1024.png`   |
| Description on the app  | `betaAppLocalizations`   | `BETA_DESCRIPTION`   |
| What to Test on a build | `betaBuildLocalizations` | `WHAT_TO_TEST`       |

So a tester group with no build shows no icon and no description: both come
from things that do not exist until an upload has been processed. `push.py`
writes the description whether or not a build exists, and attaches What to Test
to the newest build it finds.

`WHAT_TO_TEST` is rewritten per upload. It is what a tester is being asked to
look at, not a changelog.

The feedback address is read from `ASC_FEEDBACK_EMAIL` and left alone when
unset. App Store Connect shows it to every tester, and whose address that
should be is not a decision for a file in a repository.

The screenshot PNGs are deliberately absent from the repository.
`clients/ios/.gitignore` blocks every image in this tree so a real lab report
cannot be committed by accident, and these five are reproduced exactly by
`capture-screenshots.sh` from `DemoSeed`, so there is nothing to gain by
widening that rule.

## Three things that cost a round trip each

**`whatsNew` cannot be written on a first version.** App Store Connect rejects
the entire PATCH because of it rather than ignoring the field, so the
description and keywords silently fail to land alongside it. `push.py` never
sends it.

**A wrong-sized screenshot is accepted and then fails.** The API takes the
bytes, returns success, and only marks the asset `FAILED` with
`IMAGE_INCORRECT_DIMENSIONS` during processing, where nothing is watching. It
stays in the set looking fine and is dropped at submission. `push.py` checks
the PNG header before sending and waits for the processing verdict after.
`APP_IPHONE_67` accepts 1320x2868 and 1290x2796, and not 1284x2778, which is
the size Apple's own table lists for 6.5 inch.

**The marketing icon may not carry an alpha channel** (ITMS-90717), and that is
also only discovered after an upload, having consumed a build number.
`Scripts/archive-and-upload.sh` checks it before archiving.

## Picking a name

The App Store name is reserved per locale across every developer account, so a
name has to be free in every locale the app lists in. "MeinBefund" was free for
en-GB and held by someone else for de-DE, which would have left one app under
two names, and the German one is the name most of its users would have seen.

There is no availability endpoint. Probe instead: create an
`appInfoLocalization` for the locale with the candidate name, and delete it
straight away. A taken name answers

```
409 ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE.DIFFERENT_ACCOUNT
```

and a created row reserves nothing once deleted. Of fifteen German candidates,
Befundo, LabLens, Befundleser, Laborbuch, Meine Laborwerte and Klartext were
taken; Klarbefund was free in both locales and is the name.

The bundle id stays `red.mabu.meinbefund`. It carries the App Store record, the
TestFlight builds and the keychain items, and nobody ever sees it. So do the
Xcode target, the scheme and `Sources/MeinBefund/`. What people see is
`CFBundleDisplayName`, and that is Klarbefund.

`Scripts/check-localization.sh` keeps both languages complete. The app's own
language comes from the device, not from the store locale it was downloaded in.
