# Third-party software

H TRANS uses the official **scrcpy server 3.3.4** from Genymobile for Android screen capture transport.

- Project: https://github.com/Genymobile/scrcpy
- License: Apache License 2.0
- Artifact: scrcpy-server-v3.3.4
- SHA-256: 8588238c9a5a00aa542906b6ec7e6d5541d9ffb9b5d0f6e1bc0e365e2303079e
- The official server is redistributed unmodified.

H TRANS decodes H.264 locally using the **openh264** Rust crate, which builds Cisco OpenH264 sources.

H TRANS encodes decoded preview frames as JPEG using the **jpeg-encoder** Rust crate.

H TRANS also bundles Google's official Android SDK Platform-Tools for ADB connectivity.
