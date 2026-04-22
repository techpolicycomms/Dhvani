#!/bin/bash
#
# Dhvani — pre-deploy production readiness check.
#
# Run this on the host where you intend to build the production bundle
# (or in CI before promoting to Azure Web App). Verifies every required
# env var is present and runs the full `npm run build` to catch
# compile-time regressions.
#
#   scripts/test-production.sh
#
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}Dhvani — production readiness check${NC}"
echo

REQUIRED_VARS=(
  AZURE_OPENAI_API_KEY
  AZURE_OPENAI_ENDPOINT
  AZURE_OPENAI_WHISPER_DEPLOYMENT
  AZURE_AD_CLIENT_ID
  AZURE_AD_CLIENT_SECRET
  AZURE_AD_TENANT_ID
  NEXTAUTH_SECRET
  NEXTAUTH_URL
  ADMIN_EMAILS
)

OPTIONAL_VARS=(
  AZURE_OPENAI_CHAT_API_KEY
  AZURE_OPENAI_CHAT_ENDPOINT
  AZURE_OPENAI_CHAT_DEPLOYMENT
  RATE_LIMIT_MINUTES_PER_HOUR
  RATE_LIMIT_MINUTES_PER_DAY
  RATE_LIMIT_MONTHLY_BUDGET_USD
  RATE_LIMIT_CHAT_PER_HOUR
  NOTIFICATION_WEBHOOK_URL
)

missing=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo -e "  ${RED}MISSING${NC}  $var"
    missing=$((missing + 1))
  else
    echo -e "  ${GREEN}OK     ${NC}  $var"
  fi
done

echo
echo -e "${BOLD}Optional overrides${NC}"
for var in "${OPTIONAL_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo -e "  -       $var (using default)"
  else
    echo -e "  ${GREEN}set    ${NC} $var"
  fi
done

echo
if [ "$missing" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: $missing required variable(s) missing."
  exit 1
fi

# ---------------------------------------------------------------------
# Endpoint shape — must be base URL only, not the full path with
# /openai/deployments/.../audio/transcriptions?api-version=
# ---------------------------------------------------------------------
case "$AZURE_OPENAI_ENDPOINT" in
  *"/openai/deployments/"*|*"api-version="*)
    echo -e "${RED}FAIL${NC}: AZURE_OPENAI_ENDPOINT must be the base URL only (e.g. https://x.openai.azure.com/)."
    exit 1
    ;;
esac

# ---------------------------------------------------------------------
# NEXTAUTH_URL sanity — must be https in production.
# ---------------------------------------------------------------------
case "$NEXTAUTH_URL" in
  https://*)
    ;;
  *)
    echo -e "${YELLOW}WARN${NC}: NEXTAUTH_URL is not https — OK only for local/staging."
    ;;
esac

echo
echo -e "${BOLD}Type check${NC}"
npx tsc --noEmit || { echo -e "${RED}FAIL${NC}: tsc found errors."; exit 1; }
echo -e "  ${GREEN}OK${NC}"

echo
echo -e "${BOLD}Runtime-dep audit (high+ only)${NC}"
npm audit --omit=dev --audit-level=high 2>&1 | tail -5 || {
  echo -e "${RED}FAIL${NC}: high-severity vulnerabilities in runtime deps."
  exit 1
}

echo
echo -e "${BOLD}Production build${NC}"
npm run build || { echo -e "${RED}FAIL${NC}: build failed."; exit 1; }

echo
echo -e "${GREEN}${BOLD}All checks passed.${NC} Safe to deploy."
