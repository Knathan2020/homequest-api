#!/bin/bash
# Custom build script for Vercel

# Install build dependencies
apt-get update && apt-get install -y cmake build-essential

# Set environment variable to use pre-built OpenCV bindings
export OPENCV4NODEJS_DISABLE_AUTOBUILD=0

# Install node modules
npm install

echo "Build completed successfully"