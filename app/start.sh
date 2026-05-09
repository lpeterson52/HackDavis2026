#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if ! command -v pnpm &> /dev/null; then
  echo "pnpm not found — installing..."
  npm install -g pnpm
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
fi

if [ ! -d ios/Pods ]; then
  echo "Installing CocoaPods..."
  cd ios && pod install && cd ..
fi

echo "Starting Metro bundler..."
pnpm exec react-native start
