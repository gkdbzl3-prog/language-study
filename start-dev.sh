#!/bin/bash
export ComSpec="C:\\WINDOWS\\System32\\cmd.exe"
cd "$(dirname "$0")"
npx vite --port "${PORT:-5173}"
