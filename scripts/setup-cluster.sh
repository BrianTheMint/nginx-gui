#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# setup-cluster.sh
# Usage (run on management server as root):
#   scripts/setup-cluster.sh [--token TOKEN] [--install-app] host1 host2 ...
# Example:
#   scripts/setup-cluster.sh --token nginx-gui-secret --install-app 10.0.0.2 10.0.0.163

TOKEN="${TOKEN:-}"
INSTALL_APP=false

print_usage(){
  cat <<EOF
Usage: $0 [--token TOKEN] [--install-app] host1 host2 ...

Options:
  --token TOKEN      Admin token for management server API (or set ADMIN_TOKEN env)
  --install-app      Run the app installer on each node (may install Node.js and app)

This script will:
  - request the management public key from the local management server (/api/cluster/key)
  - copy the public key to each host's ~/.ssh/authorized_keys (default user root)
  - register each host in the local management server via /api/nodes
  - verify SSH connectivity as the management key
  - optionally run the repo installer on each node (use with caution)
EOF
}

if [ "$#" -eq 0 ]; then print_usage; exit 1; fi

# simple arg parsing
HOSTS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2;;
    --install-app) INSTALL_APP=true; shift 1;;
    -h|--help) print_usage; exit 0;;
    --) shift; break;;
    *) HOSTS+=("$1"); shift 1;;
  esac
done

if [ ${#HOSTS[@]} -eq 0 ]; then err "no hosts specified"; print_usage; exit 1; fi

# helper
log(){ printf "[setup-cluster] %s\n" "$*"; }
err(){ printf "[setup-cluster] ERROR: %s\n" "$*" >&2; }
require_root(){ if [ "$(id -u)" -ne 0 ]; then err "this script must be run as root"; exit 1; fi }

require_root
TOKEN=${TOKEN:-${ADMIN_TOKEN:-}}
if [ -z "$TOKEN" ]; then err "No admin token provided; pass --token or set ADMIN_TOKEN env var"; exit 1; fi

# get management public key from local API
log "Fetching management public key from local management server"
PUBKEY_JSON=$(curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/cluster/key || true)
if [ -z "$PUBKEY_JSON" ]; then err "failed to contact local API at /api/cluster/key"; exit 1; fi
PUBKEY=$(echo "$PUBKEY_JSON" | awk -F'"publicKey":' '{print substr($2,2)}' | sed 's/"}$//' | sed 's/^"//' | sed 's/"$//' || true)
if [ -z "$PUBKEY" ]; then
  # fallback: try to parse as raw json with jq if available
  if command -v jq >/dev/null 2>&1; then
    PUBKEY=$(echo "$PUBKEY_JSON" | jq -r '.publicKey')
  fi
fi
if [ -z "$PUBKEY" ]; then err "could not extract publicKey from API response: $PUBKEY_JSON"; exit 1; fi
log "Got public key (first 80 chars): ${PUBKEY:0:80}..."

# helper to add key to remote host
add_key_to_host(){
  local host="$1"
  local user="root"
  local port=22
  log "Copying public key to ${user}@${host}:${port}"
  # If host resolves to local machine, append locally (run as root)
  if ping -c1 -W1 "$host" >/dev/null 2>&1; then
    LOCAL_IPS=$(hostname -I 2>/dev/null || echo "")
    for ip in $LOCAL_IPS 127.0.0.1 ::1; do
      if [ "$host" = "$ip" ] || [ "$host" = "localhost" ] || [ "$host" = "$(hostname)" ]; then
        log "Detected local host; appending key to /root/.ssh/authorized_keys"
        mkdir -p /root/.ssh && chmod 700 /root/.ssh
        printf '%s\n' "$PUBKEY" >> /root/.ssh/authorized_keys
        chmod 600 /root/.ssh/authorized_keys
        return 0
      fi
    done
  fi

  # prefer using management key if available
  SSH_ID="/opt/nginx-gui/.ssh/id_manage"
  SSH_OPTS="-o StrictHostKeyChecking=no -o BatchMode=yes -p $port"
  if [ -f "$SSH_ID" ]; then
    ssh -i "$SSH_ID" $SSH_OPTS ${user}@${host} "mkdir -p ~/.ssh && chmod 700 ~/.ssh && printf '%s\n' '$PUBKEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" && return 0 || return 1
  fi

  # Fallback: try default ssh (may require existing credentials)
  ssh $SSH_OPTS ${user}@${host} "mkdir -p ~/.ssh && chmod 700 ~/.ssh && printf '%s\n' '$PUBKEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" && return 0 || return 1
}

# register node via API
register_node(){
  local host="$1"
  local name="node-${host//./-}"
  log "Registering node $host as $name via local API"
  curl -sS -H "Authorization: Bearer $TOKEN" -X POST -H "Content-Type: application/json" -d "{\"name\":\"$name\",\"host\":\"$host\",\"port\":22,\"user\":\"root\"}" http://localhost:3000/api/nodes || true
}

# optional app install on node
install_app_on_node(){
  local host="$1"
  log "Running installer on $host (this will install Node.js, deps, and the app)"
  SSH_ID="/opt/nginx-gui/.ssh/id_manage"
  SSH_OPTS="-o StrictHostKeyChecking=no"
  if [ -f "$SSH_ID" ]; then
    ssh -i "$SSH_ID" $SSH_OPTS root@${host} "curl -fsSL https://raw.githubusercontent.com/BrianTheMint/nginx-gui/main/scripts/install.sh | bash -s -- --dir /opt/nginx-gui --user nginx-gui --port 3000 --non-interactive --generate-keypair" || err "installer failed on $host"
  else
    ssh $SSH_OPTS root@${host} "curl -fsSL https://raw.githubusercontent.com/BrianTheMint/nginx-gui/main/scripts/install.sh | bash -s -- --dir /opt/nginx-gui --user nginx-gui --port 3000 --non-interactive --generate-keypair" || err "installer failed on $host"
  fi
}

# main loop
for h in "${HOSTS[@]}"; do
  log "Processing host: $h"

  # try copying key; if fails, continue but report
  if add_key_to_host "$h"; then
    log "Key copied to $h"
  else
    err "Failed to copy key to $h — you may need to run 'ssh root@$h' first or provide credentials manually"
  fi

  # register node in management server
  register_node "$h"

  # verify connectivity with management key
  if ssh -o StrictHostKeyChecking=no -i /opt/nginx-gui/.ssh/id_manage -o BatchMode=yes root@${h} 'echo ok' >/dev/null 2>&1; then
    log "Verified SSH connectivity to $h using management key"
  else
    log "Could not verify SSH connectivity to $h using management key (try copying key manually and rerun)"
  fi

  if [ "$INSTALL_APP" = true ]; then
    install_app_on_node "$h"
  fi

done

log "Cluster setup finished. Review /opt/nginx-gui/nodes.json on the management server and /opt/nginx-gui/cluster.log for details."

exit 0
