# LAModbus

LAModbus is a cross-platform desktop application framework built with Electron, React, and TypeScript. It is designed to help developers quickly create applications related to Modbus communication, device monitoring, or data visualization. The current repository provides a clean and extendable structure with preconfigured development and build workflows.

This project is suitable for creating tools such as Modbus TCP/RTU configuration apps, device dashboards, analysis utilities, or general desktop applications based on Electron.

------------------------------------------------------------
Features
------------------------------------------------------------
- Electron + React integration for building modern desktop apps
- Fully typed codebase powered by TypeScript
- Cross-platform support for Windows, macOS, and Linux
- Clear folder structure for easy expansion
- Build pipelines ready for packaging and distribution

Future extensions may include Modbus RTU/TCP functionality, data visualization modules, device management logic, and more.

------------------------------------------------------------
Installation and Development
------------------------------------------------------------
Requirements:
- Node.js (recommended: latest LTS)
- pnpm (recommended)

Install dependencies:
    pnpm install

Start development mode:
    pnpm dev

------------------------------------------------------------
Build and Packaging
------------------------------------------------------------
To build for specific platforms, use:

Windows:
    pnpm build:win

macOS:
    pnpm build:mac

Linux:
    pnpm build:linux

Packaged application outputs will be placed in the corresponding dist or release folder.

------------------------------------------------------------
Project Structure
------------------------------------------------------------
```
.
├── .github/               GitHub Actions workflows
├── .vscode/               Editor configuration
├── build/                 Build configuration files
├── resources/             Application resources
├── src/                   Source code (Electron + React)
├── package.json           Project configuration
├── tsconfig.json          TypeScript configuration
├── electron-builder.yml   Packaging configuration
└── README.md              Project documentation
```

------------------------------------------------------------
Contribution
------------------------------------------------------------
Pull requests and issues are welcome. Contributions of any kind that improve the project’s structure, documentation, or features are appreciated.

------------------------------------------------------------
License
------------------------------------------------------------
This project is released under the MIT License. See the LICENSE file for details.
