# Sand Desktop

Sand opens straight into a full-screen Linux desktop streamed from its own Docker container inside the Codespace. There is no extra Sand launcher or app window around it. The desktop includes Chromium, Mousepad, a terminal, a file manager, and common developer tools.

## Run

In Codespaces, Sand starts automatically on port `3001`. Open the HTTPS URL for port `3001` in the Codespaces Ports tab, or use `https://${CODESPACE_NAME}-3001.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}/`. Keep that forwarded port **Private**. The Linux desktop stream is proxied through the same private Sand site connection. Sand starts the desktop container through Docker Compose.

For local development, Docker and Docker Compose are required. Run:

```sh
npm start
```

Then visit `http://127.0.0.1:3001`. Sand binds to loopback outside Codespaces. The full Linux desktop loads directly in the page.

## Linux Desktop

- The Linux desktop uses XFCE and includes Google Chrome Stable, Chromium, Mousepad (a simple text editor), Git, Node.js/npm, Python, build tools, curl, jq, ripgrep, and archive utilities.
- Launch Google Chrome from its **Google Chrome** desktop icon or the Applications menu; Chromium is also available in the Applications menu. Chrome is installed in the desktop image, and its desktop icon is restored automatically on every container start. Use a browser to download software; for packages in Ubuntu's repositories, open the desktop Terminal and run `sudo apt update` followed by `sudo apt install <package>`. Install software only from sources you trust.
- On x86-64, Wine is installed for compatible Windows programs. In the Terminal, run `wine ~/Downloads/installer.exe` to try an installer. Compatibility varies; Wine is not Windows, and some programs will not run.
- Desktop settings, browser profiles, and files under `/config` (including Desktop, Documents, and Downloads) persist in the Docker Compose `linux-desktop-config` volume across desktop container restarts and recreations. The volume is separate from the Git workspace and is retained only while the Codespace's Docker storage is retained; back up important files before deleting the Codespace or its Docker volumes.
- To reduce streaming load and input lag, the remote desktop starts at 30 FPS without reducing its resolution. In the desktop's Selkies settings, adjust Frames per second from 15 to 60 to suit your connection. Higher frame rates use more CPU and bandwidth; network latency in the Codespaces tunnel cannot be eliminated by this setting.
- Sand's previous web-only Browser, Files, Notes, and launcher are no longer part of the page; use the Linux desktop's own applications instead.
- The old **Sand: Back up profile** and **Sand: Restore profile** tasks do not back up the Linux desktop container.

## Isolation And Limits

- The Linux desktop is a container, not a virtual machine: it has its own filesystem but shares the Codespace host kernel. Its terminal has administrator access inside that container; this does not grant administrator access to the Codespace host.
- Chrome runs without its browser sandbox because this Codespace does not permit the namespaces Chrome needs. The outer desktop container still isolates it from the Codespace host, but a compromised browser could access files and privileges inside the desktop container. Browse only sites you trust, and keep the Codespaces port private.
- This Linux Codespace cannot be converted into a real Windows desktop. Running genuine Windows requires a separate, licensed Windows VM/host and a remote-desktop service; this Codespace has neither a Windows host nor `/dev/kvm`. A Windows-like XFCE theme would only change the appearance, not the operating system.
- Do not expose the Sand Codespaces port publicly. Anyone who can use the Linux desktop can control that container.
- This cannot hide the desktop from screen-recording software or monitoring on the computer or Codespace host. Websites opened in the Linux desktop's browser still receive requests and may observe your network address.

The optional Electron app (`npm run desktop`) remains separate from Sand Desktop.
