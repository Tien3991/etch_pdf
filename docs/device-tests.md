# Page forwarding: tests and evidence

The question this file answers: can the viewer Etch hands a PDF to be made to
open on the page that was showing in Obsidian?

A row counts as evidence only when someone did the step on a device and
wrote down what they saw. Desk checks on a Mac are listed separately, because
they show what the plugin does and not what iPadOS does with it.

## Device matrix

Setup: install Etch PDF, disable the original Etch, and turn on Debug logging
in the plugin's settings. Open a PDF of ten pages or more and scroll to a
page N well away from page 1.

| # | Do | Expect to learn | Result |
| --- | --- | --- | --- |
| D0 | Command palette: "Show detected page" | The notice names page N. Repeat on a PDF whose first pages are numbered i, ii, iii. | not run |
| D1 | Page in link: Off. Tap the pencil. | The PDF opens in the Files viewer as before (regression check). | not run |
| D2 | Page in link: `#page=N`. Tap the pencil. | Does the PDF still open? On which page? | not run |
| D3 | Page in link: `?page=N`. Tap the pencil. | Does the PDF still open? On which page? | not run |
| D4 | Handoff route: Preview, a PDF under 4 MB. Repeat D2 and D3. | Same two answers for the `file://` link. | not run |

Record for each row: the date, iPadOS and Obsidian versions, what opened, and
the page it opened on. With Debug logging on, `etch-debug.md` in the plugin
folder holds the exact link each tap fired.

If D2, D3 and D4 all open on page 1, the link cannot carry a page to these
viewers, and the experiment setting should be removed rather than left in.

## Reported by the tester, not yet witnessed

These were reported by the tester on 2026-11-20, before this build existed,
on iPadOS 18.7.8, with no log or hash behind them. They are context for the
matrix, not results.

- Files viewer route: the PDF opens in the Files viewer and Markup saves
  into the vault file.
- Preview route: the PDF opens in the Files viewer as well. iPadOS 18 has no
  Preview app. Whether this was the `file://` link itself or the 4 MB
  override sending the file to the Files viewer is not known; D4 uses a small
  file to tell the two apart.

## Desk checks (macOS, 2026-11-20)

### A start page stored in the PDF is ignored by PDFKit

macOS 26.5.1 (25F80). A six-page PDF was built in memory, each page showing
its number, and loaded into a `PDFView` in single-page and continuous modes.

| Catalog entry | Page shown |
| --- | --- |
| none (control) | 1 |
| `/OpenAction [page5 /Fit]` | 1 |
| `/OpenAction << /S /GoTo /D [page5 /Fit] >>` | 1 |
| `/OpenAction << /S /GoTo /D [page5 /XYZ 0 792 0] >>` | 1 |

CoreGraphics reported the OpenAction entry present in every non-control
document, so the entry was read and not acted on. This is macOS PDFKit, not
the iPadOS Files viewer; it is the same engine family, which makes an in-file
start page a poor bet there too. Etch does not write to vault files, so this
path was never going to ship; the check is recorded so nobody has to wonder.

### The page reader, in Obsidian 1.15.1

The built plugin (0.3.0) ran in desktop Obsidian 1.15.1 on a scratch vault,
and "Show detected page" was compared with pdf.js's own current page in 21
cases. All 21 matched.

| PDF | Cases | Read through |
| --- | --- | --- |
| 12 pages, no labels | jump to 1, 2, 7, 12; five scroll steps of 0.3 page; 200% zoom, then 500 px further; 30% zoom with several pages on screen | toolbar box; geometry agreed every time |
| 12 pages labelled i to iv, then 1 to 8 | pages 1, 3, 5, 6, 12 | label (the box showed "i", "iii", "1", "2", "8") |
| 6 pages labelled 1, 2, 3, 1, 2, 3 | pages 2, 5 | geometry, since each label names two pages |
| 12 pages, open in two tabs | active tab on 10, then the other tab on 3 | toolbar box of the active tab |

The command stayed unavailable with debug logging off and with a note
active, and the handoff commands and the pencil stayed hidden on desktop.

### The link that a tap builds

Same build and vault. The iPad-only ends were replaced by stand-ins: the
Capacitor resource URL the resolver parses, and `window.open`. The code
between them is what ships.

| Setting | Page showing | Link fired |
| --- | --- | --- |
| `#page=N` | 7 | `file:///…/vault/plain-12.pdf#page=7` |
| `?page=N` | 11 | `file:///…/vault/plain-12.pdf?page=11` |
| Off | 11 | `file:///…/vault/plain-12.pdf` |
| `#page=N`, debug logging off | 11 | `file:///…/vault/plain-12.pdf` |
| `#page=N`, started without a view (command path) | 4 | `file:///…/vault/plain-12.pdf#page=4` |
| `#page=N`, labelled PDF showing label "2" | 6 | `file:///…/vault/labels-12.pdf#page=6` |
| `?page=N`, repeated labels | 5 | `file:///…/vault/repeat-6.pdf?page=5` |

The settings row for the experiment was hidden with debug logging off and
returned, with its stored value, when it was turned back on.
