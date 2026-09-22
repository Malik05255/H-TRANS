# H TRANS

H TRANS is a Windows-first Android WhatsApp chat backup and restore application.

## Current MVP

- Windows 10/11
- Android over USB
- Automatic ADB device detection
- WhatsApp and WhatsApp Business
- Chats-only backup
- Photos, videos, voice notes and documents are excluded
- Local `.htrans` backup files
- SHA-256 verification of every embedded chat database
- Real byte-based progress while copying databases from/to Android
- Automatic Safety Backup before restoring over an existing WhatsApp installation
- Safety Backups stored under `Documents\H TRANS\Safety Backups`
- On-device verification after restore
- Windows NSIS installer workflow

## Restore safety model

H TRANS never deletes media. During restore it only replaces files matching:

`msgstore*.crypt*`

inside the selected WhatsApp local `Databases` folder.

If WhatsApp is already installed, H TRANS requires a valid current local msgstore backup and creates a verified Safety Backup on the PC before changing anything. If no current msgstore exists, restore is blocked rather than risking the user's existing chats.

If WhatsApp is not installed, H TRANS can prepare the local encrypted backup files in fresh-restore mode.

After file restoration, WhatsApp still controls its own account verification and local-backup import flow.

## Stack

- Tauri 2
- React + TypeScript
- Rust
- Android Platform Tools / ADB

## Windows builds

The `Windows Installer` GitHub Actions workflow downloads the current official Android Platform Tools during CI and bundles the required ADB runtime files into the H TRANS installer. Public redistribution should be reviewed against the applicable Android SDK / Platform Tools license before a production release.
