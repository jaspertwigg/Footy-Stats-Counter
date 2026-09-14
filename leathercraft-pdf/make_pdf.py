#!/usr/bin/env python3
"""Convenience entry point: `python make_pdf.py pattern.dxf`.

See `leathercraft_pdf/cli.py` for the actual implementation, or run
`python make_pdf.py --help` for all options.
"""
import sys

from leathercraft_pdf.cli import main

if __name__ == "__main__":
    sys.exit(main())
