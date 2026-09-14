# App Store listing

The listing is code, not clicks. `texts.py` holds the copy, `push.py` writes it
to App Store Connect, and `Scripts/capture-screenshots.sh` produces the images.
Re-running any of them replaces what is there rather than adding to it.

```bash
export ASC_KEY_ID=XXXXXXXXXX
export ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
export ASC_APP_ID=6811688174

../Scripts/capture-screenshots.sh     # 5 PNGs at 1320x2868 into screenshots/
python3 push.py                       # categories, texts, and screenshots
python3 push.py --texts-only          # or just one half
```

## What is set

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| Primary category   | Medical                                                 |
| Secondary category | Health & Fitness                                        |
| Name               | MeinBefund (en-GB)                                      |
| Subtitle           | Read your lab report                                    |
| Privacy policy URL | `ma3u.github.io/.../meinbefund/privacy.html`            |
| Support URL        | the GitHub issue tracker                                |
| Screenshots        | 5, 6.9-inch, from `DemoSeed`, not committed (see below) |

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

## The German listing is written but not live

`texts.py` contains the full German copy. It is not pushed, because the App
Store name is reserved per locale across all developer accounts and
"MeinBefund" is held by someone else for `de-DE`:

```
409 ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE.DIFFERENT_ACCOUNT
    The app name you entered is already being used.
```

A `de-DE` listing needs a German store name that is free. Add it to
`APP_NAME` in `texts.py` and re-run `push.py`, and the copy goes with it.

This changes nothing about the app's own language: iOS picks that from the
device, so a German phone shows the German app whichever store locale it came
from. `Scripts/check-localization.sh` keeps both languages complete.
