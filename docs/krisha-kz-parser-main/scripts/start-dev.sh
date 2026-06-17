#!/usr/bin/env bash
# Reads krisha.kz credentials from Azure Key Vault and starts Docker Compose.
# Credentials are never stored — passed as ephemeral env vars only.
set -euo pipefail

KV=kv-bronxtc-dev

echo "Reading credentials from Key Vault $KV..."
export KRISHA_LOGIN=$(az keyvault secret show --vault-name "$KV" --name "krisha-bot--prod--KRISHA-LOGIN" --query value -o tsv)
export KRISHA_PASSWORD=$(az keyvault secret show --vault-name "$KV" --name "krisha-bot--prod--KRISHA-PASSWORD" --query value -o tsv)

echo "Credentials loaded. Starting bot..."
docker compose up -d "$@"
