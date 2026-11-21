# Changelog

User-visible changes to Etch, one line per change, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic
versioning. Entries accumulate under Unreleased and move under a version
heading at release; the same lines become the GitHub release notes.

## Unreleased

## 0.5.0 - 2026-11-21

Etch PDF is a fork of Etch, and this release is Etch 0.2.0 with one change.
Versions 0.3.0 to 0.4.1 of the fork were experiments kept on other branches;
nothing from them is in this release.

### Changed

- The handoff route is always the one chosen in settings. A file of 4 MB or
  more is no longer moved from Preview to the Files viewer, and the notice
  that explained the move is gone. Preview can lose markup on long PDFs, so
  check that your ink was saved.
- The plugin id is `etch-pdf` and its name Etch PDF, so it installs beside
  the original Etch.

### Removed

- For anyone updating from 0.4.1: the split button, the list of apps, apps
  opened by a shortcut, and the share sheet entry. They remain on the
  `app-targets` branch.

## 0.2.0 - 2026-08-11

### Added

- Images can be marked up the same way as PDFs: PNG, JPG, and JPEG files.
- The pencil icon now appears on an open image, and the file menu offers
  markup for supported images.
- A marked-up image now shows its new ink without restarting Obsidian, in
  notes and in the image view.

### Changed

- The Files viewer is now the default handoff route. On iPadOS 26.5.2, Apple's
  Preview app lost Pencil markup on long PDFs, while the Files viewer kept it
  on every document tested, including a 243 MB one.
- On the Preview route, files of 4 MB or more now open in the Files viewer
  anyway, with a notice, which keeps long documents off the route that loses
  them.
- A handoff now goes ahead when verification cannot be armed, with a notice,
  instead of being refused. Verification is a debug aid and should not cost
  anyone the feature.

### Fixed

- A debug log line that fails to write now raises a notice instead of
  failing silently, so an incomplete log cannot read as a complete one.
- A debug logging value that is not a true or false setting now reads as
  off, instead of switching logging on.
- The pencil button on a file view now carries an explicit accessible name.
- A settings file carrying an unexpected value no longer leaves the plugin
  reporting the same verification error on every launch.
- Disabling Etch moments after it starts no longer leaves a verification
  check waiting forever.

## 0.1.0 - 2026-08-08

### Added

- Mark up with Pencil: one tap opens a vault PDF in Apple Preview for
  Apple Pencil markup, and the ink saves into the same vault file.
- Tap points: a pencil icon on the PDF view, a file menu entry, and a
  command palette command.
- Handoff route setting: Preview (default), or the Files viewer where
  Markup and Open in Preview are one tap each.
- Debug logging toggle: a verbose on-device log, plus a Verify last
  handoff command that confirms by hash that the markup landed.
- Runs on iPad only; on other devices the plugin loads inert and the
  settings tab says why.
