# Etch PDF

Native Apple Pencil markup for Obsidian PDFs and images.

Etch PDF is a fork of [Etch](https://github.com/nickarrow/etch) by Nick
Aretakis. It hands a file to the Files viewer or to Preview exactly as Etch
0.2.0 does, and adds a choice of apps. The button on a PDF or image is split
in two: the left half opens the file in the app you set as default, and the
right half lists every app. Beside the two viewers, that list can hold
editors such as Xodo or PDF Viewer, each opened through a shortcut you make
once, and an entry for the share sheet. See [Apps](#apps).

None of the added apps has been through a device session yet;
`docs/device-tests.md` holds the matrix, and until its rows are filled in the
added apps are unproven. An earlier experiment, forwarding the page shown in
Obsidian, was tried and closed; see
[Page forwarding](#page-forwarding-tried-and-closed). Where the text below
describes the Files viewer and Preview, it is upstream's description of Etch
0.2.0, unchanged. The plugin has its own id, `etch-pdf`, so it installs
beside Etch; keep only one of the two enabled, or every PDF gets two buttons.

One tap opens a vault PDF or image for Apple Pencil markup. Draw with the
Pencil, tap the check mark, and the ink is in the same vault file: visible
everywhere the file appears, and it travels with the file when it syncs or
moves.

## Limitations

- iPad only. On iPhone and desktop the plugin loads inert and its commands
  stay hidden.
- Requires iPadOS 26 and Obsidian 1.13.4 or later. Tested on iPadOS 26.5.2
  with Obsidian 1.13.4. Etch rests on undocumented iPadOS behavior, so each
  new iPadOS major is unverified until it has been re-checked.
- Local vaults only ("On My iPad"). Files anywhere else, including iCloud
  Drive vaults, are declined with a notice.
- Apple's Preview app loses Pencil markup on long PDFs, so Etch keeps large
  files away from it. On an iPad Pro running iPadOS 26.5.2, an 18 MB and a
  243 MB document, both several hundred pages, kept their markup through the
  Files viewer every time and lost it through Preview every time. Etch defaults
  to the Files viewer, and sends any file of 4 MB or more there even when
  Preview is the chosen route. File size is a rough stand-in for page count,
  which is what Preview actually struggles with, so a small file with many
  pages stays on Preview and is the gap in that rule. Use the Files viewer
  route if you work in one.
- Apple Preview must be installed for the Preview route; iPadOS allows
  deleting it, per Apple's documentation. What happens if Preview is absent is
  unverified.
- PDF, PNG, JPG, and JPEG files. Other formats are left alone. HEIC and TIFF
  are not formats Obsidian displays, so they are out of reach. SVG is excluded
  for good, since it is text and what a markup tool writes back into one is
  unverified.
- The command works on an open file, so the mobile toolbar is not a usable
  place for it: Obsidian 1.13.4 does not show that toolbar over a PDF view.
  Use the pencil icon, the file menu, or the command palette.
- Buttons on files embedded inside a note are not in this release.
- In the Files viewer, markup saves when you tap the check mark. Leaving
  without that tap leaves the file unchanged until you return and tap it
  (observed on iPadOS 26.5.2 with Obsidian 1.13.4).

## Why a handoff

Drawing tools inside Obsidian work on a canvas in the webview, and the
webview is the boundary: PencilKit, the ink framework behind Apple's own
apps, is native UIKit, and no plugin can ship it. Etch gets PencilKit by
handing the file to a viewer that has it. Obsidian keeps the vault, iPadOS
brings the Pencil, and the markup lands in the PDF as ordinary annotations
that later sessions can re-edit or erase. Strokes on an image were also
re-editable in a later session on iPadOS 26.5.2, which is an observation
rather than a promise: how Preview stores them is unverified, and Etch does
not depend on it.

## How it works

Etch is only the bridge. A tap resolves the file's absolute on-disk path
from Obsidian's public API, validates it, percent-encodes it into a URL, and
navigates exactly once; iPadOS then opens the document in the Files viewer
(`shareddocuments://`, the default route) or in Preview (`file://`). On these
two routes Etch makes no internal Obsidian API calls: both are ordinary web
navigation, and the path is parsed from what a public API returns. The share
sheet entry is the one exception, described under [Apps](#apps). One
disclosure applies:
how iPadOS handles these URLs from an app webview is undocumented behavior
with no API contract. If the OS or Obsidian ever changes any of this, Etch
shows an error notice and stays put; it never navigates on a path it could
not validate. In-place writes were established with hash-verified device
evidence; see `docs/spike/FINDINGS.md`.

## Usage

Three ways to start, all equivalent:

- tap the left half of the button on an open PDF or image, the half with the
  pencil and the app's name,
- choose "Mark up with Pencil" from the file's long-press menu,
- run the "Mark up with Pencil" command from the command palette.

Each opens the file in the default app. To use another app once, tap the
right half of the button and pick from the list, or choose "Mark up with
Pencil in another app" from the file menu or the command palette. Picking
from the list does not change the default.

With the Files viewer as the default, the file opens in the Files viewer. Tap Markup, draw with the Pencil, then tap
the check mark, which is what saves. Switch back to Obsidian and the ink is in
the file. That viewer also offers "Open in Preview", which is worth avoiding
for the reason in Limitations.

On the Preview route instead, draw with the Pencil and switch back to
Obsidian; there is nothing to tap, and Preview writes the file about half a
second after you leave it (observed on iPadOS 26.5.2). Large PDFs still open in
the Files viewer, with a notice saying why.

After a markup, the PDF view and any
embeds of it refresh on their own (observed on iPadOS 26.5.2 with Obsidian
1.13.4; see `docs/spike/FINDINGS.md`). Images need help with that: Obsidian
keeps serving the picture it already cached, so Etch gives a changed image a
fresh address wherever it is drawn, which brings the new ink into view
without restarting the app (mechanism established on iPadOS 26.5.2; see
session 6 in `docs/spike/FINDINGS.md`). If Obsidian restarts while you are
away, Etch re-checks the file on the next launch and shows a notice if the
markup landed.

## Settings

- Default app. What the left half of the button opens. "Files viewer
  (default)" opens the file in the Files viewer, where Markup is one tap and
  the check mark saves. "Preview" opens it directly in Preview, which is
  smoother on small files since it saves without a tap, and any file of 4 MB
  or more still goes to the Files viewer. The list also holds every app
  added below, and "Other app (share sheet)". If one way ever stops working
  after an OS update, the others are the fallback.
- Apps opened by a shortcut. The editors you add, each with its name and the
  name of the shortcut that opens a file in it. "Add app" offers Xodo and PDF
  Viewer as starting points, or an empty entry. "Edit" on a row changes or
  removes it. See [Apps](#apps) for making the shortcut.
- Debug logging. Writes a verbose log to the plugin folder and enables the
  "Verify last handoff" command, which re-hashes the last handed-off file
  and reports whether its content changed. When off, errors go to the
  console only. Verification reads the whole file to hash it, so on a very
  large file it can be unavailable; the handoff still happens, and a notice
  says the check was skipped.

## Apps

The right half of the button, and the default-app setting, list four kinds
of destination.

| Destination | How the file gets there | Evidence so far |
| --- | --- | --- |
| Files viewer | A `shareddocuments://` link, as in Etch | Upstream's device sessions on iPadOS 26.5.2 |
| Preview | A `file://` link, as in Etch | Upstream's device sessions on iPadOS 26.5.2 |
| An app you add, such as Xodo | Runs your shortcut, which opens the file in that app | None yet |
| Other app (share sheet) | Shows the share sheet; you pick the app | Upstream's spike saw Preview write in place through it; no other app yet |

Why an editor needs a shortcut or the share sheet: iPadOS gives a plugin no
way to say "open this file in that app" unless the app offers a link for it,
and none of the editors checked does. PDF Expert documents a link for files
in its own storage only; Xodo and PDF Viewer document none. PDF-XChange has
no iPad app at all, according to its own support forum in August 2025, so it
cannot be on the list.

### Making a shortcut

Once per app, in the Shortcuts app on the iPad:

1. Create a shortcut. Its name is what you enter as the shortcut name in
   Etch, for example "Open in Xodo"; the two have to match exactly.
2. Add the action "Get File from Folder".
   - Tap the folder and choose the vault: On My iPad, Obsidian, then the
     vault's own folder.
   - Tap the path and pick **Shortcut Input** from the bar above the
     keyboard. It has to be picked, so that it shows as a variable; typing
     the words does not work.
   - The action then reads: *Get file from (vault) at path Shortcut Input*.
     Leave "Error If Not Found" on.
3. Add the action "Open File" right below it, and set its app to the editor.
   It then reads: *Open File in (editor)*, where File is the result of step 2.

Start the shortcut from Etch, not with the play button in Shortcuts. Only
Etch tells it which file to open; started on its own it has no file name.

Etch runs the shortcut by the documented `shortcuts://run-shortcut` link and
passes it the file's path inside the vault. The Shortcuts app comes to the
front for a moment on the way. The action and field names above are the ones
Shortcuts ships with; how the action behaves on an iPad is what the device
matrix is for.

If it fails, the message says where:

| Message from Shortcuts | What it means |
| --- | --- |
| "(Editor) is not installed or could not open the file (your vault's name)" | The shortcut handed the editor the vault folder, because the path in step 2 was empty. Either Shortcut Input is not picked as the path, or the shortcut was started from inside Shortcuts. |
| "No item was found at path: …" | The path arrived but nothing is there: the folder in step 2 is not the vault's own folder. |
| "(Editor) is not installed or could not open the file (the PDF's name)" | The right file arrived and the editor did not take it. Use "Other app (share sheet)" for that editor. |

### What to check with an editor

Whether ink lands in the vault file is up to the editor. An editor that
opens the file in place writes into the vault file, like the Files viewer
does. An editor that imports a copy leaves the vault file untouched, and the
ink stays inside that app. Turn on debug logging, hand a file off, write on
it, come back, and run "Verify last handoff": "content changed" means the
vault file was written. Do this once per editor before trusting it with
anything.

### The share sheet and Obsidian's internals

"Other app (share sheet)" calls `app.openWithDefaultApp`, the function behind
Obsidian's own Share item. It is not part of the public API, and it is the
only internal call Etch PDF makes; it lives alone in `src/native.ts`. If a
future Obsidian removes it, that entry shows a notice and does nothing, and
every other destination keeps working. Upstream measured this function in
its spike (`docs/spike/FINDINGS.md`, experiments e4 and e1d) and chose not to
ship it; this fork ships it because it is the one way to reach an editor
with no setup.

## Page forwarding: tried and closed

The goal was for the viewer to open on the page you were reading in Obsidian
instead of on page 1. Version 0.3.0 carried it as an experiment; 0.3.1 removed
it. The record, so nobody has to repeat the work:

- Reading the page works. A reader took it from the PDF view at the moment of
  the tap: the toolbar's page box, the page label when the PDF has labels
  such as "iv", and failing both, whichever page fills most of the view. It
  matched the viewer's own page in every case checked in Obsidian 1.15.1.
  That code is in the `0.3.0` tag, in `src/page.ts`.
- Passing the page in the link does not work. With `#page=N` or `?page=N`
  appended to the handoff link, the Files viewer on iPadOS 18.7.8 still
  opened on page 1.
- A start page stored inside the PDF does not work either. macOS 26.5.1
  PDFKit opened a test document on page 1 with its OpenAction pointing at
  page 5, in three forms, and Etch does not write to your files in any case.

So the Files viewer, handed the whole file, could not be told where to open
it: not by the link on iPadOS 18.7.8, and going by PDFKit on macOS, not by
the file either. The Preview app that iPadOS 26 adds was not tested.
`docs/device-tests.md` has the details.

Two things would land on the right page, and neither is built here. One is
handing off only the page being read, as a one-page PDF, and merging the ink
back afterwards; that makes the plugin rewrite the vault file, which Etch has
never done. The other is an editor with a go-to-page box, with the page
number copied for pasting.

## Data safety

Etch hands the viewer the real vault file, and the viewer rewrites it in
place. Obsidian's File Recovery does not snapshot binary attachments, so keep
your own backup of any file you cannot afford to lose. This matters more for an
image than for a PDF: PDF ink arrives as annotation objects a later session
can erase, while an image comes back as a new picture. Your markup never
lives in Etch: it is written into the file itself, readable in any app that
opens that format, so uninstalling Etch loses nothing. Etch itself only reads
your files: verification hashes bytes, and its settings and debug log live
in the plugin's own folder. Etch makes no network requests, which is
verifiable in the source.

The paragraph above is about the Files viewer and Preview. An editor reached
through a shortcut or the share sheet decides for itself whether it writes
the vault file or keeps a copy of its own; see
[What to check with an editor](#what-to-check-with-an-editor).

## Install

Etch PDF is not in the community plugin directory.

- BRAT: install the BRAT community plugin and add `Tien3991/etch_pdf` as a
  beta plugin. BRAT installs the highest version published, release or
  pre-release.
- Manual: copy `main.js`, `manifest.json`, and `styles.css` from a release
  into `<vault>/.obsidian/plugins/etch-pdf/`, then enable Etch PDF under
  community plugins.

If the original Etch is installed, disable it while Etch PDF is enabled.

## License

0BSD. See `LICENSE`.
