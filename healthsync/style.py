"""Terminal styling.

Colour is presentation only: it is emitted when stdout is a terminal, and
dropped when the output is piped, redirected, or captured by a test. Honours
the NO_COLOR convention. The check happens per call rather than at import so
that a stream swapped after import (pytest's capture, a redirect) is seen.
"""

from __future__ import annotations

import os
import sys


def enabled() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    try:
        return sys.stdout.isatty()
    except (AttributeError, ValueError):
        return False


def _c(code: str, s) -> str:
    s = str(s)
    return f"\033[{code}m{s}\033[0m" if enabled() else s


def green(s):
    return _c("32", s)


def red(s):
    return _c("31", s)


def yellow(s):
    return _c("33", s)


def cyan(s):
    return _c("36", s)


def dim(s):
    return _c("2", s)


def bold(s):
    return _c("1", s)


# Status tags, padded before colouring so the escape codes never affect the
# column width the caller asked for.
def tag(colour, text: str, width: int = 6) -> str:
    return colour(f"{text:<{width}}")


def ok(text="ok", width=6):
    return tag(green, text, width)


def warn(text="warn", width=6):
    return tag(yellow, text, width)


def bad(text="bad", width=6):
    return tag(red, text, width)


def note(text, width=6):
    return tag(dim, text, width)
