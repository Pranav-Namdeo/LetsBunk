; LetsBunk Admin Panel - Enhanced Installer Script
; This script provides additional customization for the NSIS installer

; Custom macros for installation
!macro customInstall
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\LetsBunk Admin.lnk" "$INSTDIR\LetsBunk Admin.exe" "" "$INSTDIR\LetsBunk Admin.exe" 0
  
  ; Create Start Menu folder and shortcuts
  CreateDirectory "$SMPROGRAMS\LetsBunk"
  CreateShortCut "$SMPROGRAMS\LetsBunk\LetsBunk Admin.lnk" "$INSTDIR\LetsBunk Admin.exe" "" "$INSTDIR\LetsBunk Admin.exe" 0
  CreateShortCut "$SMPROGRAMS\LetsBunk\Uninstall LetsBunk Admin.lnk" "$INSTDIR\Uninstall LetsBunk Admin.exe"
  
  ; Add to Windows Programs and Features
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "DisplayName" "LetsBunk Admin Panel"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "DisplayVersion" "1.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "Publisher" "LetsBunk"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "DisplayIcon" "$INSTDIR\LetsBunk Admin.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "UninstallString" "$INSTDIR\Uninstall LetsBunk Admin.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "HelpLink" "https://github.com/adityasingh03rajput/native-bunk"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin" "NoRepair" 1
!macroend

!macro customUnInstall
  ; Remove shortcuts
  Delete "$DESKTOP\LetsBunk Admin.lnk"
  Delete "$SMPROGRAMS\LetsBunk\LetsBunk Admin.lnk"
  Delete "$SMPROGRAMS\LetsBunk\Uninstall LetsBunk Admin.lnk"
  RMDir "$SMPROGRAMS\LetsBunk"
  
  ; Clean up registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LetsBunk Admin"
!macroend
