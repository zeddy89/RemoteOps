#!/bin/bash

# This is a simple test script to verify the CLI without connecting to a real server
echo "Testing MCP SSH Client help..."
node dist/index.js --help

echo -e "\nVerifying CLI version..."
node dist/index.js --version