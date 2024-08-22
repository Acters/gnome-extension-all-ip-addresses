#!/bin/bash
cd "$(dirname "$0")"
zip -9 all-ip-addresses.zip extension.js metadata.json *.md
cd -
