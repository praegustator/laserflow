#!/usr/bin/env sh
# LaserFlow quick-install script
# Usage: curl -fsSL https://raw.githubusercontent.com/praegustator/laserflow/main/install.sh | sh
set -e

REPO_URL="https://github.com/praegustator/laserflow.git"
INSTALL_DIR="laserflow"
NODE_VERSION="20"

##############################################################################
# Helpers
##############################################################################

info()    { printf '\033[1;34m[info]\033[0m  %s\n' "$*"; }
success() { printf '\033[1;32m[ok]\033[0m    %s\n' "$*"; }
warn()    { printf '\033[1;33m[warn]\033[0m  %s\n' "$*"; }
error()   { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

##############################################################################
# Node.js detection / installation
##############################################################################

ensure_node() {
  if command_exists node; then
    current="$(node --version | sed 's/v//' | cut -d. -f1)"
    if [ "$current" -ge 18 ]; then
      success "Node.js $(node --version) already installed"
      return
    fi
    warn "Node.js $(node --version) is too old (need >= 18). Installing v${NODE_VERSION} via nvm..."
  else
    info "Node.js not found. Installing v${NODE_VERSION} via nvm..."
  fi

  # Install nvm if not present
  if ! command_exists nvm && [ ! -f "${HOME}/.nvm/nvm.sh" ]; then
    info "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | sh
  fi

  # Load nvm
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"

  nvm install "${NODE_VERSION}"
  nvm use "${NODE_VERSION}"
  nvm alias default "${NODE_VERSION}"
  success "Node.js $(node --version) installed via nvm"
}

##############################################################################
# Repository
##############################################################################

clone_or_update() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    info "Repository already exists at './${INSTALL_DIR}'. Pulling latest changes..."
    git -C "${INSTALL_DIR}" pull --ff-only
  else
    info "Cloning LaserFlow repository..."
    git clone "${REPO_URL}" "${INSTALL_DIR}"
  fi
}

##############################################################################
# Dependencies
##############################################################################

install_deps() {
  info "Installing npm dependencies..."
  npm install --prefix "${INSTALL_DIR}"
  success "Dependencies installed"
}

##############################################################################
# Start
##############################################################################

start_app() {
  info "Starting LaserFlow..."
  printf '\n'
  printf '  Backend API  → http://localhost:3001\n'
  printf '  Frontend UI  → http://localhost:5173\n'
  printf '\n'
  printf 'Press Ctrl+C to stop.\n\n'

  # Start backend in the background
  npm run dev --workspace=packages/backend --prefix "${INSTALL_DIR}" &
  BACKEND_PID=$!

  # Ensure the background process is terminated on exit, interrupt, or error
  trap 'kill "${BACKEND_PID}" 2>/dev/null || true' EXIT INT TERM

  # Give the backend a moment to start
  sleep 2

  # Start frontend (blocks until Ctrl+C)
  npm run dev --workspace=packages/frontend --prefix "${INSTALL_DIR}" || true
}

##############################################################################
# Main
##############################################################################

main() {
  printf '\n'
  printf '██╗      █████╗ ███████╗███████╗██████╗ ███████╗██╗      ██████╗ ██╗    ██╗\n'
  printf '██║     ██╔══██╗██╔════╝██╔════╝██╔══██╗██╔════╝██║     ██╔═══██╗██║    ██║\n'
  printf '██║     ███████║███████╗█████╗  ██████╔╝█████╗  ██║     ██║   ██║██║ █╗ ██║\n'
  printf '██║     ██╔══██║╚════██║██╔══╝  ██╔══██╗██╔══╝  ██║     ██║   ██║██║███╗██║\n'
  printf '███████╗██║  ██║███████║███████╗██║  ██║██║     ███████╗╚██████╔╝╚███╔███╔╝\n'
  printf '╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝\n'
  printf '\n'
  printf 'Modern Web-Based Controller for GRBL Laser Machines\n'
  printf 'https://github.com/praegustator/laserflow\n\n'

  ensure_node
  clone_or_update
  install_deps
  start_app
}

main "$@"
