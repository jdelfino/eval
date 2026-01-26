#!/bin/bash
# Install 1Password CLI
# https://developer.1password.com/docs/cli/get-started/#install

set -e

echo "Installing 1Password CLI..."

# Detect architecture
ARCH=$(dpkg --print-architecture)
echo "Detected architecture: $ARCH"

# Add 1Password apt repository
curl -sS https://downloads.1password.com/linux/keys/1password.asc | \
    sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg

echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/${ARCH} stable main" | \
    sudo tee /etc/apt/sources.list.d/1password.list

# Install
sudo apt-get update
sudo apt-get install -y 1password-cli

echo "1Password CLI installed: $(op --version)"
