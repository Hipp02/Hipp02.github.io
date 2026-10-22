FROM lscr.io/linuxserver/webtop:ubuntu-xfce

USER root

RUN set -eux; \
  if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
    dpkg --add-architecture i386; \
  fi; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    curl \
    git \
    gnupg \
    jq \
    mousepad \
    nano \
    nodejs \
    python3 \
    python3-pip \
    python3-venv \
    ripgrep \
    unzip \
    vim-tiny \
    wget \
    zip; \
  if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
    apt-get install -y --no-install-recommends wine wine32:i386 wine64; \
  fi; \
  if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
    curl -fsSLo /tmp/google-linux-signing-key.pub https://dl.google.com/linux/linux_signing_key.pub; \
    fingerprint="$(gpg --show-keys --with-colons /tmp/google-linux-signing-key.pub | awk -F: '$1 == "fpr" { print $10; exit }')"; \
    test "$fingerprint" = "EB4C1BFD4F042F6DDDCCEC917721F63BD38B4796"; \
    gpg --dearmor --output /usr/share/keyrings/google-linux-signing-key.gpg /tmp/google-linux-signing-key.pub; \
    printf '%s\n' 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-key.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
      > /etc/apt/sources.list.d/google-chrome.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends google-chrome-stable; \
  fi; \
  rm -f /tmp/google-linux-signing-key.pub; \
  rm -rf /var/lib/apt/lists/*

COPY install-browser-launcher /custom-cont-init.d/10-install-browser-launcher
COPY wrapped-google-chrome /usr/local/bin/wrapped-google-chrome

RUN chmod 755 \
    /custom-cont-init.d/10-install-browser-launcher \
    /usr/local/bin/wrapped-google-chrome \
  && if [ -f /usr/share/applications/google-chrome.desktop ]; then \
    sed -i 's|/usr/bin/google-chrome-stable|/usr/local/bin/wrapped-google-chrome|g' \
      /usr/share/applications/google-chrome.desktop; \
  fi
