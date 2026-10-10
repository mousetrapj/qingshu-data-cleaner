# Third-party notices

Qingshu's project code is licensed under MIT. This does not replace the licenses of third-party components. The original browser assets and their direct license copies are retained in `dist/vendor/`.

| Distributed component | Version | Applicable license and retained notice |
| --- | --- | --- |
| `dist/vendor/jszip.min.js` | 3.10.1 | Upstream offers `MIT OR GPL-3.0-or-later`. Qingshu selects the **MIT** option. The original dual-license text remains in [LICENSE-JSZip.md](dist/vendor/LICENSE-JSZip.md). |
| `dist/vendor/sax.js` | 1.6.1 | **BlueOak-1.0.0**. Full text is retained in [LICENSE-sax.md](dist/vendor/LICENSE-sax.md). |

The prebuilt JSZip bundle also includes pako, lie, immediate, and setImmediate implementations. Their notices are retained below. Pako includes both MIT-licensed code and Zlib-licensed code; it must not be described as solely MIT. Original notices in the vendor bundle, including JSZip's pako attribution, are unchanged.

When redistributing or updating these assets, retain the applicable license texts and attributions. These notices do not claim authorship of the original libraries.

## Scope of the JSZip browser bundle

The checked-in `jszip.min.js` contains the upstream JSZip 3.10.1 minified distribution with one added final LF (newline). The JavaScript code is otherwise unchanged.

Upstream distribution SHA-256 (before the added LF):

```text
acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e
```

Checked-in asset SHA-256 (including the added LF):

```text
d14e71a95ef3290dec66a9cfdd8a37c2dd624f6f2b594c4512f607d4a56e19fc
```

Inspection of its 54-entry Browserify module table, cross-checked against the matching unminified distribution and package sources, identifies these bundled implementations:

| Bundle module IDs | Implementation | Notice retained here |
| --- | --- | --- |
| 1–35 | JSZip, including its own Base64 helpers and browser stream adapter | JSZip's original license copy, linked above |
| 36 | immediate | MIT |
| 37 | lie | MIT |
| 38–53 | pako and its zlib-derived compression code | MIT and Zlib |
| 54 | setImmediate | MIT |

The import named `readable-stream` resolves to JSZip's own module 16, `lib/readable-stream-browser.js`. That adapter requests `stream` from the host; this distribution does not embed a stream implementation. The `readable-stream`, `buffer`, `base64-js`, `ieee754`, `inherits`, `util-deprecate`, `isarray`, `process-nextick-args`, `string_decoder`, and `safe-buffer` package implementations are absent from this browser bundle. Installed Node dependencies alone are therefore not treated as distributed components.

This inventory applies to the asset hash above. Recheck the actual bundle and retain any additional notices when replacing or rebuilding it.

## Pako — MIT notice

```text
(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Pako — Zlib notice

The following notice applies to the bundled compression implementation derived from zlib.

```text
(C) 1995-2013 Jean-loup Gailly and Mark Adler
(C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
  claim that you wrote the original software. If you use this software
  in a product, an acknowledgment in the product documentation would be
  appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
  misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
```

## lie — MIT notice

```text
#Copyright (c) 2014-2018 Calvin Metcalf, Jordan Harband

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

**THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.**
```

## immediate — MIT notice

```text
Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, Domenic Denicola, Brian Cavalier

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## setImmediate — MIT notice

```text
Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, and Domenic Denicola

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
