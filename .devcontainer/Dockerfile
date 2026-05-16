FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG USERNAME=coder
ARG USER_UID=1000
ARG USER_GID=1000
ARG NODE_MAJOR=24
ARG PNPM_VERSION=latest
ARG BUN_VERSION=latest
ARG PI_VERSION=latest
ARG CLAUDE_CODE_VERSION=latest
ARG CODEX_VERSION=latest
ARG OPENCODE_VERSION=latest

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8
ENV NPM_CONFIG_PREFIX=/home/${USERNAME}/.local
ENV PATH=/home/${USERNAME}/.local/bin:/home/${USERNAME}/.bun/bin:${PATH}
ENV SHELL=/usr/bin/zsh
ENV EDITOR=nvim
ENV VISUAL=nvim
ENV CLAUDE_CONFIG_DIR=/home/${USERNAME}/.claude

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
      sed -i -E '/^Components:/ { /universe/! s/$/ universe/ }' /etc/apt/sources.list.d/ubuntu.sources; \
    fi \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      wget \
      gnupg \
      sudo \
      zsh \
      git \
      git-delta \
      jq \
      fzf \
      zoxide \
      eza \
      bat \
      fd-find \
      ripgrep \
      tree \
      neovim \
      tmux \
      python3 \
      python3-dev \
      python3-venv \
      python-is-python3 \
      build-essential \
      pkg-config \
      libssl-dev \
      libffi-dev \
      unzip \
      zip \
      xz-utils \
      less \
      file \
      locales \
      openssh-client \
      procps \
 && locale-gen en_US.UTF-8 \
 && ln -sf /usr/bin/batcat /usr/local/bin/bat \
 && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
 && install -d -m 0755 /etc/apt/keyrings \
 && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg > /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh nodejs \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN if id -u "${USERNAME}" >/dev/null 2>&1; then \
      usermod --shell /usr/bin/zsh "${USERNAME}"; \
    else \
      existing_user="$(getent passwd "${USER_UID}" | cut -d: -f1 || true)"; \
      if [ -n "${existing_user}" ]; then \
        existing_group="$(id -gn "${existing_user}")"; \
        usermod --login "${USERNAME}" --home "/home/${USERNAME}" --move-home --shell /usr/bin/zsh "${existing_user}"; \
        groupmod --new-name "${USERNAME}" "${existing_group}" || true; \
      else \
        if ! getent group "${USER_GID}" >/dev/null 2>&1; then groupadd --gid "${USER_GID}" "${USERNAME}"; fi; \
        group_name="$(getent group "${USER_GID}" | cut -d: -f1)"; \
        useradd --uid "${USER_UID}" --gid "${group_name}" --create-home --shell /usr/bin/zsh "${USERNAME}"; \
      fi; \
    fi \
 && usermod -aG sudo "${USERNAME}" \
 && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${USERNAME}" \
 && chmod 0440 "/etc/sudoers.d/${USERNAME}"

RUN install -d -o "${USERNAME}" -g "${USERNAME}" \
      "/home/${USERNAME}/.local/bin" \
      "/home/${USERNAME}/.npm" \
      "/home/${USERNAME}/.local/share/npm" \
      "/home/${USERNAME}/.local/share/pnpm" \
      "/home/${USERNAME}/.local/share/zoxide" \
      "/home/${USERNAME}/.local/share/opencode" \
      "/home/${USERNAME}/.local/state/zsh" \
      "/home/${USERNAME}/.cache/bun" \
      "/home/${USERNAME}/.cache/pip" \
      "/home/${USERNAME}/.cache/uv" \
      "/home/${USERNAME}/.config/opencode" \
      "/home/${USERNAME}/.config/tmux" \
      "/home/${USERNAME}/.pi" \
      "/home/${USERNAME}/.claude" \
      "/home/${USERNAME}/.codex" \
 && ln -sf "/home/${USERNAME}/.claude/claude.json" "/home/${USERNAME}/.claude.json" \
 && chown -R "${USERNAME}:${USERNAME}" "/home/${USERNAME}" \
 && chown -h "${USERNAME}:${USERNAME}" "/home/${USERNAME}/.claude.json"

RUN git config --system core.pager delta \
 && git config --system interactive.diffFilter 'delta --color-only' \
 && git config --system delta.navigate true \
 && git config --system delta.side-by-side true \
 && git config --system merge.conflictstyle zdiff3 \
 && git config --system diff.colorMoved default

