; CV Ferret — Inno Setup installer script
; Requires Inno Setup 6: https://jrsoftware.org/isinfo.php
;
; Before compiling:
;   1. Run "npm run package:win" in the project root to build release/
;   2. Open this file in Inno Setup and click Build → Compile
;   3. Output: installer\Output\Setup-CV-Ferret.exe
;
; Icon: place a multi-size .ico file at installer\icon.ico before compiling.
;   The icon is also embedded in the exe via pkg (see package.json package:win script).
;   To create icon.ico: export images\new_logo_B_small.svg as PNG, then convert
;   to ICO with sizes 256, 48, 32, 16 using cloudconvert.com or GIMP.

#define AppName      "CV Ferret"
#define AppVersion   "1.0.0"
#define AppPublisher "Elina McCafferty"
#define AppURL       "https://github.com/ElinaMcC/cv-builder"
#define AppExe       "cv-ferret.exe"

[Setup]
AppId={{A3F2B8C1-4D7E-4F9A-B2C3-D8E1F5A6B7C8}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
DefaultDirName={localappdata}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=Setup-CV-Ferret
SetupIconFile=icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
; Install to per-user AppData — no admin rights required
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
; Main executable
Source: "..\release\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
; Frontend static files — must stay in a dist\ subfolder alongside the exe
Source: "..\release\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
; App icon — installed alongside the exe so shortcuts can reference it directly
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\{#AppExe}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}";     Filename: "{app}\{#AppExe}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Run]
; Offer to launch the app immediately after install
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName}"; \
  Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove the dist folder on uninstall (not covered by standard uninstall)
Type: filesandordirs; Name: "{app}\dist"
