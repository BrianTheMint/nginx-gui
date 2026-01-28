#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# nginx-gui installer
# Usage (recommended):
#   curl -fsSL https://raw.githubusercontent.com/BrianTheMint/nginx-gui/main/scripts/install.sh | sudo bash -s -- --dir /opt/nginx-gui --user nginx-gui

# Defaults (override via args or env)
REPO_DEFAULT="https://github.com/BrianTheMint/nginx-gui.git"
BRANCH_DEFAULT="main"
INSTALL_DIR_DEFAULT="/opt/nginx-gui"
APP_USER_DEFAULT="nginx-gui"
PORT_DEFAULT="3000"
NODE_SETUP_VERSION_DEFAULT="20.x"

REPO="${REPO:-$REPO_DEFAULT}"
BRANCH="${BRANCH:-$BRANCH_DEFAULT}"
INSTALL_DIR="${INSTALL_DIR:-$INSTALL_DIR_DEFAULT}"
APP_USER="${APP_USER:-$APP_USER_DEFAULT}"
PORT="${PORT:-$PORT_DEFAULT}"
NODE_VERSION="${NODE_VERSION:-$NODE_SETUP_VERSION_DEFAULT}"
NONINTERACTIVE="${NONINTERACTIVE:-false}"

log(){ printf "[nginx-gui installer] %s\n" "$*"; }
err(){ printf "[nginx-gui installer] ERROR: %s\n" "$*" >&2; }
require_root(){ if [ "$(id -u)" -ne 0 ]; then err "this installer must be run as root (use sudo)"; exit 1; fi }

parse_args(){
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo) REPO="$2"; shift 2;;
      --branch) BRANCH="$2"; shift 2;;
      --dir|--install-dir) INSTALL_DIR="$2"; shift 2;;
      --user) APP_USER="$2"; shift 2;;
      --port) PORT="$2"; shift 2;;
      --node-version) NODE_VERSION="$2"; shift 2;;
      --generate-keypair) GENERATE_KEYPAIR=true; shift 1;;
      --non-interactive) NONINTERACTIVE=true; shift 1;;
      -h|--help) echo "Usage: install.sh [--repo <git url>] [--branch <branch>] [--dir <install dir>] [--user <app user>] [--port <port>] [--generate-keypair]"; exit 0;;
      --) shift; break;;
      *) err "Unknown arg: $1"; exit 1;;
    esac
  done
}

detect_pkg_mgr(){
  if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MGR="yum"
  elif command -v apk >/dev/null 2>&1; then
    PKG_MGR="apk"
  else
    err "Could not detect a supported package manager (apt/dnf/yum/apk)."; exit 1
  fi
}

install_system_packages(){
  log "Installing system packages (pkg manager = $PKG_MGR)"
  case "$PKG_MGR" in
    apt)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y curl ca-certificates gnupg lsb-release git build-essential python3 || true
      ;;
    dnf)
      dnf install -y curl ca-certificates git gcc gcc-c++ make python3 || true
      ;;
    yum)
      yum install -y curl ca-certificates git gcc gcc-c++ make python3 || true
      ;;
    apk)
      apk add --no-cache curl ca-certificates git build-base python3 || true
      ;;
  esac
}

install_node(){
  log "Installing Node.js ($NODE_VERSION)"
  if [ "$PKG_MGR" = "apt" ]; then
    # NodeSource official installer
    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION | bash -

    # Try a normal install first
    if apt-get install -y nodejs; then
      log "nodejs installed successfully"
    else
      err "apt install nodejs failed; attempting to resolve conflicts and retry"

      # Common conflict: older libnode-dev or nodejs-doc packages own header files
      CONFLICTS="$(dpkg -l | awk '/libnode-dev|nodejs-doc|nodejs-dev/ {print $2}' | tr '\n' ' ')"
      if [ -n "$CONFLICTS" ]; then
        log "Removing conflicting packages: $CONFLICTS"
        apt-get remove --purge -y $CONFLICTS || true
      fi

      # Try to recover from broken installs
      log "Running apt-get -f install and dpkg --configure -a"
      apt-get -f install -y || true
      dpkg --configure -a || true

      # Retry install; allow dpkg to overwrite if needed as a last resort
      if apt-get install -y nodejs; then
        log "nodejs installed successfully on retry"
      else
        log "Retry with force-overwrite option"
        apt-get -o Dpkg::Options::=\"--force-overwrite\" install -y nodejs || {
          err "Failed to install nodejs even after attempting cleanup. Please inspect apt/dpkg state (dpkg -C; apt-get -f install) or remove conflicting packages manually."
          exit 1
        }
      fi
    fi

  elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_$NODE_VERSION | bash -
    ${PKG_MGR} install -y nodejs
  elif [ "$PKG_MGR" = "apk" ]; then
    apk add --no-cache nodejs npm
  fi
}

