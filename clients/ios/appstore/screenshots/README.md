# App Store screenshots

The PNGs themselves are not committed, and should not be. `clients/ios/.gitignore`
blocks every image in this tree so that a real lab report can never be added by
accident, and these five are regenerated exactly by one command, so there is
nothing to gain by punching a hole in that rule at the precise path where
someone would be most tempted to drop a real screenshot.

```bash
../../Scripts/capture-screenshots.sh        # writes the five PNGs here
python3 ../push.py --screenshots-only       # uploads them
```

Every value in these images is invented, from `Sources/MeinBefund/DemoSeed.swift`:
a fictional practice, fictional analytes, fictional numbers. That is what makes
them allowed to be here at all. The rule in `clients/ios/README.md` is absolute:

> No health data in this directory, ever. No lab reports, no scans, no exported
> HealthKit archives, no screenshots containing real values, not even
> temporarily, not even gitignored.

A screenshot of a real panel would break that rule and then get published to
the App Store, which is the worst possible order for those two things to happen
in. If you need a new screenshot, extend `DemoSeed`, do not photograph a real
report.

The size is 1320x2868, the 6.9-inch iPhone. App Store Connect accepts that or
1290x2796 for `APP_IPHONE_67`, and nothing else: 1284x2778 is taken by the API,
uploaded, and only then marked `FAILED` with `IMAGE_INCORRECT_DIMENSIONS`.
