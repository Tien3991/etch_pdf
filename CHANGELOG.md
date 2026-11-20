# Changelog

User-visible changes to Etch, one line per change, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic
versioning. Entries accumulate under Unreleased and move under a version
heading at release; the same lines become the GitHub release notes.

## Unreleased

## 0.4.0 - 2026-11-20

### Added

- A choice of apps. The button on a PDF or image is now split in two: the
  left half opens the file in the default app, and the right half lists
  every app for a one-off choice.
- Apps opened by a shortcut. Add an editor such as Xodo or PDF Viewer in
  settings, with the name of a shortcut that opens a file in it, and it
  joins the list.
- "Other app (share sheet)" in the list: shows the share sheet, where you
  pick the app.
- "Mark up with Pencil in another app" in the command palette and the file
  menu, for the same list without the button.

### Changed

- The "Handoff route" setting is now "Default app". A choice made before the
  update is kept.

## 0.3.1 - 2026-11-20

### Removed

- The page forwarding experiment, with its "Page in link" setting and the
  "Show detected page" command. On iPadOS 18.7.8 the Files viewer opened on
  page 1 with the page in the link, so the setting had nothing to offer.
  Etch PDF now behaves exactly like Etch 0.2.0.

## 0.3.0 - 2026-11-20

First release of the Etch PDF fork. Handoffs are unchanged from Etch 0.2.0
unless the experiment below is switched on.

### Added

- Page forwarding experiment: with debug logging on, a new "Page in link"
  setting appends the page shown in the PDF view to the handoff link, as
  `#page=N` or `?page=N`. It is off by default and unproven: no viewer is
  known to honour it yet.
- "Show detected page" command, available while debug logging is on: reports
  the page the plugin reads from the open PDF, and how it read it.

### Changed

- The plugin id is now `etch-pdf` and its name Etch PDF, so it installs
  beside the original Etch instead of replacing it.

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
