#define AppName "Context Capsule"
#define AppVersion "0.1.0"
#define HostName "com.context_capsule.host"
#define ExtensionId "oaaidckgoilmkbkclbibiibofjdffkjo"

[Setup]
AppId={{6B94A88D-1E90-4B7D-A792-F6F21E80A60D}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\ContextCapsule
DefaultGroupName={#AppName}
OutputBaseFilename=context-capsule-setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
Source: "..\..\dist\context_capsule_host.exe"; DestDir: "{app}\host"; Flags: ignoreversion
Source: "..\..\extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\demo.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\native-hosts\{#HostName}.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\native-hosts\{#HostName}.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\native-hosts\{#HostName}.json"; Flags: uninsdeletekey

[Run]
Filename: "{app}\extension"; Description: "Open extension folder"; Flags: postinstall shellexec skipifsilent

[Code]
function JsonEscape(Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ManifestDir: String;
  ManifestPath: String;
  HostPath: String;
  Json: String;
begin
  if CurStep = ssPostInstall then
  begin
    ManifestDir := ExpandConstant('{app}\native-hosts');
    ManifestPath := ManifestDir + '\{#HostName}.json';
    HostPath := ExpandConstant('{app}\host\context_capsule_host.exe');
    ForceDirectories(ManifestDir);
    Json :=
      '{' + #13#10 +
      '  "name": "{#HostName}",' + #13#10 +
      '  "description": "Context Capsule native messaging host",' + #13#10 +
      '  "path": "' + JsonEscape(HostPath) + '",' + #13#10 +
      '  "type": "stdio",' + #13#10 +
      '  "allowed_origins": ["chrome-extension://{#ExtensionId}/"]' + #13#10 +
      '}' + #13#10;
    SaveStringToFile(ManifestPath, Json, False);
  end;
end;

