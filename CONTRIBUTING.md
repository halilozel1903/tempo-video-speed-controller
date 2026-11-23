# Contributing to Tempo

Thank you for helping improve Tempo. Contributions should preserve reliable playback control, respect user preferences, and keep the extension lightweight.

## Local setup

1. Fork and clone the repository.
2. Install Node.js 22 or newer, Python 3.9 or newer, and Microsoft Edge.
3. Run `npm ci` to install the development dependencies.
4. Load the repository folder using **Load unpacked** at `edge://extensions`.
5. Run `npm test` to verify the current behavior.

After changing extension code, reload Tempo on the extensions page and refresh the affected video tabs.

## Reporting an issue

Use [GitHub Issues](https://github.com/halilozel1903/tempo-video-speed-controller/issues) and include:

- Your operating system and Microsoft Edge version.
- The Tempo version, selected speed, and whether speed lock is enabled.
- Clear steps to reproduce the issue, with expected and observed behavior.
- A publicly accessible example URL or a minimal HTML example, when possible.
- Whether the video is embedded in an iframe or a custom player, if known.

Remove personal information, authentication details, and private URLs from screenshots and reports. English and Turkish reports are welcome.

## Submitting a pull request

- Keep each PR focused on one behavior or improvement.
- Add a regression test for a playback or settings bug when practical.
- Preserve saved preferences and the enable/disable behavior.
- Avoid runtime dependencies, analytics, and additional extension permissions unless the change has a clear, documented need.
- Explain the behavior change and how you verified it. Include a screenshot when changing the popup.
- Run `npm test` and `npm run package` before submitting.
- Update both README language versions when changing user-facing behavior.

The integration tests use a temporary Edge profile. The included WebM fixture is generated test media and does not contain third-party footage.

## License

By submitting a contribution, you agree that it may be distributed under the project's [MIT License](LICENSE).
