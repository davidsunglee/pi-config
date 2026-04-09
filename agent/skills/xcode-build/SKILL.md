---
name: xcode-build
description: Build and run Xcode projects. Handles xcodegen project generation, xcodebuild compilation, simulator management, and running apps on iOS/macOS simulators or natively. Use when building, running, testing, or troubleshooting Xcode projects.
---

# Xcode Build & Run

Skill for building and running Xcode projects using `xcodegen`, `xcodebuild`, and the iOS Simulator.

## Prerequisites

- Xcode with command-line tools installed
- `xcodegen` (installed via Homebrew: `brew install xcodegen`)
- A `project.yml` file for XcodeGen-based projects

## Workflow

### 1. Generate the Xcode Project (if using XcodeGen)

If the project has a `project.yml`, regenerate the `.xcodeproj` before building:

```bash
cd PROJECT_ROOT && ./scripts/generate.sh
```

Always regenerate after changing `project.yml`, adding/removing source files, or modifying build settings.

### 2. Build

Build for macOS (runs natively):
```bash
cd PROJECT_ROOT && ./scripts/build.sh macos
```

Build for iOS Simulator:
```bash
cd PROJECT_ROOT && ./scripts/build.sh ios
```

The build script:
- Auto-detects the `.xcodeproj` and scheme names from `project.yml`
- Outputs the build directory path on success
- Streams errors on failure for diagnosis

### 3. Run

Run the macOS app:
```bash
cd PROJECT_ROOT && ./scripts/run.sh macos
```

Run on iOS Simulator (boots simulator if needed):
```bash
cd PROJECT_ROOT && ./scripts/run.sh ios
```

Run on a specific iOS simulator by name:
```bash
cd PROJECT_ROOT && ./scripts/run.sh ios "iPhone 17 Pro"
```

### 4. List Available Simulators

```bash
cd PROJECT_ROOT && ./scripts/simulators.sh
```

### 5. Build Errors

When a build fails, the scripts output the full `xcodebuild` error log. Common fixes:
- **Missing files**: Regenerate the project with `./scripts/generate.sh`
- **Signing errors**: Ensure `CODE_SIGNING_ALLOWED: "NO"` in `project.yml` for simulator builds
- **Package resolution**: Delete derived data with `./scripts/clean.sh` and rebuild
- **Swift syntax errors**: Fix the source file indicated in the error output

### 6. Clean

Remove build artifacts and derived data:
```bash
cd PROJECT_ROOT && ./scripts/clean.sh
```

## Notes

- The build output goes to `PROJECT_ROOT/build/`
- macOS builds go to `build/Debug/` (or `Release/`)
- iOS simulator builds go to `build/Debug-iphonesimulator/`
- Always use the scripts from the skill directory with paths relative to PROJECT_ROOT
- When diagnosing build failures, read the error output carefully — `xcodebuild` errors include file paths and line numbers