install_github_cli(){
  if command -v gh >/dev/null 2>&1; then
    log "gh already installed"
    return
  fi
  log "Installing GitHub CLI (gh)"
  if [ "$PKG_MGR" = "apt" ]; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null || true
    chmod 644 /usr/share/keyrings/githubcli-archive-keyring.gpg || true
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    apt-get update -y
    apt-get install -y gh
  elif [ "$PKG_MGR" = "dnf" ] || [ "$PKG_MGR" = "yum" ]; then
    ${PKG_MGR} config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo || true
    ${PKG_MGR} install -y gh || true
  else
    log "Could not auto-install gh for $PKG_MGR; you can install it manually from https://cli.github.com/"
  fi
}

create_app_user(){
  if id -u "$APP_USER" >/dev/null 2>&1; then
    log "User $APP_USER exists"
  else
    log "Creating system user: $APP_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin --home $INSTALL_DIR $APP_USER || true
  fi
}

clone_or_update_repo(){
  if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repository already present in $INSTALL_DIR; pulling latest $BRANCH"
    (cd "$INSTALL_DIR" && git fetch --all && git checkout "$BRANCH" && git pull origin "$BRANCH") || true
  else
    log "Cloning $REPO (branch $BRANCH) -> $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    if [ -n "${GITHUB_TOKEN:-}" ]; then
      # Use a temporary extraheader to avoid exposing the token in the URL
      git -c http.extraheader="AUTH: bearer $GITHUB_TOKEN" clone --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
    else
      git clone --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
    fi
  fi

  # Optionally generate management SSH keypair for cluster management
  if [ "${GENERATE_KEYPAIR:-false}" = true ] || [ ! -f "$INSTALL_DIR/.ssh/id_manage" ]; then
    log "Generating management SSH keypair in $INSTALL_DIR/.ssh/"
    mkdir -p "$INSTALL_DIR/.ssh"
    ssh-keygen -t rsa -b 4096 -f "$INSTALL_DIR/.ssh/id_manage" -N "" -C "nginx-gui management key" || true
    chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR/.ssh" || true
    chmod 700 "$INSTALL_DIR/.ssh" || true
    chmod 600 "$INSTALL_DIR/.ssh/id_manage" || true
    chmod 644 "$INSTALL_DIR/.ssh/id_manage.pub" || true
    log "Management public key:
$(cat "$INSTALL_DIR/.ssh/id_manage.pub")"
  fi
}

install_node_deps(){
  log "Installing node dependencies in $INSTALL_DIR"
  cd "$INSTALL_DIR"
  if [ -f package-lock.json ]; then
    npm ci --production || npm install --production
  else
    npm install --production || true
  fi
}

create_systemd_service(){
  SERVICE_FILE=/etc/systemd/system/nginx-gui.service
  log "Creating systemd service $SERVICE_FILE"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=nginx-gui - simple nginx config GUI
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$INSTALL_DIR
Environment=PORT=$PORT
ExecStart=$(command -v node) $INSTALL_DIR/server.js
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable nginx-gui.service
  systemctl restart nginx-gui.service || (systemctl status nginx-gui.service && false)
}

post_install_notes(){
  log "Installed and started nginx-gui."
  log "App directory: $INSTALL_DIR"
  log "Service: systemctl status nginx-gui"
  log "To finish:"
  echo "  - If you want to push to GitHub from this server, run 'gh auth login' and 'gh auth setup-git' as the user who will use git (not necessarily root)."
  echo "  - To set an admin token for the UI, set the environment variable ADMIN_TOKEN in the systemd service or /etc/environment. Example: add 'Environment=ADMIN_TOKEN=your-secret' to /etc/systemd/system/nginx-gui.service then 'systemctl daemon-reload && systemctl restart nginx-gui'."
  echo "  - Visit http://$(hostname -I | awk '{print $1}'):$PORT from your browser or use curl http://localhost:$PORT to sanity-check."
}

main(){
  parse_args "$@"
  require_root
  detect_pkg_mgr
  install_system_packages
  install_node
  install_github_cli
  create_app_user
  clone_or_update_repo
  chown -R "$APP_USER":"$APP_USER" "$INSTALL_DIR" || true
  install_node_deps
  create_systemd_service
  post_install_notes
}

main "$@"
