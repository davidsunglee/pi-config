# Xcode Build skill

Build, run, clean, and troubleshoot Xcode projects using XcodeGen, `xcodebuild`, and simulator helpers.

## When to use

Use when working on macOS or iOS projects that need Xcode project generation, compilation, simulator management, native runs, or build-error diagnosis.

## Prerequisites

- Xcode and command-line tools installed.
- `xcodegen` available, typically via `brew install xcodegen`.
- `project.yml` for projects managed by XcodeGen.

## Workflow

### Generate

If the project has `project.yml`, regenerate the `.xcodeproj` before building, especially after changing build settings or adding/removing files:

```bash
cd PROJECT_ROOT && ./scripts/generate.sh
```

### Build

```bash
cd PROJECT_ROOT && ./scripts/build.sh macos
cd PROJECT_ROOT && ./scripts/build.sh ios
```

The build script auto-detects project and scheme names from `project.yml`, streams errors, and reports the build directory on success.

### Run

```bash
cd PROJECT_ROOT && ./scripts/run.sh macos
cd PROJECT_ROOT && ./scripts/run.sh ios
cd PROJECT_ROOT && ./scripts/run.sh ios "iPhone 17 Pro"
```

The iOS path boots a simulator if needed.

### Simulators

```bash
cd PROJECT_ROOT && ./scripts/simulators.sh
```

### Clean

```bash
cd PROJECT_ROOT && ./scripts/clean.sh
```

## Troubleshooting focus

When a build fails, read the full `xcodebuild` output. Common causes include missing files that require project regeneration, signing settings, package-resolution issues that need derived-data cleanup, and Swift syntax errors at reported file/line locations.

## Script inventory

- `generate.sh` — run XcodeGen.
- `build.sh` — build macOS or iOS simulator targets.
- `run.sh` — run macOS apps or install/launch iOS simulator apps.
- `simulators.sh` — list available simulators.
- `clean.sh` — remove build artifacts and derived data.

## Files

- `SKILL.md` — workflow and troubleshooting instructions.
- `scripts/` — shell helpers for generation, build, run, simulator listing, and cleanup.
