# Trailcap

DNSTrail uses iframes as screenshots.  Trailcap pre-processes them.

To make this fast and secure, there are a few things we need to do:

  * The iframe shouldn't have any sensitive information.
  * The iframe HTML file should be completely self-contained (inline styles, images).
  * The iframe HTML should not include any javascript (it is displayed with the `sandbox`
    attribute)
  * the iframe should be as small as possible.

Trailcap brute-force minimizes an HTML file by using puppeteer to render screenshots while it tries
to remove:

  * Each DOM element
  * Each attribute
  * Each member of a "class" attribute.

It only considers a modification a success if the result of a render is a pixel-perfect match for
the original file.  Basically, it trys to reduce an HTML file to the minimum required to maintain
its visual presentation.

## Trailcap is *slow*, by design.

This is really unavoidable.  Every modification triggers a Blink render, PNG generation, and an
image compare.  On my (pretty bad-ass) 2017 iMac, the Cloudflare admin page (~90K) takes about 5
minutes to process, and gets the page down to 38K.

The CNN homepage (1.2MB) takes much longer (), and is reduced to XKB.

## Workflow

  1. Load the page you'd like to capture in Chrome.
  2. Use Devtools Inspector to edit visual things you'd like (example.com, user@example.com).
     Obscure API keys, any domain and usernames, etc.
  3. Export the HTML file with "SinglePage", the awesome Chrome extensions.  This inlines images,
     and styles, and removes Javascript.
  4. Run that file through Trailcap.  Wait 15 to 20 hours.
  6. Use DNSTrail's interactive editor to mark-up your PageCap.
