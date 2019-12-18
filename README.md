# Trailcap

DNSTrail uses `iframes` as screenshots.  Trailcap pre-processes them for us.

To make this fast and secure, there are a few things we need to do:

  * The `iframe` HTML shouldn't have any sensitive information left over from when we captured it,
    like hidden `form` elements holding sessions IDs.
  * The iframe HTML file should be completely self-contained (inline styles, images).
  * The iframe HTML should not include any javascript (and it's displayed with the `sandbox`
    attribute anyway)
  * the iframe should be as small as possible.

Trailcap brute-force minimizes an HTML file.  It uses puppeteer to render screenshots while it tries
to remove:

  * Each DOM element
  * Each attribute
  * Each member of a "class" attribute.

It only considers a modification a success if the result of a render is a pixel-perfect match for
the original file.

Basically, it trys to reduce an HTML file to the minimum required to maintain its visual
presentation.

## Trailcap is *slow*, by design.

This is really unavoidable.  Every modification triggers a Blink render, PNG generation, and an
image compare.  On my maxed-out 2017 iMac, the Cloudflare admin page (~90K) takes about 5 minutes to
process, and gets the page down to 38K.

The CNN homepage (1.2MB) takes much longer (1h), and is reduced to 80K.

## Workflow

  1. Load the page you'd like to capture in Chrome.
  2. Use Devtools Inspector to edit visual things you'd like (example.com, user@example.com).
     Obscure API keys, any domain and usernames, etc.
  3. Export the HTML file with the "SinglePage" Chrome extension.  This inlines images, styles, and
     removes Javascript.
  4. Run that file through Trailcap.  Wait 15 to 20 hours.
  6. Use DNSTrail's interactive editor to mark-up your PageCap.

## Usage

*Note, I haven't converted this to an installable executable yet, it's just index.js, but the rest
of the command line usage should be accurate.*

```
trailcap [--verbose] [--dump] [--diff] [--show] [--phase phase0] inputfile.html
```

  * `--verbose` (or `-V`) prints activity to STDERR while it operates.
  * `--dump` (or `-d`) will write `snap-%d.png` images every time a modification is attempted, and
    before it's compared to the pristine initial page.  `pristine.png` is also generated.
  * `--diff` (or `-D`) will write a `diff-%d.png` image for each modification it makes that does not
    match the pristine page.
  * `--show` (or `-s`) Will take puppeteer out of headless mode so you can see what its doing.  This
    can lead to false-positives, as if you interact with that instance of Chrome, it'll be caught
    by puppeteer's screenshot (including scrolling)
  * `--phase PHASE` (or `-p`) selects the phases trailcap will use.  `PHASE` must be one of
    `denode`, `deattribute`, `declass`, `purgecss` or `minify`.

    The `--phase` option may be given multiple times, and defaults to `--phase denode --phase deattribute`.

    Note that the `declass` phase is particularly slow, but normally very useful.  `purgecss` and
    `minify` are pretty fast, but mangle the output enough to make it hard to reason with.
