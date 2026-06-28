#!/usr/bin/env bash
# Provisions Aurora PostgreSQL Serverless v2 for Lattency in the AWS account
# that the AWS CLI is currently authenticated against. The cluster sits in the
# default VPC, with a security group that allows 5432 only from your current
# public IP, and ACU range 0 → 2 so it auto-pauses when idle.
#
# Cost while idle: ~$0/hour (storage still charged: ~$0.10/GB-month).
# Cost while running 0.5 ACU: ~$0.06/hour.
#
# Run from the repo root:  bash scripts/provision-aurora.sh
# Re-runnable: skips resources that already exist.

set -euo pipefail

REGION="${AWS_REGION:-$(aws configure get region || echo eu-north-1)}"
CLUSTER_ID="${CLUSTER_ID:-lattency-dev}"
INSTANCE_ID="${INSTANCE_ID:-lattency-dev-writer}"
DB_NAME="${DB_NAME:-lattency}"
DB_USER="${DB_USER:-lattency}"
ENGINE_VERSION="${ENGINE_VERSION:-16.6}"
SUBNET_GROUP="${SUBNET_GROUP:-lattency-subnets}"
SG_NAME="${SG_NAME:-lattency-dev-sg}"
ENV_FILE="${ENV_FILE:-.env.local}"

say() { printf '\033[1;36m[lattency]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

say "region: $REGION"
say "cluster: $CLUSTER_ID  instance: $INSTANCE_ID  db: $DB_NAME"

# ---- 1. Detect default VPC and its subnets ------------------------------------
VPC_ID="$(aws ec2 describe-vpcs \
  --region "$REGION" \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)"
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "no default VPC in $REGION — create one or set VPC_ID explicitly" >&2
  exit 1
fi
say "default VPC: $VPC_ID"

SUBNET_IDS="$(aws ec2 describe-subnets \
  --region "$REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" \
  --query 'Subnets[].SubnetId' --output text)"
SUBNET_COUNT="$(echo "$SUBNET_IDS" | wc -w | tr -d ' ')"
if [[ "$SUBNET_COUNT" -lt 2 ]]; then
  echo "need ≥2 subnets in $VPC_ID, found $SUBNET_COUNT" >&2
  exit 1
fi
say "subnets ($SUBNET_COUNT): $SUBNET_IDS"

# ---- 2. Subnet group ----------------------------------------------------------
if ! aws rds describe-db-subnet-groups \
    --region "$REGION" \
    --db-subnet-group-name "$SUBNET_GROUP" >/dev/null 2>&1; then
  say "creating subnet group $SUBNET_GROUP"
  aws rds create-db-subnet-group \
    --region "$REGION" \
    --db-subnet-group-name "$SUBNET_GROUP" \
    --db-subnet-group-description "Lattency dev subnets" \
    --subnet-ids $SUBNET_IDS >/dev/null
else
  say "subnet group $SUBNET_GROUP exists"
fi

# ---- 3. Security group: allow 5432 from your current IP -----------------------
MY_IP="$(curl -s https://checkip.amazonaws.com | tr -d '[:space:]')/32"
say "your public IP: $MY_IP"

SG_ID="$(aws ec2 describe-security-groups \
  --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"
if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
  say "creating security group $SG_NAME"
  SG_ID="$(aws ec2 create-security-group \
    --region "$REGION" \
    --group-name "$SG_NAME" \
    --description "Lattency dev Postgres access" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)"
fi
say "security group: $SG_ID"

# Idempotent ingress rule.
if ! aws ec2 describe-security-groups \
    --region "$REGION" \
    --group-ids "$SG_ID" \
    --query "SecurityGroups[0].IpPermissions[?ToPort==\`5432\`].IpRanges[].CidrIp" \
    --output text | tr '\t' '\n' | grep -qx "$MY_IP"; then
  say "authorising $MY_IP → 5432"
  aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp --port 5432 --cidr "$MY_IP" >/dev/null
else
  say "ingress rule for $MY_IP already present"
fi

# ---- 4. Master password -------------------------------------------------------
if [[ -f "$ENV_FILE" ]] && grep -q '^DATABASE_URL=postgres://[^:]\+:[^@]\+@' "$ENV_FILE"; then
  DB_PASS="$(grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's|^DATABASE_URL=postgres://[^:]+:([^@]+)@.*$|\1|')"
  say "reusing password from $ENV_FILE"
else
  DB_PASS="$(openssl rand -hex 16)"
  say "generated new master password (will be written to $ENV_FILE)"
fi

# ---- 5. Cluster ---------------------------------------------------------------
if ! aws rds describe-db-clusters \
    --region "$REGION" \
    --db-cluster-identifier "$CLUSTER_ID" >/dev/null 2>&1; then
  say "creating cluster $CLUSTER_ID (engine 16.6, ACU 0→2)"
  aws rds create-db-cluster \
    --region "$REGION" \
    --db-cluster-identifier "$CLUSTER_ID" \
    --engine aurora-postgresql \
    --engine-version "$ENGINE_VERSION" \
    --master-username "$DB_USER" \
    --master-user-password "$DB_PASS" \
    --database-name "$DB_NAME" \
    --serverless-v2-scaling-configuration "MinCapacity=0,MaxCapacity=2" \
    --vpc-security-group-ids "$SG_ID" \
    --db-subnet-group-name "$SUBNET_GROUP" \
    --no-deletion-protection \
    --backup-retention-period 1 >/dev/null
else
  say "cluster $CLUSTER_ID exists — leaving as-is"
fi

# ---- 6. Writer instance -------------------------------------------------------
if ! aws rds describe-db-instances \
    --region "$REGION" \
    --db-instance-identifier "$INSTANCE_ID" >/dev/null 2>&1; then
  say "creating writer instance $INSTANCE_ID (db.serverless, publicly accessible)"
  aws rds create-db-instance \
    --region "$REGION" \
    --db-cluster-identifier "$CLUSTER_ID" \
    --db-instance-identifier "$INSTANCE_ID" \
    --db-instance-class db.serverless \
    --engine aurora-postgresql \
    --publicly-accessible >/dev/null
else
  say "instance $INSTANCE_ID exists — leaving as-is"
fi

# ---- 7. Wait for it -----------------------------------------------------------
say "waiting for instance to become available (≈5–8 min)…"
aws rds wait db-instance-available \
  --region "$REGION" \
  --db-instance-identifier "$INSTANCE_ID"

ENDPOINT="$(aws rds describe-db-clusters \
  --region "$REGION" \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query 'DBClusters[0].Endpoint' --output text)"
say "cluster endpoint: $ENDPOINT"

# ---- 8. Write .env.local ------------------------------------------------------
URL="postgres://${DB_USER}:${DB_PASS}@${ENDPOINT}:5432/${DB_NAME}"
if [[ -f "$ENV_FILE" ]] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  # Replace the existing line in-place (BSD/GNU sed compatible).
  tmp="$(mktemp)"
  awk -v url="DATABASE_URL=$URL" '
    /^DATABASE_URL=/ { print url; next }
    { print }
  ' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
else
  printf 'DATABASE_URL=%s\n' "$URL" >> "$ENV_FILE"
fi
say "wrote DATABASE_URL to $ENV_FILE"

say "done. next steps:"
echo "  pnpm migrate     # apply migrations (creates PostGIS extension)"
echo "  pnpm db:check    # prove the connection + PostGIS"