USER ${USERNAME}
WORKDIR /workspaces

RUN if command -v corepack >/dev/null 2>&1; then \
      (corepack enable --install-directory "$HOME/.local/bin" \
        && corepack prepare "pnpm@${PNPM_VERSION}" --activate) \
      || npm install -g --force "pnpm@${PNPM_VERSION}"; \
    else \
      npm install -g "pnpm@${PNPM_VERSION}"; \
    fi \
 && npm install -g \
      "@earendil-works/pi-coding-agent@${PI_VERSION}" \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@openai/codex@${CODEX_VERSION}" \
      "opencode-ai@${OPENCODE_VERSION}"

RUN if [ "${BUN_VERSION}" = "latest" ]; then \
      curl -fsSL https://bun.sh/install | bash; \
    else \
      curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"; \
    fi \
 && curl -LsSf https://astral.sh/uv/install.sh | sh

RUN cat > "$HOME/.zshrc" <<'EOF'
# ----- zsh behavior -----
setopt PROMPT_SUBST
setopt APPEND_HISTORY
setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_REDUCE_BLANKS

export HISTFILE="${XDG_STATE_HOME:-$HOME/.local/state}/zsh/history"
HISTSIZE=50000
SAVEHIST=50000

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"
export NPM_CONFIG_PREFIX="$HOME/.local"
export SHELL=/usr/bin/zsh
export EDITOR=nvim
export VISUAL=nvim
export BAT_THEME=OneHalfDark

# ----- prompt -----
autoload -Uz vcs_info add-zsh-hook
zstyle ':vcs_info:git:*' formats '%b '
_update_vcs_info() { vcs_info }
add-zsh-hook precmd _update_vcs_info
PROMPT='%F{green}%*%f %F{blue}%~%f %F{red}${vcs_info_msg_0_}%f$ '

# ----- ctrl-arrow word movement -----
bindkey '^[[1;5D' backward-word
bindkey '^[[1;5C' forward-word

# ----- completions -----
autoload -Uz compinit
compinit

# ----- fzf -----
if command -v fzf >/dev/null 2>&1; then
  if fzf --zsh >/dev/null 2>&1; then
    source <(fzf --zsh) 2> >(grep -v "can't change option: zle" >&2)
  else
    [[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && source /usr/share/doc/fzf/examples/key-bindings.zsh
    [[ -f /usr/share/doc/fzf/examples/completion.zsh ]] && source /usr/share/doc/fzf/examples/completion.zsh
  fi
fi

if command -v fd >/dev/null 2>&1; then
  export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"
  _fzf_compgen_path() { fd --hidden --exclude .git . "$1" }
  _fzf_compgen_dir() { fd --type=d --hidden --exclude .git . "$1" }
fi

if command -v bat >/dev/null 2>&1 && command -v eza >/dev/null 2>&1; then
  show_file_or_dir_preview='if [ -d {} ]; then eza --tree --color=always {} | head -200; else bat -n --color=always --line-range :500 {}; fi'
  export FZF_CTRL_T_OPTS="--preview '$show_file_or_dir_preview'"
  export FZF_ALT_C_OPTS="--preview 'eza --tree --color=always {} | head -200'"
fi

export FZF_DEFAULT_OPTS="${FZF_DEFAULT_OPTS:-} --height=40% --layout=reverse --border --ansi"

# ----- eza -----
if command -v eza >/dev/null 2>&1; then
  alias ll='eza --color=always --long --git --no-filesize --icons=auto --no-user'
  alias la='eza --color=always --long --all --git --no-filesize --icons=auto --no-user'
  alias lt='eza --tree --level=2 --color=always --icons=auto'
fi

# ----- zoxide -----
if command -v zoxide >/dev/null 2>&1 && [[ "${CLAUDECODE:-}" != "1" ]]; then
  eval "$(zoxide init zsh)"
fi
EOF

RUN cat > "$HOME/.config/tmux/tmux.conf" <<'EOF'
set-option -g default-shell /usr/bin/zsh
set -g mouse on
set -g extended-keys on
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc,*:Tc"
set -g status on
set -g status-interval 5
set -g status-left "#S "
set -g status-right "%H:%M %d-%b"
bind b set -g status
EOF

RUN mkdir -p "$HOME/.local/state/zsh" \
 && touch "$HOME/.local/state/zsh/history"
